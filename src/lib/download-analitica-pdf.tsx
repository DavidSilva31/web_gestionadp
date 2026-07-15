import type { AnaliticaPDFData } from "@/components/analitica/analitica-pdf"

export async function downloadAnaliticaPDF(data: AnaliticaPDFData) {
  // Dynamic import so @react-pdf/renderer is never bundled server-side
  const { pdf }           = await import("@react-pdf/renderer")
  const { AnaliticaPDF }  = await import("@/components/analitica/analitica-pdf")

  const blob = await pdf(<AnaliticaPDF data={data} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `Analitica_ADP_${data.periodoLabel.replace(/\s+/g, "_")}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
