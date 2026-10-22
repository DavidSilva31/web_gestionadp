import { EMISORES, EMISOR_DATOS, FIRMA, sanitizarNombreArchivo, type Emisor } from "@/lib/cotizacion-pdf-build"
import type { TarifadoPDFData } from "@/components/tarifado-transporte/tarifado-pdf"

// Tramos de valor del diésel (CLP) de las 7 columnas de valores_uf, en ese orden.
export const TRAMOS_DIESEL = ["1001-1100", "1101-1200", "1201-1300", "1301-1400", "1401-1500", "1501-1600", "1601-1700"] as const

export function numeroTarifado(numero: number, fecha: string): string {
  return `${numero}_${fecha.slice(0, 4)}`
}

export function nombreArchivoTarifado(data: Pick<TarifadoPDFData, "numero" | "emisor" | "cliente">): string {
  return sanitizarNombreArchivo(`Tarifado_Transp_${data.numero} ${data.emisor.nombre} - ${data.cliente.razonSocial}.pdf`)
}

export function construirTarifadoPDFData(p: {
  numero: number
  fecha: string                 // YYYY-MM-DD
  vigenciaDesde: string | null  // YYYY-MM-DD
  emisor: string
  cliente: { nombre: string; rut: string | null }
  atencion: string | null
  ciudad: string | null
  direccion: string | null
  lineas: { trayecto: string; capacidad: string; ufPreAlza: number | null; valoresUF: number[]; resaltados: number[] }[]
  observaciones: string[]
}): TarifadoPDFData {
  const emisor = (EMISORES as readonly string[]).includes(p.emisor) ? (p.emisor as Emisor) : "Altos del Puerto"
  return {
    numero: numeroTarifado(p.numero, p.fecha),
    fecha: new Date(p.fecha + "T00:00:00").toLocaleDateString("es-CL"),
    vigenciaDesde: p.vigenciaDesde
      ? new Date(p.vigenciaDesde + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })
      : null,
    emisor: { nombre: emisor, ...EMISOR_DATOS[emisor] },
    cliente: { razonSocial: p.cliente.nombre, rut: p.cliente.rut, ciudad: p.ciudad, direccion: p.direccion },
    atencion: p.atencion,
    lineas: p.lineas,
    observaciones: p.observaciones,
    firma: FIRMA,
  }
}
