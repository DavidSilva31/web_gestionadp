import ExcelJS from "exceljs"
import type { TransporteIncomex } from "@/types/database"

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement("a")
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Mismos tonos de marca que src/lib/excel.ts (Kardex/Resumen de Inventario).
const KX = {
  NAVY:       "FF0A4A7F",
  NAVY_MID:   "FF1A5276",
  TEXT:       "FF1F2937",
  MUTED:      "FF6B7280",
  WHITE:      "FFFFFFFF",
  BANDING:    "FFF7F9FB",
  WARNING_BG: "FFFBF3DB", WARNING_TXT: "FF7A4F00",
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

function fmtFecha(iso: string) { return iso.split("-").reverse().join("/") }
const str = (v: string | number | null | undefined) => v ?? ""
const uf  = (v: number | null | undefined) => v == null ? null : Number(v.toFixed(4))
const clp = (v: number | null | undefined) => v == null ? null : v

export interface TransporteExportRow extends TransporteIncomex {
  reports: { numero: number } | null
}

export async function exportTransporteToExcel(rows: TransporteExportRow[], filename: string, subtitulo: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "ADP Gestión"
  wb.created = new Date()

  const cols = [
    "Fecha", "N° Guía", "Empresa", "Tipo de movimiento", "Origen - Destino",
    "Detalle de carga", "Sigla contenedor/isotanque", "Transportista", "Conductor",
    "Tarifa transportista (CLP)", "Costo (UF)", "Factura cliente NETO (UF)",
    "Margen ADP a Incomex (UF)", "Observaciones", "Report asociado",
  ]

  const ws = wb.addWorksheet("Transporte ADP", { views: [{ showGridLines: false }] })
  ws.columns = cols.map(key => ({ key, width: Math.max(11, Math.min(26, key.length + 3)) }))

  const titleRow = ws.addRow({})
  titleRow.height = 26
  titleRow.getCell(1).value = "TRANSPORTE ADP"
  kxStyle(titleRow.getCell(1), { bg: KX.NAVY, fc: KX.WHITE, bold: true, size: 14 })
  ws.mergeCells(titleRow.number, 1, titleRow.number, cols.length)

  const subRow = ws.addRow({})
  subRow.height = 16
  subRow.getCell(1).value = `${subtitulo} · ${rows.length} viaje${rows.length !== 1 ? "s" : ""} · Generado el ${new Date().toLocaleDateString("es-CL")}`
  kxStyle(subRow.getCell(1), { fc: KX.MUTED, italic: true, size: 9 })
  ws.mergeCells(subRow.number, 1, subRow.number, cols.length)

  ws.addRow({}).height = 10

  const headerRow = ws.addRow({})
  headerRow.height = 26
  cols.forEach(key => kxStyle(headerRow.getCell(key), { bg: KX.NAVY_MID, fc: KX.WHITE, bold: true, ha: "center", wrap: true }))
  cols.forEach(key => { headerRow.getCell(key).value = key })

  let totalUF = 0
  rows.forEach((r, idx) => {
    const data: Record<string, string | number | null> = {
      "Fecha":                        fmtFecha(r.fecha),
      "N° Guía":                      str(r.guia_numero),
      "Empresa":                      str(r.empresa_texto),
      "Tipo de movimiento":           str(r.tipo_movimiento),
      "Origen - Destino":             str(r.origen_destino),
      "Detalle de carga":             str(r.detalle_carga),
      "Sigla contenedor/isotanque":   str(r.sigla_contenedor),
      "Transportista":                str(r.transportista),
      "Conductor":                    str(r.conductor),
      "Tarifa transportista (CLP)":   clp(r.tarifa_tte_clp),
      "Costo (UF)":                   uf(r.costo_uf),
      "Factura cliente NETO (UF)":    uf(r.factura_cliente_uf),
      "Margen ADP a Incomex (UF)":    uf(r.factura_adp_incomex_uf),
      "Observaciones":                str(r.observaciones),
      "Report asociado":              r.reports ? `#${r.reports.numero}` : "",
    }
    totalUF += r.factura_cliente_uf ?? 0
    const row = ws.addRow(data)
    cols.forEach(key => {
      const val = data[key]
      const sinTarifa = key === "Factura cliente NETO (UF)" && val == null
      kxStyle(row.getCell(key), {
        bg: sinTarifa ? KX.WARNING_BG : (idx % 2 === 1 ? KX.BANDING : KX.WHITE),
        fc: sinTarifa ? KX.WARNING_TXT : KX.TEXT,
        ha: typeof val === "number" ? "right" : "left",
      })
      if (sinTarifa) row.getCell(key).value = "sin tarifa"
    })
  })

  const totalRow = ws.addRow({})
  totalRow.height = 20
  totalRow.getCell("Costo (UF)").value = "TOTAL FACTURADO"
  kxStyle(totalRow.getCell("Costo (UF)"), { bold: true, ha: "right" })
  totalRow.getCell("Factura cliente NETO (UF)").value = Number(totalUF.toFixed(4))
  kxStyle(totalRow.getCell("Factura cliente NETO (UF)"), { bold: true, bg: KX.NAVY, fc: KX.WHITE, ha: "right" })

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }]

  const buffer = await wb.xlsx.writeBuffer()
  triggerBlobDownload(new Blob([buffer]), `${filename}.xlsx`)
}
