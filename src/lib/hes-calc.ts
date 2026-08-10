// Lógica de cálculo del HES (Hoja de Estado de Servicio) — extraída como
// funciones puras para poder recalcularse tanto en el cliente (vista previa
// en vivo mientras se edita) como en el servidor (/api/hes/export), que
// nunca debe confiar en los totales que le mande el navegador.
import type { TarifaCliente, ServicioCliente } from "@/types/database"

export interface MovRaw {
  id: string; numero: number; tipo: string; unidades: number | null
  operador: string | null; fecha: string; report_id: string | null
  reports: { numero: number; sec1_guia_numero: string | null; sec3_numero_guia: string | null } | null
}

export interface DayEntry {
  fecha:       string
  operador:    string
  guias_in:    string
  pallets_in:  number
  reports_in:  string
  guias_out:   string
  pallets_out: number
  reports_out: string
  stock:       number
  tarifa_dia:  number
}

export interface HesResult {
  palletDays:    number
  totalIngresos: number
  totalDespachos: number
  dailyLog:      DayEntry[]
}

export interface BillingRow {
  label: string; qty: number; unit: string
  moneda:   "UF" | "CLP"
  tarifa:   number   // en su moneda nativa (moneda arriba)
  totalCLP: number   // siempre en pesos — fuente de verdad de la fila
}
export interface BillingResult {
  rows:     BillingRow[]
  totalCLP: number
  totalUF:  number  // derivado (totalCLP / ufValue) — informativo, no autoritativo si hay filas en CLP
  finalCLP: number
  finalUF:  number
  hasMin:   boolean
}

function pad(n: number) { return String(n).padStart(2, "0") }

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function toISODate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function nextDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// Período de facturación de un cliente para el mes/año seleccionado.
// diaCorte = 1 (default): mes calendario de siempre (1 al último día).
// diaCorte > 1: ciclo rodante — "Julio" es el período que va del `diaCorte`
// de junio al (diaCorte - 1) de julio (ej. PROQUIMIN: 26 jun a 25 jul).
export function getPeriodRange(year: number, month: number, diaCorte: number): { start: string; end: string } {
  const corte = diaCorte && diaCorte > 1 ? diaCorte : 1
  if (corte === 1) {
    return { start: `${year}-${pad(month + 1)}-01`, end: `${year}-${pad(month + 1)}-${pad(daysInMonth(year, month))}` }
  }
  return { start: toISODate(new Date(year, month - 1, corte)), end: toISODate(new Date(year, month, corte - 1)) }
}

export function computeHES(movs: MovRaw[], periodStart: string, periodEnd: string, tarifaAlmacenaje: number): HesResult {
  // Starting stock = net ingresos - despachos before the period
  let stock = 0
  for (const m of movs) {
    if (m.fecha < periodStart) {
      stock += m.tipo === "ingreso" ? (m.unidades ?? 0) : -(m.unidades ?? 0)
    }
  }

  // Build daily log for the period
  const byDate = new Map<string, MovRaw[]>()
  for (const m of movs) {
    const d = m.fecha.slice(0, 10)
    if (d >= periodStart && d <= periodEnd) {
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(m)
    }
  }

  let palletDays = 0
  let totalIngresos = 0
  let totalDespachos = 0
  const dailyLog: DayEntry[] = []

  for (let dateStr = periodStart; dateStr <= periodEnd; dateStr = nextDate(dateStr)) {
    const dayMovs = byDate.get(dateStr) ?? []

    const ins  = dayMovs.filter(m => m.tipo === "ingreso")
    const outs = dayMovs.filter(m => m.tipo === "despacho")

    const palletsIn  = ins.reduce((s, m)  => s + (m.unidades ?? 0), 0)
    const palletsOut = outs.reduce((s, m) => s + (m.unidades ?? 0), 0)

    stock += palletsIn - palletsOut
    palletDays += Math.max(stock, 0)
    totalIngresos  += palletsIn
    totalDespachos += palletsOut

    const guiasIn  = ins.flatMap(m => m.reports?.sec1_guia_numero ? [m.reports.sec1_guia_numero] : m.reports?.sec3_numero_guia ? [m.reports.sec3_numero_guia] : []).join(" ")
    const guiasOut = outs.flatMap(m => m.reports?.sec1_guia_numero ? [m.reports.sec1_guia_numero] : m.reports?.sec3_numero_guia ? [m.reports.sec3_numero_guia] : []).join(" ")
    const repsIn   = ins.map(m => m.reports?.numero ? `REP-${String(m.reports.numero).padStart(3,"0")}` : `MOV-${String(m.numero).padStart(3,"0")}`).join(" ")
    const repsOut  = outs.map(m => m.reports?.numero ? `REP-${String(m.reports.numero).padStart(3,"0")}` : `MOV-${String(m.numero).padStart(3,"0")}`).join(" ")
    const operador = dayMovs[0]?.operador ?? ""

    dailyLog.push({
      fecha: dateStr, operador,
      guias_in: guiasIn, pallets_in: palletsIn, reports_in: repsIn,
      guias_out: guiasOut, pallets_out: palletsOut, reports_out: repsOut,
      stock: Math.max(stock, 0),
      tarifa_dia: Math.max(stock, 0) * tarifaAlmacenaje,
    })
  }

  return { palletDays, totalIngresos, totalDespachos, dailyLog }
}

