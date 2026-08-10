// Renderiza los mismos PDF de resumen que genera el navegador (hes-resumen-pdf.tsx
// / hes-resumen-unificado-pdf.tsx), pero server-side — para adjuntarlos a un correo
// sin depender de que el cliente tenga el navegador abierto. La única diferencia
// real es el logo: en el navegador se pide por URL (`window.location.origin`), acá
// no existe `window`, así que se lee el archivo del disco y se pasa como data: URI.
import fs from "fs"
import path from "path"
import { renderToBuffer } from "@react-pdf/renderer"
import { HesResumenPDF, type HesResumenPDFData } from "@/components/hes/hes-resumen-pdf"
import { HesResumenUnificadoPDF, type HesResumenUnificadoPDFData } from "@/components/hes/hes-resumen-unificado-pdf"

let cachedLogoDataUri: string | null = null

function getLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri
  const logoPath = path.join(process.cwd(), "public", "adp_logo_hd.png")
  const b64 = fs.readFileSync(logoPath).toString("base64")
  cachedLogoDataUri = `data:image/png;base64,${b64}`
  return cachedLogoDataUri
}

export async function renderResumenPdfBuffer(data: Omit<HesResumenPDFData, "logoSrc">): Promise<Buffer> {
  return renderToBuffer(<HesResumenPDF data={{ ...data, logoSrc: getLogoDataUri() }} />)
}

export async function renderResumenUnificadoPdfBuffer(data: Omit<HesResumenUnificadoPDFData, "logoSrc">): Promise<Buffer> {
  return renderToBuffer(<HesResumenUnificadoPDF data={{ ...data, logoSrc: getLogoDataUri() }} />)
}
