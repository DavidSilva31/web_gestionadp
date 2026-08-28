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
