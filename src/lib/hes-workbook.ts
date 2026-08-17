// Lógica de generación del HES compartida entre /api/hes/export (descarga
// directa del Excel) y /api/hes/send-email (mismo Excel + PDF, como adjuntos
// de un correo) — para no duplicar la construcción del workbook en dos rutas.
import ExcelJS from "exceljs"
import path from "path"
import type { createServerSupabaseClient } from "@/lib/supabase-server"
import { computeHES, computeBilling, type MovRaw, type BillingRow, type DayEntry, type HesResult, type BillingResult } from "@/lib/hes-calc"
import type { TarifaCliente, ServicioCliente } from "@/types/database"

export type SupabaseSrv = Awaited<ReturnType<typeof createServerSupabaseClient>>

export const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                       "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

function pad(n: number) { return String(n).padStart(2, "0") }

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  HDR_BG:   "FFDCE6F1",
  HDR_TXT:  "FF1F3864",
  TOT_BG:   "FFBDD7EE",
  WHITE:    "FFFFFFFF",
  TEXT:     "FF000000",
  GREY_BD:  "FFAAAAAA",
  AMBER_BG: "FFFFF8E1",
  AMBER_TXT:"FF7B3C00",
  BLUE_TXT: "FF1F3864",
  LINK_TXT: "FF0563C1",
}

interface StyleOpts {
  bg?: string; fc?: string; bold?: boolean; size?: number; italic?: boolean
  ha?: ExcelJS.Alignment["horizontal"]; va?: ExcelJS.Alignment["vertical"]
  fmt?: string; wrap?: boolean; bs?: ExcelJS.BorderStyle; bc?: string
  noBorder?: boolean; underline?: boolean
}

