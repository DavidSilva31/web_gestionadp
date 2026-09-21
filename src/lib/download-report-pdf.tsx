import { cargarFirmasReport } from "@/lib/report-firmas"
import type { Report } from "@/types/database"

export async function downloadReportPDF(report: Report) {
  // Dynamic import so @react-pdf/renderer is never bundled server-side
  const { pdf } = await import("@react-pdf/renderer")
  const { ReportPDF } = await import("@/components/reports/report-pdf")

  const firmas = await cargarFirmasReport(report.id)
  const blob = await pdf(<ReportPDF report={report} firmas={firmas} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `report-${report.numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
