import React from "react"
import type { Report } from "@/types/database"

export async function downloadReportPDF(report: Report) {
  const [{ pdf }, { ReportPDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/reports/report-pdf"),
  ])

  const blob = await pdf(React.createElement(ReportPDF, { report })).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `report-${report.numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
