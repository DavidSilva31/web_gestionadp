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

export interface BillingRow { label: string; qty: number; unit: string; tarifa: number; totalUF: number }
export interface BillingResult {
  rows:     BillingRow[]
  totalUF:  number
  totalCLP: number
  finalUF:  number
  finalCLP: number
  hasMin:   boolean
}

function pad(n: number) { return String(n).padStart(2, "0") }

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export function computeHES(movs: MovRaw[], year: number, month: number, tarifaAlmacenaje: number): HesResult {
  const periodStart = `${year}-${pad(month + 1)}-01`
  const periodEndDay = daysInMonth(year, month)

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
    if (d >= periodStart && d <= `${year}-${pad(month + 1)}-${pad(periodEndDay)}`) {
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(m)
    }
  }

  let palletDays = 0
  let totalIngresos = 0
  let totalDespachos = 0
  const dailyLog: DayEntry[] = []

  for (let day = 1; day <= periodEndDay; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
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
  const addRow = (label: string, qty: number, unit: string, t: number | null) => {
    if (!t || qty === 0) return
    rows.push({ label, qty, unit, tarifa: t, totalUF: qty * t })
  }

  addRow("Almacenaje pallets", hes.palletDays, "pallet-días", tarifa.tarifa_almacenaje_uf)
  addRow("Ingreso pallets a bodega", hes.totalIngresos, "pallets", tarifa.tarifa_inout_uf)
  addRow("Salida pallets desde bodega", hes.totalDespachos, "pallets", tarifa.tarifa_inout_uf)

  for (const srv of servicios) {
    const sel = servicioSeleccion[srv.id]
    if (!(sel?.checked ?? true)) continue
    const qty = sel?.cantidad ?? 0
    if (qty > 0 && srv.tarifa_uf) {
      addRow(srv.nombre, qty, srv.unidad, srv.tarifa_uf)
    }
  }

  const totalUF  = rows.reduce((s, r) => s + r.totalUF, 0)
  const minUF    = tarifa.facturacion_minima_uf ?? 0
  const finalUF  = Math.max(totalUF, minUF)

  return { rows, totalUF, totalCLP: totalUF * ufValue, finalUF, finalCLP: finalUF * ufValue, hasMin: finalUF > totalUF }
}
