import { createClient } from "@/lib/supabase"
import type { Report } from "@/types/database"

export async function downloadReportPDF(report: Report) {
  // Dynamic import so @react-pdf/renderer is never bundled server-side
  const { pdf } = await import("@react-pdf/renderer")
  const { ReportPDF } = await import("@/components/reports/report-pdf")

  let firmaUrl: string | null = null
  if (report.firma_conductor_url) {
    const { data, error } = await createClient().storage
      .from("reports-firmados")
      .createSignedUrl(report.firma_conductor_url, 3600)
    if (error) console.error("[download-report-pdf] error generando URL de la firma:", error)
    firmaUrl = data?.signedUrl ?? null
  }

  const blob = await pdf(<ReportPDF report={report} firmaUrl={firmaUrl} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `report-${report.numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
