import type { CotizacionPDFData } from "@/components/cotizaciones/cotizacion-pdf"

export async function downloadCotizacionPDF(data: CotizacionPDFData) {
  const { pdf }             = await import("@react-pdf/renderer")
  const { CotizacionPDF }   = await import("@/components/cotizaciones/cotizacion-pdf")

  const blob = await pdf(<CotizacionPDF data={data} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `Cotizacion_${data.numero}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
