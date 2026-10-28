import type { BodegajeItemFormData } from "@/components/reports/report-form-types"

// Picking: lista de lo que un cliente va a retirar, preparada antes del report. Solo precarga (no mueve stock):
// el stock se descuenta cuando el report se despacha.

export const ESTADOS_PICKING = ["pendiente", "en_report", "despachado", "anulado"] as const
export type EstadoPicking = (typeof ESTADOS_PICKING)[number]

export const ETIQUETA_ESTADO_PICKING: Record<EstadoPicking, string> = {
  pendiente: "Pendiente", en_report: "En report", despachado: "Despachado", anulado: "Anulado",
}

export function estadoPickingClase(estado: string): string {
  switch (estado) {
    case "pendiente":  return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    case "en_report":  return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    case "despachado": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    default:           return "bg-muted text-muted-foreground"
  }
}

// Una línea de picking (tal como se guarda en picking_lineas).
export type LineaPicking = {
  inventario_item_id: string | null
  producto: string
  codigo: string | null
  clase_imo: string | null
  nu: string | null
  bodega: string | null
  numero_pallet: string | null
  rack: string | null
  lote: string | null
  peso_neto: number | null
  posiciones: number | null
  unidades: number | null
}

// Lo que hay en stock, por producto y lote (y pallet/rack en UTI): base para elegir qué pickear.
export type LineaDisponible = {
  key: string
  itemId: string
  producto: string
  codigo: string | null
  claseImo: string | null
  nu: string | null
  bodega: string | null
  pallet: string | null
  rack: string | null
  lote: string | null
  peso: number | null
  posiciones: number
  unidades: number
}

type Mov = {
  inventario_item_id: string | null; carga: string | null; tipo: string
  posiciones: number | null; unidades: number | null; lote: string | null
  numero_pallet: string | null; rack: string | null; peso_envase: number | null; bodega: string | null; fecha: string
}
type Item = { id: string; descripcion: string; codigo: string | null; clase_imo: string | null; nu: string | null }

const t = (v: string | null | undefined) => (v ?? "").trim()

// Identifica una línea de stock: UTI por producto + pallet + lote; el resto por producto + lote + peso.
export function claveLinea(itemId: string, pallet: string | null, lote: string | null, peso: number | null, uti: boolean): string {
  return uti ? `${itemId}|${t(pallet)}|${t(lote)}` : `${itemId}|${t(lote)}|${peso ?? ""}`
}

// Stock por línea = ingresos − despachos. Los movimientos que genera el despacho de un report no traen
// inventario_item_id (ver report-form-widgets.useMovimientosProducto), así que se asignan al producto por
// su nombre (`carga`). UTI Chile trabaja por pallet (producto + pallet + lote); el resto por producto + lote + peso.
export function lineasDisponibles(movs: Mov[], items: Item[], uti: boolean): LineaDisponible[] {
  const porId = new Map(items.map(i => [i.id, i]))
  const porNombre = new Map(items.map(i => [t(i.descripcion).toLowerCase(), i]))
  const mapa = new Map<string, LineaDisponible>()
  for (const m of [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const item = (m.inventario_item_id && porId.get(m.inventario_item_id)) || porNombre.get(t(m.carga).toLowerCase())
    if (!item) continue
    const key = claveLinea(item.id, m.numero_pallet, m.lote, m.peso_envase, uti)
    const l = mapa.get(key) ?? {
      key, itemId: item.id, producto: item.descripcion, codigo: item.codigo, claseImo: item.clase_imo, nu: item.nu,
      bodega: null, pallet: t(m.numero_pallet) || null, rack: null, lote: t(m.lote) || null,
      peso: m.peso_envase != null ? Number(m.peso_envase) : null, posiciones: 0, unidades: 0,
    }
    const signo = m.tipo === "ingreso" ? 1 : -1
    l.posiciones += signo * Number(m.posiciones ?? 0)
    l.unidades += signo * Number(m.unidades ?? 0)
    if (t(m.rack)) l.rack = t(m.rack)
    if (t(m.bodega)) l.bodega = t(m.bodega)
    mapa.set(key, l)
  }
  return [...mapa.values()]
    .filter(l => l.unidades > 0 || l.posiciones > 0)
    .sort((a, b) => a.producto.localeCompare(b.producto) || (a.pallet ?? "").localeCompare(b.pallet ?? "", undefined, { numeric: true }) || (a.lote ?? "").localeCompare(b.lote ?? ""))
}

// Lista pegada (SKU, N° de pallet o lote; uno por línea o separados por coma/espacio): devuelve las líneas
// que coinciden y los códigos que no se encontraron. Un SKU marca todas las líneas de ese producto.
export function marcarPorLista(texto: string, lineas: LineaDisponible[]): { keys: string[]; noEncontrados: string[] } {
  const codigos = [...new Set(texto.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))]
  const keys = new Set<string>()
  const noEncontrados: string[] = []
  for (const c of codigos) {
    const q = c.toLowerCase()
    const coinciden = lineas.filter(l => t(l.codigo).toLowerCase() === q || t(l.pallet).toLowerCase() === q || t(l.lote).toLowerCase() === q)
    if (coinciden.length === 0) noEncontrados.push(c)
    for (const l of coinciden) keys.add(l.key)
  }
  return { keys: [...keys], noEncontrados }
}

// Línea de picking → producto de Bodegaje del report. UTI no usa posiciones (se calculan solas).
export function lineaABodegaje(
  l: LineaPicking, uti: boolean, tarifaId: (claseImo: string | null) => string,
): Partial<BodegajeItemFormData> {
  return {
    sec3_inventario_item_id: l.inventario_item_id ?? "",
    sec3_producto: l.producto,
    sec3_clase_imo: l.clase_imo ?? "",
    sec3_nu: l.nu ?? "",
    sec3_numero_bodega: l.bodega ?? "",
    sec3_numero_pallet: l.numero_pallet ?? "",
    sec3_rack: l.rack ?? "",
    sec3_numero_pallets: !uti && l.posiciones != null ? String(l.posiciones) : "",
    sec3_numero_unidades: l.unidades != null ? String(l.unidades) : "",
    sec3_lote: l.lote ?? "",
    sec3_peso_neto: l.peso_neto != null ? String(l.peso_neto) : "",
    tarifa_cliente_id: tarifaId(l.clase_imo),
  }
}
