import type { SupabaseClient } from "@supabase/supabase-js"
import type { InventarioArea, InventarioCategoria, InstalacionAlmacenamiento } from "@/types/database"

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

// Ítem mínimo que necesita un selector de producto (ProductoCombobox) — lo
// que devuelve el alta rápida de ItemFormDialog al crear uno nuevo.
export interface InventarioItemOption { id: string; descripcion: string; clase_imo: string | null; nu: string | null }

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
  const { data, error } = await supabase
    .from("clientes")
    .select("stock_compartido_con")
    .eq("id", clienteId)
    .single()
  if (error) { console.error("[resolveEffectiveClienteId] error:", clienteId, error); return clienteId }
  return data?.stock_compartido_con ?? clienteId
}
