import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import fs from "fs"
import path from "path"

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

function pad(n: number) { return String(n).padStart(2, "0") }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

// ─── Palette ─────────────────────────────────────────────────────────────────
// HDR_BG (#DCE6F1) es el azul claro especificado por el usuario
const C = {
  HDR_BG:   "FFDCE6F1",   // fondo headers (azul claro referencia)
  HDR_TXT:  "FF1F3864",   // texto sobre fondo claro (navy oscuro)
  TOT_BG:   "FFBDD7EE",   // fila de totales (azul un tono más)
  WHITE:    "FFFFFFFF",
  TEXT:     "FF000000",
  GREY_BD:  "FFAAAAAA",   // bordes sutiles
  AMBER_BG: "FFFFF8E1",
  AMBER_TXT:"FF7B3C00",
  BLUE_TXT: "FF1F3864",   // texto azul para nombre cliente
  LINK_TXT: "FF0563C1",   // texto email (enlace)
}

interface StyleOpts {
  bg?:      string
  fc?:      string
  bold?:    boolean
  size?:    number
  italic?:  boolean
  ha?:      ExcelJS.Alignment["horizontal"]
  va?:      ExcelJS.Alignment["vertical"]
  fmt?:     string
  wrap?:    boolean
  bs?:      ExcelJS.BorderStyle
  bc?:      string
  noBorder?:boolean
  underline?:boolean
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
interface BillingRow { label: string; qty: number; unit: string; tarifa: number; totalUF: number }
interface DayEntry {
  fecha: string; operador: string
  guias_in: string; pallets_in: number; reports_in: string
  guias_out: string; pallets_out: number; reports_out: string
  stock: number; tarifa_dia: number
}
interface TarifaObj {
  cotizacion_numero:     string
  clase_imo:             string | null
  tarifa_almacenaje_uf:  number | null
  tarifa_inout_uf:       number | null
  tarifa_consolid_40_uf: number | null
  tarifa_descons_20_uf:  number | null
  tarifa_descons_40_uf:  number | null
  tarifa_palletizado_uf: number | null
  tarifa_porteo_uf:      number | null
  facturacion_minima_uf: number | null
}
interface ServicioExport {
  id:        string
  nombre:    string
  tarifa_uf: number
  unidad:    string
  cantidad:  number
}
interface ReqBody {
  cliente:   { nombre: string; rut: string; email: string | null; contacto: string | null }
  tarifa:    TarifaObj
  billing:   { rows: BillingRow[]; finalUF: number; finalCLP: number; hasMin: boolean }
  hes:       { palletDays: number; totalIngresos: number; totalDespachos: number; dailyLog: DayEntry[] }
  servicios: ServicioExport[]
  mes:       number
  anio:      number
  ufValue:   string
}

export async function POST(req: NextRequest) {
  const { cliente, tarifa, billing, hes, servicios: srvs = [], mes, anio, ufValue } = await req.json() as ReqBody

  const uf      = parseFloat(ufValue) || 0
  const lastDay = daysInMonth(anio, mes)
  const mesNom  = MESES[mes].toUpperCase()
  const mesTit  = `${MESES[mes]} ${anio}`
  const tInout  = tarifa.tarifa_inout_uf ?? 0
  // Only include services that have a quantity entered
  const activeSrvs = srvs.filter(s => s.cantidad > 0 && s.tarifa_uf > 0)

  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()

  const sheetName = cliente.nombre.replace(/[\\/?*[\]:]/g, "").slice(0, 31)
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, orientation: "landscape",
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ showGridLines: false }],
  })

  // ── Columnas dinámicas según servicios ──────────────────────────────────────
  // Cols fijas: A(spacer) B-J (9 log cols) K L M (almacenaje+ingreso+salida)
  // Cols dinámicas: una por cada servicio activo + Total Neto al final
  const srvCols = activeSrvs.map((_, i) => String.fromCharCode(78 + i)) // N, O, P, Q...
  const totalCol = String.fromCharCode(78 + activeSrvs.length)           // columna Total Neto

  ws.columns = [
    { width: 2  }, // A  ← separador
    { width: 13 }, // B  Fecha
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
    // N+ Servicios adicionales (dinámico)
    ...activeSrvs.map(() => ({ width: 16 as number })),
    { width: 15 }, // Total Neto
  ]

  let row = 1

  // Función auxiliar: estiliza la celda A de una fila como separador (vacía)
  function spacerA(r: ExcelJS.Row) { st(r.getCell("A"), { noBorder: true }) }

  // ── Logo incomex (col B, row 2) ──────────────────────────────────────────────
  try {
    const logoPath   = path.join(process.cwd(), "public", "incomex_logo.png")
    const logoBuffer = fs.readFileSync(logoPath)
    const logoId     = wb.addImage({ buffer: logoBuffer, extension: "png" })
    // tl col=1 → columna B (0-indexed); row=1 → fila 2
    ws.addImage(logoId, { tl: { col: 1, row: 1 }, ext: { width: 140, height: 70 } })
  } catch { /* sin logo — continúa */ }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOQUE 1 — ENCABEZADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // R1: Título (cols C-totalCol, B libre para logo)
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

  // R2-R4: Espacio para el logo + período
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

  // R5: Spacer
  { const r = ws.addRow([]); r.height = 8; spacerA(r); row++ }

  // R6: Nombre del cliente
  {
    const r = ws.addRow([])
    r.height = 17
    spacerA(r)
    r.getCell("B").value = cliente.nombre.toUpperCase()
    st(r.getCell("B"), { bold: true, size: 12, fc: C.BLUE_TXT, underline: true, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }

  // R7: Período
  {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    r.getCell("B").value = `${mesNom} DE ${anio}`
    st(r.getCell("B"), { size: 10, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }

  // R8: Spacer
  { const r = ws.addRow([]); r.height = 6; spacerA(r); row++ }

  // R9: BEE / Cotización | Id. Producto / Clase IMO
  {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)

    r.getCell("B").value = "BEE :"
    st(r.getCell("B"), { bold: true, size: 9, noBorder: true })

    r.getCell("C").value = `COTIZACIÓN N° ${tarifa.cotizacion_numero}`
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

  // R10: Clase IMO (segunda línea)
  if (tarifa.clase_imo) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("E").value = tarifa.clase_imo.toUpperCase()
    st(r.getCell("E"), { size: 9, noBorder: true })
    row++
  }

  // R11: Atención
  if (cliente.contacto) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("B").value = `Atención: ${cliente.contacto}`
    st(r.getCell("B"), { size: 9, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }

  // R12: Email
  if (cliente.email) {
    const r = ws.addRow([])
    r.height = 13
    spacerA(r)
    r.getCell("B").value = cliente.email
    st(r.getCell("B"), { size: 9, fc: C.LINK_TXT, underline: true, noBorder: true })
    ws.mergeCells(`B${row}:G${row}`)
    row++
  }

  // Spacer
  { const r = ws.addRow([]); r.height = 10; spacerA(r); row++ }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOQUE 2 — TABLA DE COBRO (cols B-G)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Cabecera tabla cobro
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

  // Filas de cobro
  billing.rows.forEach((br: BillingRow) => {
    const r = ws.addRow([])
    r.height = 14
    spacerA(r)
    r.getCell("B").value = br.label
    r.getCell("C").value = br.qty
    r.getCell("D").value = br.unit
    r.getCell("E").value = br.tarifa
    r.getCell("F").value = br.totalUF
    r.getCell("G").value = br.totalUF * uf
    st(r.getCell("B"), { size: 9 })
    st(r.getCell("C"), { size: 9, ha: "right" })
    st(r.getCell("D"), { size: 9, ha: "center" })
    st(r.getCell("E"), { size: 9, ha: "right", fmt: "0.0000" })
    st(r.getCell("F"), { size: 9, ha: "right", fmt: "0.0000" })
    st(r.getCell("G"), { size: 9, ha: "right", fmt: '"$"#,##0' })
    row++
  })

  // Facturación mínima (si aplica)
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

  // Fila TOTAL NETO + UF al costado derecho
  {
    const r = ws.addRow([])
    r.height = 16
    spacerA(r)

    // Label + valores (cols B-G)
    r.getCell("B").value = "TOTAL NETO"
    st(r.getCell("B"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right" })
    ws.mergeCells(`B${row}:E${row}`)

    r.getCell("F").value = billing.finalUF
    st(r.getCell("F"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right", fmt: "0.00" })

    r.getCell("G").value = billing.finalCLP
    st(r.getCell("G"), { bg: C.TOT_BG, fc: C.HDR_TXT, bold: true, size: 10, ha: "right", fmt: '"$"#,##0' })

    // UF reference al costado derecho (cols I-N)
    r.getCell("I").value = `UF al ${pad(lastDay)}/${pad(mes + 1)}/${anio}`
    st(r.getCell("I"), { size: 8, ha: "right", noBorder: true })
    ws.mergeCells(`I${row}:J${row}`)

    r.getCell("K").value = `$${uf.toLocaleString("es-CL")}`
    st(r.getCell("K"), { size: 8, bold: true, ha: "left", noBorder: true })
    ws.mergeCells(`K${row}:N${row}`)
    row++
  }

  // Spacer
  { const r = ws.addRow([]); r.height = 8; spacerA(r); row++ }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BLOQUE 3 — LOG DIARIO (cols B-N)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Cabecera del log (columnas dinámicas por servicios)
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
      // Columnas dinámicas de servicios
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

  // Filas del log
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
    st(r.getCell("K"), { size: 8, ha: "right", fmt: tAlm > 0 ? "0.0000" : undefined })

    r.getCell("L").value = tIn > 0 ? tIn : ""
    st(r.getCell("L"), { size: 8, ha: "right", fmt: tIn > 0 ? "0.0000" : undefined })

    r.getCell("M").value = tOut > 0 ? tOut : ""
    st(r.getCell("M"), { size: 8, ha: "right", fmt: tOut > 0 ? "0.0000" : undefined })

    // Columnas de servicios adicionales (vacías por día — sólo total en fila resumen)
    activeSrvs.forEach((_, i) => {
      st(r.getCell(srvCols[i]), { size: 8, ha: "right" })
    })

    const tTotal = tAlm + tIn + tOut  // sin servicios — los servicios son mensuales
    r.getCell(totalCol).value = tTotal > 0 ? tTotal : ""
    st(r.getCell(totalCol), { size: 8, ha: "right", bold: tTotal > 0, fmt: tTotal > 0 ? "0.0000" : undefined })

    row++
  })

  // Fila total del log
  {
    const lastStock = hes.dailyLog.length > 0
      ? hes.dailyLog[hes.dailyLog.length - 1].stock : 0
    const totAlm   = hes.palletDays    * (tarifa.tarifa_almacenaje_uf ?? 0)
    const totIn    = hes.totalIngresos * tInout
    const totOut   = hes.totalDespachos * tInout
    const totSrvs  = activeSrvs.reduce((sum, s) => sum + s.cantidad * s.tarifa_uf, 0)
    const totNeto  = totAlm + totIn + totOut + totSrvs

    const r = ws.addRow([])
    r.height = 16
    spacerA(r)

    // Style all log columns
    const allLogCols = ["B","C","D","E","F","G","H","I","J","K","L","M",
      ...srvCols, totalCol]
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

    if (totAlm > 0) { r.getCell("K").value = totAlm;  r.getCell("K").numFmt = "0.0000" }
    if (totIn  > 0) { r.getCell("L").value = totIn;   r.getCell("L").numFmt = "0.0000" }
    if (totOut > 0) { r.getCell("M").value = totOut;  r.getCell("M").numFmt = "0.0000" }

    activeSrvs.forEach((srv, i) => {
      const v = srv.cantidad * srv.tarifa_uf
      if (v > 0) { r.getCell(srvCols[i]).value = v; r.getCell(srvCols[i]).numFmt = "0.0000" }
    })

    if (totNeto > 0) { r.getCell(totalCol).value = totNeto; r.getCell(totalCol).numFmt = "0.0000" }
    row++
  }

  // ── Generar respuesta ────────────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer()
  const filename = `HES_${cliente.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${MESES[mes]}_${anio}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
