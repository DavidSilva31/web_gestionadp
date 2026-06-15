import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

function pad(n: number) { return String(n).padStart(2, "0") }
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

// ─── Color palette (ARGB) ────────────────────────────────────────────────────
const C = {
  DARK_BLUE:  "FF1F3864",
  MED_BLUE:   "FF2E75B6",
  LIGHT_BLUE: "FFDEEAF1",
  LIGHT_GREY: "FFF2F2F2",
  WHITE:      "FFFFFFFF",
  TEXT:       "FF1F1F1F",
  WHITE_TXT:  "FFFFFFFF",
  GREEN_TXT:  "FF1E6B2E",
  AMBER_TXT:  "FF7B3C00",
  AMBER_BG:   "FFFFF3CD",
  GOLD_TXT:   "FFFFD700",
}

type ArgbColor = string
type BorderStyle = "thin" | "medium" | "thick"

function border(style: BorderStyle = "thin", color: ArgbColor = "FFD0D0D0"): ExcelJS.Border {
  return { style, color: { argb: color } }
}

function cellBorders(style: BorderStyle = "thin", color: ArgbColor = "FFD0D0D0"): Partial<ExcelJS.Borders> {
  const b = border(style, color)
  return { top: b, bottom: b, left: b, right: b }
}

function applyStyle(
  cell: ExcelJS.Cell,
  opts: {
    bg?: ArgbColor; fontColor?: ArgbColor; bold?: boolean; size?: number
    halign?: ExcelJS.Alignment["horizontal"]; valign?: ExcelJS.Alignment["vertical"]
    numFmt?: string; wrapText?: boolean; borderStyle?: BorderStyle; borderColor?: ArgbColor
    indent?: number
  }
) {
  const {
    bg = C.WHITE, fontColor = C.TEXT, bold = false, size = 10,
    halign = "left", valign = "middle", numFmt, wrapText = false,
    borderStyle = "thin", borderColor = "FFD0D0D0", indent = 0,
  } = opts

  cell.style = {
    font:      { bold, size, color: { argb: fontColor }, name: "Calibri" },
    fill:      { type: "pattern", pattern: "solid", fgColor: { argb: bg } },
    alignment: { horizontal: halign, vertical: valign, wrapText, indent },
    border:    cellBorders(borderStyle, borderColor),
  }
  if (numFmt) cell.numFmt = numFmt
}

interface BillingRow  { label: string; qty: number; unit: string; tarifa: number; totalUF: number }
interface DayEntry    { fecha: string; operador: string; guias_in: string; pallets_in: number; reports_in: string; guias_out: string; pallets_out: number; reports_out: string; stock: number; tarifa_dia: number }
interface ReqBody {
  cliente:  { nombre: string; rut: string; email: string | null; contacto: string | null }
  tarifa:   { cotizacion_numero: string; clase_imo: string | null; tarifa_almacenaje_uf: number | null; facturacion_minima_uf: number | null }
  billing:  { rows: BillingRow[]; finalUF: number; finalCLP: number; hasMin: boolean }
  hes:      { palletDays: number; totalIngresos: number; totalDespachos: number; dailyLog: DayEntry[] }
  mes:      number
  anio:     number
  ufValue:  string
}