function st(cell: ExcelJS.Cell, o: StyleOpts = {}) {
  const {
    bg = C.WHITE, fc = C.TEXT, bold = false, size = 9, italic = false,
    ha = "left", va = "middle", fmt, wrap = false, underline = false,
    bs = "thin", bc = C.GREY_BD, noBorder = false,
  } = o
  const brd = noBorder ? {} : {
    border: {
      top:    { style: bs, color: { argb: bc } } as ExcelJS.Border,
      bottom: { style: bs, color: { argb: bc } } as ExcelJS.Border,
      left:   { style: bs, color: { argb: bc } } as ExcelJS.Border,
      right:  { style: bs, color: { argb: bc } } as ExcelJS.Border,
    },
  }
  cell.style = {
    font:      { bold, italic, size, color: { argb: fc }, name: "Calibri", underline },
    fill:      { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
    alignment: { horizontal: ha, vertical: va, wrapText: wrap },
    ...brd,
  }
  if (fmt) cell.numFmt = fmt
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ServicioExport {
  id: string; nombre: string; moneda: "UF" | "CLP"
  tarifa_uf: number; tarifa_clp: number; unidad: string; cantidad: number
}

export interface ClienteExport { nombre: string; rut: string | null; emails: string[]; contacto: string | null }

export type ServicioSeleccion = Record<string, { cantidad: number; checked: boolean }>

export interface TarifaResultado { tarifa: TarifaCliente; hes: HesResult; billing: BillingResult }

// ── Cliente (nombre/rut/emails/contacto + día de corte de facturación) ─────
export async function loadCliente(supabase: SupabaseSrv, clienteId: string) {
  const { data: row, error } = await supabase
    .from("clientes").select("nombre, rut, emails, contacto, dia_corte_facturacion").eq("id", clienteId).single()
  if (error || !row) return null
  const cliente: ClienteExport = {
    nombre: row.nombre, rut: row.rut, emails: row.emails ?? [], contacto: row.contacto,
  }
  return { cliente, diaCorte: row.dia_corte_facturacion ?? 1 }
}

// ── Trae tarifa + movimientos (filtrados por tarifa_cliente_id si el cliente
// tiene más de una) + hes/billing calculados para una sola tarifa ───────────
export async function loadTarifaData(
  supabase: SupabaseSrv, clienteId: string, tarifaId: string, period: { start: string; end: string }, ufSafe: number,
  serviciosCliente: ServicioCliente[], servicioSeleccion: ServicioSeleccion, tarifasCount: number
): Promise<TarifaResultado | null> {
  const { data: tarifaRow, error: tarifaErr } = await supabase
    .from("tarifas_cliente").select("*").eq("id", tarifaId).eq("cliente_id", clienteId).single()
  if (tarifaErr || !tarifaRow) return null

  const tarifa = tarifaRow as TarifaCliente
  const [y, m, d] = period.end.split("-").map(Number)
  const nextDay = new Date(y, m - 1, d + 1)
  let movsQuery = supabase
    .from("movimientos")
    .select("id, numero, tipo, unidades, operador, fecha, report_id, reports(numero, sec1_guia_numero, sec3_numero_guia)")
    .eq("cliente_id", clienteId)
    .lt("fecha", nextDay.toISOString())
  movsQuery = tarifasCount > 1
    ? movsQuery.eq("tarifa_cliente_id", tarifaId)
    : movsQuery.or(`tarifa_cliente_id.eq.${tarifaId},tarifa_cliente_id.is.null`)
  const { data: movsRaw } = await movsQuery.order("fecha")

  const movs = (movsRaw ?? []) as unknown as MovRaw[]
  const tarifaAlmacenaje = tarifa.moneda === "CLP" ? (tarifa.tarifa_almacenaje_clp ?? 0) : (tarifa.tarifa_almacenaje_uf ?? 0)
  const hes = computeHES(movs, period.start, period.end, tarifaAlmacenaje)
  const billing = computeBilling(hes, tarifa, ufSafe, serviciosCliente, servicioSeleccion ?? {})

  return { tarifa, hes, billing }
}

export function toServicioExport(serviciosCliente: ServicioCliente[], servicioSeleccion: ServicioSeleccion): ServicioExport[] {
  return serviciosCliente.map(s => ({
    id:         s.id,
    nombre:     s.nombre,
    moneda:     s.moneda === "CLP" ? "CLP" : "UF",
    tarifa_uf:  s.tarifa_uf ?? 0,
    tarifa_clp: s.tarifa_clp ?? 0,
    unidad:     s.unidad,
    cantidad:   servicioSeleccion?.[s.id]?.cantidad ?? 0,
  }))
}

export type HesBuildResult =
  | {
      ok: true
      isUnificado: boolean
      results: TarifaResultado[]
      serviciosCliente: ServicioCliente[]
      srvBilling: BillingResult
    }
  | { ok: false; error: string; status: number }

// ── Carga todo lo necesario (servicios, tarifa(s), movimientos, hes/billing)
// para generar el/los documento(s) de un cliente, en modo simple o unificado ──
export async function buildHesData(
  supabase: SupabaseSrv, clienteId: string, tarifaSel: { tarifaId?: string; tarifaIds?: string[] },
  period: { start: string; end: string }, ufSafe: number, servicioSeleccion: ServicioSeleccion
): Promise<HesBuildResult> {
  const [{ data: serviciosRows }, { count: tarifasCount }] = await Promise.all([
    supabase.from("servicios_cliente").select("*").eq("cliente_id", clienteId).eq("activo", true),
    supabase.from("tarifas_cliente").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId).eq("activo", true),
  ])
  const serviciosCliente = (serviciosRows ?? []) as ServicioCliente[]

  const isUnificado = !!tarifaSel.tarifaIds?.length
  const results: TarifaResultado[] = []

  if (isUnificado) {
    // Los servicios adicionales son un cargo a nivel cliente, no de una tarifa/CI
    // específica — van solo en el resumen general, no se duplican en cada hoja.
    const loaded = await Promise.all(
      tarifaSel.tarifaIds!.map(tarifaId =>
        loadTarifaData(supabase, clienteId, tarifaId, period, ufSafe, [], {}, tarifasCount ?? 0)
      )
    )
    results.push(...loaded.filter((r): r is TarifaResultado => r !== null))
    if (results.length === 0)
      return { ok: false, error: "Ninguna tarifa encontrada o sin permiso para verlas.", status: 404 }
  } else {
    const result = await loadTarifaData(supabase, clienteId, tarifaSel.tarifaId!, period, ufSafe, serviciosCliente, servicioSeleccion, tarifasCount ?? 0)
    if (!result)
      return { ok: false, error: "Tarifa no encontrada o sin permiso para verla.", status: 404 }
    results.push(result)
  }

  const srvBilling = computeBilling(
    { palletDays: 0, totalIngresos: 0, totalDespachos: 0, dailyLog: [] },
    { tarifa_almacenaje_uf: null, tarifa_inout_uf: null, tarifa_almacenaje_clp: null, tarifa_inout_clp: null, moneda: "UF", facturacion_minima_uf: null } as unknown as TarifaCliente,
    ufSafe, isUnificado ? serviciosCliente : [], isUnificado ? servicioSeleccion : {}
  )

  return { ok: true, isUnificado, results, serviciosCliente, srvBilling }
}

// ── Construye el workbook completo (resumen general si aplica + una hoja
// por tarifa) a partir de un HesBuildResult ya cargado ──────────────────────
export function buildWorkbook(
  cliente: ClienteExport, mes: number, anio: number, period: { start: string; end: string }, uf: number,
  built: Extract<HesBuildResult, { ok: true }>, servicioSeleccion: ServicioSeleccion,
  folioNumero?: number | null
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()

  if (built.isUnificado) {
    addResumenGeneralSheet(wb, cliente, mes, anio, built.results, built.srvBilling, folioNumero)
    for (const r of built.results) {
      addTarifaSheet(wb, cliente, r.tarifa, r.hes, r.billing, [], mes, anio, period, uf, folioNumero)
    }
  } else {
    const srvs = toServicioExport(built.serviciosCliente, servicioSeleccion)
    const r = built.results[0]
    addTarifaSheet(wb, cliente, r.tarifa, r.hes, r.billing, srvs, mes, anio, period, uf, folioNumero)
  }

  return wb
}

export function excelBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return wb.xlsx.writeBuffer().then(b => Buffer.from(b))
}

