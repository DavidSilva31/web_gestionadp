import ExcelJS from "exceljs"

type ExportRow = Record<string, string | number | boolean | null | undefined>

// Descarga un blob generado en el navegador — mismo patrón que
// download-report-pdf.tsx (crear <a>, click, revocar el object URL).
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportToExcel(rows: ExportRow[], filename: string, sheetName = "Datos") {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  const keys = Object.keys(rows[0] ?? {})
  ws.columns = keys.map(key => ({ header: key, key }))
  ws.addRows(rows)
  const buffer = await wb.xlsx.writeBuffer()
  triggerBlobDownload(new Blob([buffer]), `${filename}.xlsx`)
}

// ─── Export "Detalle" (Kardex) — un workbook con una hoja por producto ─────
// Mismos colores de marca que src/lib/email-brand.ts (ese archivo usa `fs`
// para el logo y solo corre en servidor; acá se repiten los valores en hex
// plano porque este módulo se ejecuta en el navegador).
const KX = {
  NAVY:     "FF0A4A7F",
  NAVY_MID: "FF1A5276",
  CELESTE_LT: "FFE8F7FD",
  TEXT:     "FF1F2937",
  MUTED:    "FF6B7280",
  WHITE:    "FFFFFFFF",
  BANDING:  "FFF7F9FB",
  // Mismos tonos que las badges de Estado en pantalla (--color-status-*-bg/text
  // en globals.css, modo claro — un reporte exportado no tiene "modo oscuro").
  SUCCESS_BG: "FFEAF3DE", SUCCESS_TXT: "FF2D5A1B",
  WARNING_BG: "FFFBF3DB", WARNING_TXT: "FF7A4F00",
  DANGER_BG:  "FFFCEBEB", DANGER_TXT:  "FF8B1F1F",
}

interface KxStyleOpts {
  bg?: string; fc?: string; bold?: boolean; italic?: boolean; size?: number
  ha?: ExcelJS.Alignment["horizontal"]; wrap?: boolean
}
function kxStyle(cell: ExcelJS.Cell, o: KxStyleOpts = {}) {
  const { bg = KX.WHITE, fc = KX.TEXT, bold = false, italic = false, size = 9, ha = "left", wrap = false } = o
  cell.font = { bold, italic, size, color: { argb: fc }, name: "Calibri" }
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } }
  cell.alignment = { horizontal: ha, vertical: "middle", wrapText: wrap }
}

// ─── Export "Resumen" — mismo lenguaje visual que exportKardexToExcel ──────
export async function exportInventarioResumenToExcel(rows: ExportRow[], filename: string, clienteNombre: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()

  const cols = Object.keys(rows[0] ?? {})
  const ws = wb.addWorksheet("Inventario", { views: [{ showGridLines: false }] })
  ws.columns = cols.map(key => ({ key, width: Math.max(11, Math.min(28, key.length + 4)) }))

  const titleRow = ws.addRow({})
  titleRow.height = 26
  titleRow.getCell(1).value = `${clienteNombre.toUpperCase()} — INVENTARIO RESUMEN`
  kxStyle(titleRow.getCell(1), { bg: KX.NAVY, fc: KX.WHITE, bold: true, size: 14 })
  ws.mergeCells(titleRow.number, 1, titleRow.number, cols.length)

  const subRow = ws.addRow({})
  subRow.height = 16
  subRow.getCell(1).value = `${rows.length} ítem${rows.length !== 1 ? "s" : ""} · Generado el ${new Date().toLocaleDateString("es-CL")}`
  kxStyle(subRow.getCell(1), { fc: KX.MUTED, italic: true, size: 9 })
  ws.mergeCells(subRow.number, 1, subRow.number, cols.length)

  ws.addRow({}).height = 10

  const headerRow = ws.addRow({})
  headerRow.height = 20
  cols.forEach(key => kxStyle(headerRow.getCell(key), { bg: KX.NAVY_MID, fc: KX.WHITE, bold: true, ha: "center", wrap: true }))
  cols.forEach(key => { headerRow.getCell(key).value = key })

  rows.forEach((data, idx) => {
    const r = ws.addRow(data)
    cols.forEach(key => {
      const val = data[key]
      // La columna Estado se colorea igual que la badge en pantalla, en vez
      // de heredar el banding alternado del resto de la fila.
      if (key === "Estado" && typeof val === "string") {
        const estadoColors: Record<string, [string, string]> = {
          "Normal":  [KX.SUCCESS_BG, KX.SUCCESS_TXT],
          "Bajo":    [KX.WARNING_BG, KX.WARNING_TXT],
          "Crítico": [KX.DANGER_BG,  KX.DANGER_TXT],
        }
        const [bg, fc] = estadoColors[val] ?? [KX.WHITE, KX.TEXT]
        kxStyle(r.getCell(key), { bg, fc, bold: true, ha: "center" })
        return
      }
      kxStyle(r.getCell(key), {
        bg: idx % 2 === 1 ? KX.BANDING : KX.WHITE,
        ha: typeof val === "number" ? "right" : "left",
      })
    })
  })

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }]

  const buffer = await wb.xlsx.writeBuffer()
  triggerBlobDownload(new Blob([buffer]), `${filename}.xlsx`)
}