export async function POST(req: NextRequest) {
  const { cliente, tarifa, billing, hes, mes, anio, ufValue } = await req.json() as ReqBody

  const uf      = parseFloat(ufValue) || 0
  const lastDay = daysInMonth(anio, mes)
  const mesNombre = MESES[mes].toUpperCase()

  const wb = new ExcelJS.Workbook()
  wb.creator  = "ADP Gestión"
  wb.created  = new Date()

  const ws = wb.addWorksheet(`HES ${mesNombre} ${anio}`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views:     [{ showGridLines: false }],
  })

  // Column widths matching the HES Excel layout
  ws.columns = [
    { width: 16 }, // A
    { width: 18 }, // B
    { width: 18 }, // C
    { width: 12 }, // D
    { width: 24 }, // E
    { width: 18 }, // F
    { width: 12 }, // G
    { width: 24 }, // H
    { width: 10 }, // I
    { width: 14 }, // J
  ]

  let rowN = 1  // track current row for merges

  // ── HEADER ─────────────────────────────────────────────────────────────────

  // Row 1: Main title
  {
    const r = ws.addRow(["ALTOS DEL PUERTO — HOJA DE ESTADO DE SERVICIO"])
    r.height = 30
    applyStyle(r.getCell(1), { bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 14, halign: "center" })
    ws.mergeCells(`A${rowN}:J${rowN}`)
    rowN++
  }

  // Row 2: Client name
  {
    const r = ws.addRow([cliente.nombre.toUpperCase()])
    r.height = 22
    applyStyle(r.getCell(1), { bg: C.MED_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 12, halign: "center" })
    ws.mergeCells(`A${rowN}:J${rowN}`)
    rowN++
  }

  // Row 3: Period (left) | Cotización (right)
  {
    const r = ws.addRow([`Período: ${mesNombre} DE ${anio}`, null, null, null, null, `Cotización N°: ${tarifa.cotizacion_numero}${tarifa.clase_imo ? `   ·   Clase: ${tarifa.clase_imo}` : ""}`])
    r.height = 16
    applyStyle(r.getCell(1), { bg: C.LIGHT_GREY, bold: true, size: 10, indent: 1 })
    applyStyle(r.getCell(6), { bg: C.LIGHT_GREY, size: 10, halign: "right" })
    ws.mergeCells(`A${rowN}:E${rowN}`)
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Row 4: RUT (left) | UF value (right)
  {
    const r = ws.addRow([`RUT: ${cliente.rut}`, null, null, null, null, `FUENTE SII: UF al ${pad(lastDay)}/${pad(mes+1)}/${anio} = $${uf.toLocaleString("es-CL")}`])
    r.height = 16
    applyStyle(r.getCell(1), { bg: C.LIGHT_GREY, size: 10, indent: 1 })
    applyStyle(r.getCell(6), { bg: C.LIGHT_GREY, bold: true, size: 10, halign: "right" })
    ws.mergeCells(`A${rowN}:E${rowN}`)
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Row 5: Contact info (left) | Email (right) — optional
  if (cliente.contacto || cliente.email) {
    const r = ws.addRow([cliente.contacto ? `Contacto: ${cliente.contacto}` : "", null, null, null, null, cliente.email ? `Email: ${cliente.email}` : ""])
    r.height = 14
    applyStyle(r.getCell(1), { bg: C.LIGHT_GREY, size: 9, indent: 1 })
    applyStyle(r.getCell(6), { bg: C.LIGHT_GREY, size: 9, halign: "right" })
    ws.mergeCells(`A${rowN}:E${rowN}`)
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Blank separator
  {
    const r = ws.addRow([])
    r.height = 8
    rowN++
  }

  // ── BILLING SECTION ─────────────────────────────────────────────────────────

  // Section title
  {
    const r = ws.addRow([`RESUMEN DE COBRO — ${mesNombre} ${anio}`])
    r.height = 20
    applyStyle(r.getCell(1), { bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 11, halign: "center" })
    ws.mergeCells(`A${rowN}:J${rowN}`)
    rowN++
  }

  // Billing table header
  {
    const r = ws.addRow(["Descripción", "Cantidad", "Unidad", "Tarifa (UF)", "Total Neto (UF)", "Total Neto ($)"])
    r.height = 18
    const cols: [string, ExcelJS.Alignment["horizontal"]][] = [
      ["A","left"],["B","right"],["C","center"],["D","right"],["E","right"],["F","right"],
    ]
    cols.forEach(([col, halign]) => {
      applyStyle(r.getCell(col), { bg: C.MED_BLUE, fontColor: C.WHITE_TXT, bold: true, halign })
    })
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Billing data rows
  billing.rows.forEach((row: BillingRow, idx: number) => {
    const bg = idx % 2 === 0 ? C.WHITE : C.LIGHT_BLUE
    const r = ws.addRow([row.label, row.qty, row.unit, row.tarifa, row.totalUF, row.totalUF * uf])
    r.height = 15
    applyStyle(r.getCell("A"), { bg, size: 10 })
    applyStyle(r.getCell("B"), { bg, size: 10, halign: "right" })
    applyStyle(r.getCell("C"), { bg, size: 10, halign: "center" })
    applyStyle(r.getCell("D"), { bg, size: 10, halign: "right", numFmt: "0.0000" })
    applyStyle(r.getCell("E"), { bg, size: 10, halign: "right", numFmt: "0.0000" })
    applyStyle(r.getCell("F"), { bg, size: 10, halign: "right", numFmt: `"$"#,##0` })
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  })

  // Minimum billing row
  if (billing.hasMin) {
    const r = ws.addRow([`⚠ Facturación mínima aplicada`, null, null, null, billing.finalUF, billing.finalCLP])
    r.height = 15
    ;["A","B","C","D"].forEach(col => applyStyle(r.getCell(col), { bg: C.AMBER_BG, fontColor: C.AMBER_TXT, bold: true, size: 10 }))
    applyStyle(r.getCell("E"), { bg: C.AMBER_BG, fontColor: C.AMBER_TXT, bold: true, halign: "right", numFmt: "0.0000" })
    applyStyle(r.getCell("F"), { bg: C.AMBER_BG, fontColor: C.AMBER_TXT, bold: true, halign: "right", numFmt: `"$"#,##0` })
    ws.mergeCells(`A${rowN}:D${rowN}`)
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Total row
  {
    const r = ws.addRow(["TOTAL NETO", null, null, null, billing.finalUF, billing.finalCLP])
    r.height = 22
    ;["A","B","C","D"].forEach(col =>
      applyStyle(r.getCell(col), { bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 12, halign: "center", borderStyle: "medium", borderColor: "FF000000" })
    )
    applyStyle(r.getCell("E"), { bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 12, halign: "right", numFmt: `0.0000" UF"`, borderStyle: "medium", borderColor: "FF000000" })
    applyStyle(r.getCell("F"), { bg: C.DARK_BLUE, fontColor: C.GOLD_TXT,  bold: true, size: 12, halign: "right", numFmt: `"$"#,##0`,    borderStyle: "medium", borderColor: "FF000000" })
    ws.mergeCells(`A${rowN}:D${rowN}`)
    ws.mergeCells(`F${rowN}:J${rowN}`)
    rowN++
  }

  // Blank separator
  {
    const r = ws.addRow([])
    r.height = 10
    rowN++
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────
  {
    const r = ws.addRow([
      "Pallet-días totales:", hes.palletDays, null,
      "Ingresos (pallets):", hes.totalIngresos, null,
      "Despachos (pallets):", hes.totalDespachos, null,
      "Días con movimiento:", hes.dailyLog.length,
    ])
    r.height = 15
    ;["A","D","G","J"].forEach(col => applyStyle(r.getCell(col), { bg: C.LIGHT_GREY, bold: true, size: 9 }))
    ;["B","E","H"].forEach(col => applyStyle(r.getCell(col), { bg: C.LIGHT_GREY, size: 10, bold: true, halign: "center" }))
    applyStyle(r.getCell("J"), { bg: C.LIGHT_GREY, size: 10, bold: true, halign: "center" })
    ws.mergeCells(`A${rowN}:B${rowN}`)
    ws.mergeCells(`C${rowN}:D${rowN}`)  // Ingresos label
    // Actually let me redo this more simply
    rowN++
  }

  // Blank separator
  {
    const r = ws.addRow([])
    r.height = 10
    rowN++
  }

  // ── DAILY LOG SECTION ───────────────────────────────────────────────────────

  // Section title
  {
    const r = ws.addRow([`LOG DIARIO — ${mesNombre} ${anio}`])
    r.height = 20
    applyStyle(r.getCell(1), { bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 11, halign: "center" })
    ws.mergeCells(`A${rowN}:J${rowN}`)
    rowN++
  }

  // Log header
  {
    const headers = [
      ["A","Fecha","center"],
      ["B","Operador","left"],
      ["C","G.D. Ingreso","center"],
      ["D","Pallets IN","right"],
      ["E","Report IN","center"],
      ["F","G.D. Salida","center"],
      ["G","Pallets OUT","right"],
      ["H","Report OUT","center"],
      ["I","Stock","right"],
      ["J","Tarifa Día (UF)","right"],
    ] as const
    const r = ws.addRow(headers.map(h => h[1]))
    r.height = 18
    headers.forEach(([col, , halign]) =>
      applyStyle(r.getCell(col), { bg: C.MED_BLUE, fontColor: C.WHITE_TXT, bold: true, halign })
    )
    rowN++
  }

  // Daily log rows
  hes.dailyLog.forEach((row: DayEntry, idx: number) => {
    const bg      = idx % 2 === 0 ? C.WHITE : C.LIGHT_BLUE
    const hasMovs = row.pallets_in > 0 || row.pallets_out > 0
    const dateStr = row.fecha.split("-").reverse().join("-")

    const r = ws.addRow([
      dateStr,
      row.operador || "",
      row.guias_in || "",
      row.pallets_in > 0  ? row.pallets_in  : "",
      row.reports_in || "",
      row.guias_out || "",
      row.pallets_out > 0 ? row.pallets_out : "",
      row.reports_out || "",
      row.stock,
      row.tarifa_dia > 0  ? row.tarifa_dia  : "",
    ])
    r.height = 14

    applyStyle(r.getCell("A"), { bg, size: 10, halign: "center" })
    applyStyle(r.getCell("B"), { bg, size: 9,  halign: "left" })
    applyStyle(r.getCell("C"), { bg, size: 9,  halign: "center" })
    applyStyle(r.getCell("D"), {
      bg,
      fontColor: hasMovs && row.pallets_in > 0 ? C.GREEN_TXT : C.TEXT,
      bold: row.pallets_in > 0, size: 10, halign: "right",
    })
    applyStyle(r.getCell("E"), { bg, size: 9, halign: "center" })
    applyStyle(r.getCell("F"), { bg, size: 9, halign: "center" })
    applyStyle(r.getCell("G"), {
      bg,
      fontColor: hasMovs && row.pallets_out > 0 ? C.AMBER_TXT : C.TEXT,
      bold: row.pallets_out > 0, size: 10, halign: "right",
    })
    applyStyle(r.getCell("H"), { bg, size: 9, halign: "center" })
    applyStyle(r.getCell("I"), { bg, bold: true, size: 10, halign: "right" })
    applyStyle(r.getCell("J"), { bg, size: 9, halign: "right", numFmt: row.tarifa_dia > 0 ? "0.0000" : undefined })
    rowN++
  })

  // Log totals
  {
    const lastStock     = hes.dailyLog.length > 0 ? hes.dailyLog[hes.dailyLog.length - 1].stock : 0
    const totalTarifa   = hes.palletDays * (tarifa.tarifa_almacenaje_uf ?? 0)
    const r = ws.addRow([
      `TOTAL ${mesNombre} ${anio}`, "", "", hes.totalIngresos, "",
      "", hes.totalDespachos, "", lastStock, totalTarifa,
    ])
    r.height = 18
    for (let c = 1; c <= 10; c++) {
      applyStyle(r.getCell(c), {
        bg: C.DARK_BLUE, fontColor: C.WHITE_TXT, bold: true, size: 10,
        halign: [4, 7, 9].includes(c) ? "right" : c === 10 ? "right" : "center",
        borderStyle: "medium", borderColor: "FF000000",
      })
    }
    r.getCell("J").numFmt = "0.0000"
    ws.mergeCells(`A${rowN}:C${rowN}`)
    ws.mergeCells(`E${rowN}:F${rowN}`)
    ws.mergeCells(`H${rowN}:H${rowN}`)
    rowN++
  }

  // ── Generate response ───────────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer()
  const filename = `HES_${cliente.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${mesNombre}_${anio}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