export function excelFilename(clienteNombre: string, mes: number, anio: number) {
  return `HES_${clienteNombre.replace(/[^a-zA-Z0-9]/g, "_")}_${MESES[mes]}_${anio}.xlsx`
}

// ── Hoja "Resumen general" — modo unificado: una fila por CI + servicios + total ──
function addResumenGeneralSheet(
  wb: ExcelJS.Workbook, cliente: ClienteExport, mes: number, anio: number,
  results: TarifaResultado[], srvBilling: BillingResult, folioNumero?: number | null
) {
  const mesTit = `${MESES[mes]} ${anio}`
  const ws = wb.addWorksheet("Resumen general", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  })
  ws.columns = [
    { width: 2 }, { width: 30 }, { width: 16 }, { width: 16 }, { width: 18 },
  ]
  function spacerA(r: ExcelJS.Row) { st(r.getCell("A"), { noBorder: true }) }
  let row = 1

  {
    const r = ws.addRow([]); r.height = 22; spacerA(r)
    r.getCell("B").value = `HES ${cliente.nombre.toUpperCase()} — RESUMEN GENERAL`
    st(r.getCell("B"), { bold: true, size: 13, noBorder: true })
    ws.mergeCells(`B${row}:E${row}`); row++
  }
  {
    const r = ws.addRow([]); r.height = 18; spacerA(r)
    r.getCell("B").value = folioNumero != null ? `${mesTit.toUpperCase()} — N° HES-${String(folioNumero).padStart(6, "0")}` : mesTit.toUpperCase()
    st(r.getCell("B"), { size: 10, noBorder: true }); row++
  }
  { const r = ws.addRow([]); r.height = 10; spacerA(r); row++ }

  {
    const r = ws.addRow([]); r.height = 26; spacerA(r)
    const hdrs: [string, string][] = [["B","Tarifa / Clase"], ["C","Total (UF)"], ["D","Total Neto ($)"]]
    hdrs.forEach(([col, val]) => {
      r.getCell(col).value = val
      st(r.getCell(col), { bg: C.HDR_BG, fc: C.HDR_TXT, bold: true, size: 9, ha: "center", wrap: true })
    })
    row++
  }

  let totalCLP = 0
  for (const { tarifa, billing } of results) {
    const r = ws.addRow([]); r.height = 14; spacerA(r)
    r.getCell("B").value = tarifa.clase_imo ?? tarifa.cotizacion_numero
    r.getCell("C").value = billing.finalUF
    r.getCell("D").value = billing.finalCLP
    st(r.getCell("B"), { size: 9 })
    st(r.getCell("C"), { size: 9, ha: "right", fmt: "0.0000" })
    st(r.getCell("D"), { size: 9, ha: "right", fmt: '"$"#,##0' })
    totalCLP += billing.finalCLP
    row++
  }

  if (srvBilling.rows.length > 0) {
    for (const sr of srvBilling.rows) {
      const r = ws.addRow([]); r.height = 14; spacerA(r)
      r.getCell("B").value = `Servicio: ${sr.label}`
      r.getCell("C").value = sr.moneda === "CLP" ? null : sr.totalCLP / (sr.totalCLP > 0 ? (sr.totalCLP / sr.tarifa) : 1)
      r.getCell("D").value = sr.totalCLP
      st(r.getCell("B"), { size: 9, italic: true })
      st(r.getCell("C"), { size: 9, ha: "right", fmt: "0.0000" })
      st(r.getCell("D"), { size: 9, ha: "right", fmt: '"$"#,##0' })
      totalCLP += sr.totalCLP
      row++
    }
  }

  {
    const r = ws.addRow([]); r.height = 18; spacerA(r)
    r.getCell("B").value = "TOTAL GENERAL"
    st(r.getCell("B"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right" })
    r.getCell("C").value = ""
    st(r.getCell("C"), { bg: C.TOT_BG })
    r.getCell("D").value = totalCLP
    st(r.getCell("D"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right", fmt: '"$"#,##0' })
  }
}

// ── Hoja de detalle de una tarifa (tabla de cobro + log diario) ─────────────
function addTarifaSheet(
  wb: ExcelJS.Workbook, cliente: ClienteExport, tarifa: TarifaCliente, hes: HesResult, billing: BillingResult,
  srvs: ServicioExport[], mes: number, anio: number, period: { start: string; end: string }, uf: number,
  folioNumero?: number | null
) {
  const [, periodEndM, periodEndD] = period.end.split("-").map(Number)
  const mesNom  = MESES[mes].toUpperCase()
  const mesTit  = `${MESES[mes]} ${anio}`
  const isClpTarifa = tarifa.moneda === "CLP"
  const fmtTarifaNum = isClpTarifa ? '"$"#,##0' : "0.0000"
  const tarifaAlmacenaje = isClpTarifa ? (tarifa.tarifa_almacenaje_clp ?? 0) : (tarifa.tarifa_almacenaje_uf ?? 0)
  const tInout  = isClpTarifa ? (tarifa.tarifa_inout_clp ?? 0) : (tarifa.tarifa_inout_uf ?? 0)
  const hoy     = new Date()
  const hoyStr  = `${pad(hoy.getDate())}/${pad(hoy.getMonth() + 1)}/${hoy.getFullYear()}`
  const activeSrvs = srvs.filter(s => s.cantidad > 0 && (s.tarifa_uf > 0 || s.tarifa_clp > 0))

  const baseName = (tarifa.clase_imo || cliente.nombre).replace(/[\\/?*[\]:]/g, "").slice(0, 28)
  let sheetName = baseName || "HES"
  let n = 2
  while (wb.getWorksheet(sheetName)) { sheetName = `${baseName} (${n})`.slice(0, 31); n++ }

  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, orientation: "landscape",
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  })

  const srvCols = activeSrvs.map((_, i) => String.fromCharCode(78 + i)) // N, O, P, Q...
  const totalCol = String.fromCharCode(78 + activeSrvs.length)          // columna Total Neto

  ws.columns = [
    { width: 2  }, // A  ← separador
    { width: 24 }, // B  Fecha / Descripción (tabla de cobro)
    { width: 17 }, // C  Operador
    { width: 17 }, // D  GD Ingreso
    { width: 11 }, // E  Pallets IN
    { width: 18 }, // F  Report IN
    { width: 17 }, // G  GD Salida
    { width: 11 }, // H  Pallets OUT
    { width: 18 }, // I  Report OUT
    { width: 10 }, // J  Stock
    { width: 15 }, // K  Tarifa Almacenaje
    { width: 15 }, // L  Tarifa Ingreso
    { width: 15 }, // M  Tarifa Salida
    ...activeSrvs.map(() => ({ width: 16 as number })),
    { width: 15 }, // Total Neto
  ]

  function spacerA(r: ExcelJS.Row) { st(r.getCell("A"), { noBorder: true }) }

  try {
    const logoPath = path.join(process.cwd(), "public", "adp_logo_hd.jpg")
    const logoId   = wb.addImage({ filename: logoPath, extension: "jpeg" })
    ws.addImage(logoId, { tl: { col: 1, row: 1 }, ext: { width: 200, height: 70 } })
  } catch { /* sin logo — continúa */ }

  let row = ws.rowCount + 1

  // ── BLOQUE 1 — ENCABEZADO ──────────────────────────────────────────────────
  {
    const r = ws.addRow([])
    r.height = 22
    spacerA(r)
    st(r.getCell("B"), { noBorder: true })
    r.getCell("C").value = `HES ${cliente.nombre.toUpperCase()} — ALMACENAJE${tarifa.clase_imo ? ` ${tarifa.clase_imo.toUpperCase()}` : ""}`
    st(r.getCell("C"), { bold: true, size: 13, ha: "center", noBorder: true })
    ws.mergeCells(`C${row}:${totalCol}${row}`)
    row++
  }
  {
    const r2 = ws.addRow([])
    r2.height = 20
    spacerA(r2)
    st(r2.getCell("B"), { noBorder: true })
    r2.getCell("C").value = `${mesNom} DE ${anio}`
    st(r2.getCell("C"), { size: 10, ha: "center", noBorder: true })
    ws.mergeCells(`C${row}:${totalCol}${row}`)
    row++
    for (let i = 0; i < 2; i++) {
      const r = ws.addRow([])
      r.height = 16
      spacerA(r)
      st(r.getCell("B"), { noBorder: true })
      ws.mergeCells(`C${row}:${totalCol}${row}`)
      row++
    }
  }
  { const r = ws.addRow([]); r.height = 8; spacerA(r); row++ }
  {
    const r = ws.addRow([])
    r.height = 17
    spacerA(r)
    r.getCell("B").value = cliente.nombre.toUpperCase()
    st(r.getCell("B"), { bold: true, size: 12, fc: C.BLUE_TXT, underline: true, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }
  {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    r.getCell("B").value = `${mesNom} DE ${anio}`
    st(r.getCell("B"), { size: 10, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }
  { const r = ws.addRow([]); r.height = 6; spacerA(r); row++ }
  {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    r.getCell("B").value = "REF :"
    st(r.getCell("B"), { bold: true, size: 9, noBorder: true })
    const folioSuffix = folioNumero != null ? ` · N° HES-${String(folioNumero).padStart(6, "0")}` : ""
    r.getCell("C").value = `${tarifa.cotizacion_numero} al ${hoyStr}${folioSuffix}`
    st(r.getCell("C"), { size: 9, noBorder: true })
    ws.mergeCells(`C${row}:D${row}`)
    r.getCell("E").value = "Id. Producto"
    st(r.getCell("E"), { bold: true, size: 9, noBorder: true })
    if (tarifa.clase_imo) {
      r.getCell("F").value = `CLASE ${tarifa.clase_imo.toUpperCase()}`
      st(r.getCell("F"), { size: 9, noBorder: true })
    }
    row++
  }
  if (tarifa.clase_imo) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("E").value = tarifa.clase_imo.toUpperCase()
    st(r.getCell("E"), { size: 9, noBorder: true })
    row++
  }
  if (cliente.contacto) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("B").value = `Atención: ${cliente.contacto}`
    st(r.getCell("B"), { size: 9, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }
  if (cliente.emails?.length > 0) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("B").value = cliente.emails.join(" · ")
    st(r.getCell("B"), { size: 9, fc: C.LINK_TXT, underline: true, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }
  { const r = ws.addRow([]); r.height = 10; spacerA(r); row++ }

  // ── BLOQUE 2 — TABLA DE COBRO ────────────────────────────────────────────────
  {
    const r = ws.addRow([])
    r.height = 30
    spacerA(r)
    const hdrs: [string, string, ExcelJS.Alignment["horizontal"]][] = [
      ["B","Descripción",     "center"],
      ["C","Cantidad",        "center"],
      ["D","Unidad",          "center"],
      ["E","Tarifa Neta (UF)","center"],
      ["F","Total Neto (UF)", "center"],
      ["G","Total Neto ($)",  "center"],
    ]
    hdrs.forEach(([col, val, ha]) => {
      r.getCell(col).value = val
      st(r.getCell(col), { bg: C.HDR_BG, fc: C.HDR_TXT, bold: true, size: 9, ha, va: "middle", wrap: true })
    })
    row++
  }

  billing.rows.forEach((br: BillingRow) => {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    const isClp = br.moneda === "CLP"
    r.getCell("B").value = br.label
    r.getCell("C").value = br.qty
    r.getCell("D").value = br.unit
    r.getCell("E").value = br.tarifa
    r.getCell("F").value = (isClp || uf <= 0) ? null : br.totalCLP / uf
    r.getCell("G").value = br.totalCLP
    st(r.getCell("B"), { size: 9, wrap: true })
    st(r.getCell("C"), { size: 9, ha: "right" })
    st(r.getCell("D"), { size: 9, ha: "center" })
    st(r.getCell("E"), { size: 9, ha: "right", fmt: isClp ? '"$"#,##0' : "0.0000" })
    st(r.getCell("F"), { size: 9, ha: "right", fmt: isClp ? undefined : "0.0000" })
    st(r.getCell("G"), { size: 9, ha: "right", fmt: '"$"#,##0' })
    row++
  })

  if (billing.hasMin) {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    r.getCell("B").value = "Facturación mínima aplicada"
    r.getCell("F").value = billing.finalUF
    r.getCell("G").value = billing.finalCLP
    ;["B","C","D","E"].forEach(col => st(r.getCell(col), { bg: C.AMBER_BG, fc: C.AMBER_TXT, bold: true, size: 9 }))
    st(r.getCell("F"), { bg: C.AMBER_BG, fc: C.AMBER_TXT, bold: true, size: 9, ha: "right", fmt: "0.0000" })
    st(r.getCell("G"), { bg: C.AMBER_BG, fc: C.AMBER_TXT, bold: true, size: 9, ha: "right", fmt: '"$"#,##0' })
    ws.mergeCells(`B${row}:E${row}`)
    row++
  }

  {
    const r = ws.addRow([])
    r.height = 16
    spacerA(r)
    r.getCell("B").value = "TOTAL NETO"
    st(r.getCell("B"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right" })
    ws.mergeCells(`B${row}:E${row}`)
    r.getCell("F").value = billing.finalUF
    st(r.getCell("F"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right", fmt: "0.00" })
    r.getCell("G").value = billing.finalCLP
    st(r.getCell("G"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right", fmt: '"$"#,##0' })
    r.getCell("I").value = `UF al ${pad(periodEndD)}/${pad(periodEndM)}/${anio}`
    st(r.getCell("I"), { size: 8, ha: "right", noBorder: true })
    ws.mergeCells(`I${row}:J${row}`)
    r.getCell("K").value = `$${uf.toLocaleString("es-CL")}`
    st(r.getCell("K"), { size: 8, bold: true, ha: "left", noBorder: true })
    ws.mergeCells(`K${row}:N${row}`)
    row++
  }

  { const r = ws.addRow([]); r.height = 8; spacerA(r); row++ }

  // ── BLOQUE 3 — LOG DIARIO ────────────────────────────────────────────────────
  {
    const hdrs: [string, string][] = [
      ["B", "FECHA"],
      ["C", "Nombre\nOperador"],
      ["D", "G.D. Ingreso N°"],
      ["E", "Pallets\nIngresado"],
      ["F", "REPORT N°"],
      ["G", "G.D. Salida N°"],
      ["H", "Pallets\nSalida"],
      ["I", "REPORT N°"],
      ["J", "STOCK"],
      ["K", "Tarifa Neta\nAlmacenaje (UF)"],
      ["L", "Tarifa Neta\nIngreso Pallets (UF)"],
      ["M", "Tarifa Neta\nSalida Pallets (UF)"],
      ...activeSrvs.map((srv, i): [string, string] => [
        srvCols[i],
        `Tarifa Neta\n${srv.nombre} (UF)`,
      ]),
      [totalCol, "TOTAL\nNETO (UF)"],
    ]
    const r = ws.addRow([])
    r.height = 38
    spacerA(r)
    hdrs.forEach(([col, val]) => {
      r.getCell(col).value = val
      st(r.getCell(col), {
        bg: C.HDR_BG, fc: C.HDR_TXT, bold: true, size: 9,
        ha: "center", va: "middle", wrap: true,
      })
    })
    row++
  }

  hes.dailyLog.forEach((d: DayEntry) => {
    const hasIn  = d.pallets_in  > 0
    const hasOut = d.pallets_out > 0
    const dp     = d.fecha.split("-")
    const dateStr = dp.length === 3 ? `${dp[2]}-${dp[1]}-${dp[0]}` : d.fecha

    const tAlm   = d.tarifa_dia > 0 ? d.tarifa_dia : 0
    const tIn    = hasIn  ? d.pallets_in  * tInout : 0
    const tOut   = hasOut ? d.pallets_out * tInout : 0

    const r = ws.addRow([])
    r.height = 13
    spacerA(r)

    r.getCell("B").value = dateStr
    st(r.getCell("B"), { size: 9, ha: "center" })
    r.getCell("C").value = d.operador || ""
    st(r.getCell("C"), { size: 8 })
    r.getCell("D").value = d.guias_in || ""
    st(r.getCell("D"), { size: 8, ha: "center" })
    r.getCell("E").value = hasIn ? d.pallets_in : ""
    st(r.getCell("E"), { size: 9, ha: "center", bold: hasIn })
    r.getCell("F").value = d.reports_in || ""
    st(r.getCell("F"), { size: 8, ha: "center" })
    r.getCell("G").value = d.guias_out || ""
    st(r.getCell("G"), { size: 8, ha: "center" })
    r.getCell("H").value = hasOut ? d.pallets_out : ""
    st(r.getCell("H"), { size: 9, ha: "center", bold: hasOut })
    r.getCell("I").value = d.reports_out || ""
    st(r.getCell("I"), { size: 8, ha: "center" })
    r.getCell("J").value = d.stock
    st(r.getCell("J"), { size: 9, ha: "center", bold: true })
    r.getCell("K").value = tAlm > 0 ? tAlm : ""
    st(r.getCell("K"), { size: 8, ha: "right", fmt: tAlm > 0 ? fmtTarifaNum : undefined })
    r.getCell("L").value = tIn > 0 ? tIn : ""
    st(r.getCell("L"), { size: 8, ha: "right", fmt: tIn > 0 ? fmtTarifaNum : undefined })
    r.getCell("M").value = tOut > 0 ? tOut : ""
    st(r.getCell("M"), { size: 8, ha: "right", fmt: tOut > 0 ? fmtTarifaNum : undefined })

    activeSrvs.forEach((_, i) => {
      st(r.getCell(srvCols[i]), { size: 8, ha: "right" })
    })

    const tTotal = tAlm + tIn + tOut
    r.getCell(totalCol).value = tTotal > 0 ? tTotal : ""
    st(r.getCell(totalCol), { size: 8, ha: "right", bold: tTotal > 0, fmt: tTotal > 0 ? fmtTarifaNum : undefined })

    row++
  })

  {
    const lastStock = hes.dailyLog.length > 0
      ? hes.dailyLog[hes.dailyLog.length - 1].stock : 0
    const totAlm   = hes.palletDays    * tarifaAlmacenaje
    const totIn    = hes.totalIngresos * tInout
    const totOut   = hes.totalDespachos * tInout
    const totSrvs  = activeSrvs.reduce((sum, s) => sum + (s.moneda === tarifa.moneda ? s.cantidad * (isClpTarifa ? s.tarifa_clp : s.tarifa_uf) : 0), 0)
    const totNeto  = totAlm + totIn + totOut + totSrvs

    const r = ws.addRow([])
    r.height = 16
    spacerA(r)

    const allLogCols = ["B","C","D","E","F","G","H","I","J","K","L","M", ...srvCols, totalCol]
    allLogCols.forEach(col => st(r.getCell(col), {
      bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 9,
      ha: "center", bs: "medium", bc: C.HDR_TXT,
    }))

    r.getCell("B").value = `Total Neto ${mesTit}`
    st(r.getCell("B"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 9, ha: "left", bs: "medium", bc: C.HDR_TXT })
    ws.mergeCells(`B${row}:D${row}`)

    r.getCell("E").value = hes.totalIngresos
    r.getCell("H").value = hes.totalDespachos
    r.getCell("J").value = lastStock

    if (totAlm > 0) { r.getCell("K").value = totAlm;  r.getCell("K").numFmt = fmtTarifaNum }
    if (totIn  > 0) { r.getCell("L").value = totIn;   r.getCell("L").numFmt = fmtTarifaNum }
    if (totOut > 0) { r.getCell("M").value = totOut;  r.getCell("M").numFmt = fmtTarifaNum }

    activeSrvs.forEach((srv, i) => {
      const v = srv.cantidad * (srv.moneda === "CLP" ? srv.tarifa_clp : srv.tarifa_uf)
      if (v > 0) { r.getCell(srvCols[i]).value = v; r.getCell(srvCols[i]).numFmt = srv.moneda === "CLP" ? '"$"#,##0' : "0.0000" }
    })

    if (totNeto > 0) { r.getCell(totalCol).value = totNeto; r.getCell(totalCol).numFmt = fmtTarifaNum }
  }
}