// servicioSeleccion: cantidad ingresada por servicio adicional (input real del
// usuario, no un total fabricable) — id -> { cantidad, checked }.
export function computeBilling(
  hes: HesResult,
  tarifa: TarifaCliente,
  ufValue: number,
  servicios: ServicioCliente[],
  servicioSeleccion: Record<string, { cantidad: number; checked: boolean }>
): BillingResult {
  const rows: BillingRow[] = []
  // Algunos clientes (ej. BASF) facturan en pesos fijos, no indexados a UF.
  // La columna "moneda" de cada fila (tarifas_cliente / servicios_cliente) es
  // la que manda — no se infiere de qué campo numérico viene poblado, porque
  // un registro puede tener valores viejos en la moneda que ya no usa (ej. si
  // alguien cambió de UF a CLP desde el formulario) y usar "cuál campo tiene
  // dato" leería ese valor obsoleto en vez de ignorarlo.
  const addRow = (label: string, qty: number, unit: string, moneda: "UF" | "CLP", t: number | null) => {
    if (!t || qty === 0) return
    const totalCLP = moneda === "CLP" ? qty * t : qty * t * ufValue
    rows.push({ label, qty, unit, moneda, tarifa: t, totalCLP })
  }

  const tarifaMoneda = tarifa.moneda === "CLP" ? "CLP" : "UF"
  addRow("Almacenaje pallets", hes.palletDays, "pallet-días", tarifaMoneda,
    tarifaMoneda === "CLP" ? tarifa.tarifa_almacenaje_clp : tarifa.tarifa_almacenaje_uf)
  addRow("Ingreso pallets a bodega", hes.totalIngresos, "pallets", tarifaMoneda,
    tarifaMoneda === "CLP" ? tarifa.tarifa_inout_clp : tarifa.tarifa_inout_uf)
  addRow("Salida pallets desde bodega", hes.totalDespachos, "pallets", tarifaMoneda,
    tarifaMoneda === "CLP" ? tarifa.tarifa_inout_clp : tarifa.tarifa_inout_uf)

  for (const srv of servicios) {
    const sel = servicioSeleccion[srv.id]
    if (!(sel?.checked ?? true)) continue
    const qty = sel?.cantidad ?? 0
    if (qty <= 0) continue
    const srvMoneda = srv.moneda === "CLP" ? "CLP" : "UF"
    addRow(srv.nombre, qty, srv.unidad, srvMoneda, srvMoneda === "CLP" ? srv.tarifa_clp : srv.tarifa_uf)
  }

  const totalCLP = rows.reduce((s, r) => s + r.totalCLP, 0)
  const totalUF  = ufValue > 0 ? totalCLP / ufValue : 0
  const minCLP   = (tarifa.facturacion_minima_uf ?? 0) * ufValue
  const finalCLP = Math.max(totalCLP, minCLP)
  const finalUF  = ufValue > 0 ? finalCLP / ufValue : 0

  return { rows, totalCLP, totalUF, finalCLP, finalUF, hasMin: finalCLP > totalCLP }
}
