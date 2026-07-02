import * as XLSX from "xlsx"

type ExportRow = Record<string, string | number | boolean | null | undefined>

export function exportToExcel(rows: ExportRow[], filename: string, sheetName = "Datos") {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
