import type { SupabaseClient } from "@supabase/supabase-js"
import type { InventarioArea, InventarioCategoria, InstalacionAlmacenamiento } from "@/types/database"
import { consultaCacheada, sembrarCache } from "@/lib/cache-consultas"

// Compartido entre /inventario (dialog de alta/edición) y el alta rápida de
// producto nuevo desde Bodegaje en un report — un solo lugar para no
// desincronizar las opciones entre ambos formularios.
export const INVENTARIO_CATEGORIAS: InventarioCategoria[] = [
  "Contenedor IMO", "Isotanque", "Residuo peligroso", "Carga general",
]
export const INVENTARIO_UNIDADES = ["unidad", "pallets", "contenedor", "isotanque", "kg", "ton"]

// Tipos de envase del Kardex (Detalle de /inventario) — mismo catálogo que el
// CHECK de movimientos.tipo_envase (migration_kardex_inventario.sql).
export const TIPOS_ENVASE = [
  "Tambor", "Bidón", "IBC", "Saco", "Caja", "Pallet", "Granel",
  "Maxisaco", "Tineta", "Cilindro", "Cuñete", "Otro",
] as const

// Solo para los movimientos del producto "CONTENEDORES" (20ft/40ft con Almacenaje
// Full/Vacío): van aparte de TIPOS_ENVASE para no aparecer al crear productos.
export const ENVASES_CONTENEDOR = ["Full", "Vacío"] as const

// Ítem mínimo que necesita un selector de producto (ProductoCombobox) — lo
// que devuelve el alta rápida de ItemFormDialog al crear uno nuevo.
export interface InventarioItemOption {
  id: string; descripcion: string; clase_imo: string | null; nu: string | null
  codigo?: string | null; unidad?: string | null
}

// Cómo se muestra un producto al elegirlo en un report: "{producto} ({envase}) {sku}".
// Dos productos pueden llamarse igual y distinguirse solo por envase y SKU
// (ej. PHILMPLUS 5065 en IBC y en Tambor), así que se muestran siempre.
//  - sku: el código del ítem; si no tiene, el del último movimiento (extra.sku).
//  - envase: el sufijo "(IBC)" del nombre, si lo trae; si no, la unidad del ítem
//    cuando es un envase real; si no, el envase del último movimiento (extra.envase).
//  - nombre: sin el "(envase)" ni el "(SKU)" finales, que se muestran aparte.
export function partesProducto(
  item: { descripcion: string; codigo?: string | null; unidad?: string | null },
  extra?: { sku?: string | null; envase?: string | null },
): { nombre: string; envase: string | null; sku: string | null } {
  const sku = item.codigo?.trim() || extra?.sku?.trim() || null
  const comoEnvase = (v?: string | null) => TIPOS_ENVASE.find(t => t.toUpperCase() === (v ?? "").trim().toUpperCase())
  const sufijo = item.descripcion.match(/\(([^()]*)\)\s*$/)
  const envase = comoEnvase(sufijo?.[1]) ?? comoEnvase(item.unidad) ?? comoEnvase(extra?.envase) ?? null
  let nombre = stripEnvaseSuffix(item.descripcion)
  const m = nombre.match(/\s*\(([^()]*)\)\s*$/)
  if (m && sku && m[1].trim().toUpperCase() === sku.toUpperCase()) nombre = nombre.slice(0, m.index).trim()
  return { nombre, envase, sku }
}

// El nombre de un ítem suele incluir el envase entre paréntesis (ej.
// "BENCINA (TAMBOR)") — pero movimientos.carga es lo que agrupa Detalle por
// producto, y si ahí queda el envase pegado, un rename del ítem o un envase
// distinto en otro movimiento parte el mismo producto en dos grupos. Se usa
// al armar `carga` para un movimiento nuevo (nunca en inventario_items.descripcion,
// que sí debe seguir mostrando el envase). Espejo de strip_envase_suffix()
// en la base (migration_movimientos_carga_sin_envase.sql).
const ENVASES_UPPER = TIPOS_ENVASE.map(t => t.toUpperCase())

export function stripEnvaseSuffix(nombre: string): string {
  const m = nombre.match(/\s*\(([^)]*)\)\s*$/)
  if (m && ENVASES_UPPER.includes(m[1].trim().toUpperCase())) {
    return nombre.slice(0, m.index).trim()
  }
  return nombre
}

// El enum Área quedó obsoleto frente al catálogo real de instalaciones — se
// sigue completando (columna NOT NULL) pero se infiere desde la instalación
// elegida en vez de pedírselo al usuario dos veces.
export function inferInventarioArea(inst: InstalacionAlmacenamiento | undefined): InventarioArea {
  if (!inst) return "Bodega General"
  if (inst.codigo.toUpperCase().includes("RESPEL")) return "Zona RESPEL"
  if (inst.tipo === "Patio") return "Zona Isotanques"
  return "Bodega IMO"
}

// Recalcula peso_ton = peso_unitario_ton * stock_actual tras un cambio de
// stock (movimiento o despacho de report). Sin esto, la ocupación en
// /instalaciones y el dashboard quedan mostrando el peso viejo aunque el
// stock real ya cambió — peso_unitario_ton es el ancla fija por ítem
// (peso_ton inicial / stock_actual inicial), stock_actual es lo único que
// se mueve con cada movimiento.
export async function syncPesoTon(supabase: SupabaseClient, itemId: string) {
  const { data, error } = await supabase
    .from("inventario_items")
    .select("peso_unitario_ton, stock_actual")
    .eq("id", itemId)
    .single()
  if (error) { console.error("[syncPesoTon] error leyendo ítem:", itemId, error); return }
  if (!data || data.peso_unitario_ton == null) return

  const nuevoPeso = Math.round(data.peso_unitario_ton * data.stock_actual * 1000) / 1000
  const { error: updateError } = await supabase.from("inventario_items").update({ peso_ton: nuevoPeso }).eq("id", itemId)
  if (updateError) console.error("[syncPesoTon] error actualizando peso_ton:", itemId, updateError)
}

// Resuelve a qué cliente pertenece REALMENTE el inventario que hay que
// mostrar/usar — si el cliente comparte pool de stock con otro
// (clientes.stock_compartido_con), devuelve el dueño real; si no, se
// devuelve a sí mismo. Único punto de esta regla — reusar acá siempre que
// se filtre inventario_items por cliente_id.
export async function resolveEffectiveClienteId(supabase: SupabaseClient, clienteId: string): Promise<string> {
  // Se pide una vez por cliente (varias pantallas y selectores lo necesitan, y cada
  // consulta cuesta ~300 ms); el vínculo de stock compartido casi nunca cambia.
  const { data, error } = await consultaCacheada(`efectivo:${clienteId}`, () => supabase
    .from("clientes")
    .select("stock_compartido_con")
    .eq("id", clienteId)
    .single(), 10 * 60 * 1000)
  if (error) { console.error("[resolveEffectiveClienteId] error:", clienteId, error); return clienteId }
  return data?.stock_compartido_con ?? clienteId
}

// Cuando una pantalla ya trajo la lista de clientes, el dato del stock compartido ya
// está a mano: se deja en la caché para no pedirlo de nuevo cliente por cliente.
export function sembrarClienteEfectivo(clientes: { id: string; stock_compartido_con: string | null }[]) {
  for (const c of clientes) {
    sembrarCache(`efectivo:${c.id}`, { data: { stock_compartido_con: c.stock_compartido_con }, error: null })
  }
}
