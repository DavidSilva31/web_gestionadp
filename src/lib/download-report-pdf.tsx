import { createClient } from "@/lib/supabase"
import { cargarFirmasReport } from "@/lib/report-firmas"
import { cargarBodegajeItems } from "@/lib/report-bodegaje"
import type { Report } from "@/types/database"

export async function downloadReportPDF(report: Report) {
  // Dynamic import so @react-pdf/renderer is never bundled server-side
  const { pdf } = await import("@react-pdf/renderer")
  const { ReportPDF } = await import("@/components/reports/report-pdf")

  // Recarga el report fresco en vez de usar el objeto que llegó como
  // parámetro — ese puede venir de una lista que no se refrescó después del
  // último guardado, y quedaría desincronizado con las firmas/huella (que sí
  // se cargan frescas más abajo), mostrando ej. "El report fue modificado
  // después de esta firma" aunque en la BD ya no sea cierto.
  const [{ data: fresh }, firmas, items] = await Promise.all([
    createClient().from("reports").select("*").eq("id", report.id).single(),
    cargarFirmasReport(report.id),
    cargarBodegajeItems(report.id),
  ])
  const blob = await pdf(<ReportPDF report={(fresh as Report) ?? report} firmas={firmas} items={items} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `report-${report.numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