export interface KardexExportGroup {
  carga: string
  subtitulo: string
  rows: ExportRow[]
}

export async function exportKardexToExcel(groups: KardexExportGroup[], filename: string, clienteNombre: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()

  // Un producto puede tener más de un lote/código — se agrupan bajo el mismo
  // título de producto (una sub-sección celeste por lote) y todos los
  // productos van en UNA sola hoja, en orden alfabético: con decenas de
  // productos por cliente, una pestaña por producto se vuelve inmanejable
  // para navegar en Excel, así que "separado por producto" se resuelve acá
  // con bandas de color secuenciales, igual que las tarjetas de la vista
  // Detalle en pantalla.
  const byProducto = new Map<string, KardexExportGroup[]>()
  for (const g of groups) {
    if (!byProducto.has(g.carga)) byProducto.set(g.carga, [])
    byProducto.get(g.carga)!.push(g)
  }
  const productos = [...byProducto.keys()].sort((a, b) => a.localeCompare(b))

  const cols = Object.keys(groups[0]?.rows[0] ?? {})
  const ws = wb.addWorksheet("Detalle", { views: [{ showGridLines: false }] })
  ws.columns = cols.map(key => ({ key, width: Math.max(11, Math.min(22, key.length + 3)) }))

  const headerRow0 = ws.addRow({})
  headerRow0.height = 26
  headerRow0.getCell(1).value = `${clienteNombre.toUpperCase()} — DETALLE DE INVENTARIO`
  kxStyle(headerRow0.getCell(1), { bg: KX.NAVY, fc: KX.WHITE, bold: true, size: 14 })
  ws.mergeCells(headerRow0.number, 1, headerRow0.number, cols.length)

  const headerRow1 = ws.addRow({})
  headerRow1.height = 16
  headerRow1.getCell(1).value = `${productos.length} productos · Generado el ${new Date().toLocaleDateString("es-CL")}`
  kxStyle(headerRow1.getCell(1), { fc: KX.MUTED, italic: true, size: 9 })
  ws.mergeCells(headerRow1.number, 1, headerRow1.number, cols.length)

  ws.addRow({}).height = 10

  for (const carga of productos) {
    const lotes = byProducto.get(carga)!

    const titleRow = ws.addRow({})
    titleRow.height = 22
    titleRow.getCell(1).value = carga.toUpperCase()
    kxStyle(titleRow.getCell(1), { bg: KX.NAVY, fc: KX.WHITE, bold: true, size: 12 })
    ws.mergeCells(titleRow.number, 1, titleRow.number, cols.length)

    for (const lote of lotes) {
      const bandRow = ws.addRow({})
      bandRow.height = 18
      bandRow.getCell(1).value = lote.subtitulo || "Movimientos"
      kxStyle(bandRow.getCell(1), { bg: KX.CELESTE_LT, fc: KX.NAVY_MID, bold: true, size: 10 })
      ws.mergeCells(bandRow.number, 1, bandRow.number, cols.length)

      const headerRow = ws.addRow({})
      headerRow.height = 20
      cols.forEach(key => kxStyle(headerRow.getCell(key), { bg: KX.NAVY_MID, fc: KX.WHITE, bold: true, ha: "center", wrap: true }))
      cols.forEach(key => { headerRow.getCell(key).value = key })

      lote.rows.forEach((data, idx) => {
        const r = ws.addRow(data)
        const isLast = idx === lote.rows.length - 1
        cols.forEach(key => {
          kxStyle(r.getCell(key), {
            bg: isLast ? KX.CELESTE_LT : (idx % 2 === 1 ? KX.BANDING : KX.WHITE),
            bold: isLast && /^Stock/.test(key),
            ha: typeof data[key] === "number" ? "right" : "left",
          })
        })
      })
    }

    ws.addRow({}).height = 12
  }

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }]

  const buffer = await wb.xlsx.writeBuffer()
  triggerBlobDownload(new Blob([buffer]), `${filename}.xlsx`)
}
