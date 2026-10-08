import { FIRMA_GONZALO_DATA_URI } from "@/lib/firma-gonzalo-base64"
import type { CotizacionPDFData } from "@/components/cotizaciones/cotizacion-pdf"

export const EMISORES = ["Altos del Puerto", "Incomex", "Mar Azul"] as const
export type Emisor = (typeof EMISORES)[number]

export const EMISOR_DATOS: Record<Emisor, { direccion: string; telefono: string; email: string; web: string }> = {
  "Altos del Puerto": { direccion: "Camino La Pólvora 106, Valparaíso, Chile", telefono: "Fono: 77482466", email: "secretaria@altosdelpuerto.cl", web: "www.altosdelpuerto.cl" },
  "Incomex":          { direccion: "Camino La Pólvora 106, Valparaíso, Chile", telefono: "Fono: 77482466", email: "secretaria@altosdelpuerto.cl", web: "www.altosdelpuerto.cl" },
  "Mar Azul":         { direccion: "", telefono: "", email: "", web: "" },
}

export const FIRMA = {
  nombre: "Gonzalo Bozzolo Artaza",
  cargo: "Gerente de Operaciones, Altos del Puerto",
  telefono: "Fono: +56962483906",
  email: "gonzalobozzolo@altosdelpuerto.cl",
  imagenUri: FIRMA_GONZALO_DATA_URI,
}

export const IVA = 0.19

export const sanitizarNombreArchivo = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim()

export function nombreArchivoCotizacion(data: Pick<CotizacionPDFData, "numero" | "emisor" | "cliente">): string {
  return sanitizarNombreArchivo(`Cotización_${data.numero} ${data.emisor.nombre} - ${data.cliente.razonSocial}.pdf`)
}

type CotizacionRow = {
  numero: number
  fecha: string
  emisor: string
  atencion: string | null
  ciudad: string | null
  direccion: string | null
  valor_uf: number
  neto: number
  iva: number
  total: number
  observaciones_extra: string | null
  ocultar_totales: boolean
}
type ClienteRow = { nombre: string; rut: string | null }
type LineaRow = { cantidad: number; descripcion: string; valor_uf: number; descuento_pct: number }
type ObservacionRow = { texto: string; observacion_tipos: { nombre: string } | null }

export function construirCotizacionPDFData(
  cot: CotizacionRow, cliente: ClienteRow, lineas: LineaRow[], observaciones: ObservacionRow[]
): CotizacionPDFData {
  const emisor = (EMISORES as readonly string[]).includes(cot.emisor) ? (cot.emisor as Emisor) : "Altos del Puerto"
  const valorUF = Number(cot.valor_uf)
  // El neto/iva/total se recalcula siempre desde las líneas, igual que el
  // formulario — las columnas guardadas en cotizaciones pueden quedar
  // desactualizadas (ej. cotizaciones migradas del portal, que traían estos
  // campos vacíos aunque sus líneas sí tenían valores).
  const lineasPDF = lineas.map(l => ({
    cantidad: Number(l.cantidad),
    descripcion: l.descripcion,
    valorUF: Number(l.valor_uf),
    valorPesos: Math.round(Number(l.cantidad) * Number(l.valor_uf) * valorUF * (1 - Number(l.descuento_pct) / 100)),
  }))
  const neto = lineasPDF.reduce((s, l) => s + l.valorPesos, 0)
  const iva = Math.round(neto * IVA)
  return {
    numero: cot.numero,
    fecha: new Date(cot.fecha + "T00:00:00").toLocaleDateString("es-CL"),
    emisor: { nombre: emisor, ...EMISOR_DATOS[emisor] },
    cliente: { razonSocial: cliente.nombre, rut: cliente.rut, ciudad: cot.ciudad, direccion: cot.direccion },
    atencion: cot.atencion,
    valorUF,
    lineas: lineasPDF,
    neto,
    iva,
    total: neto + iva,
    observaciones: observaciones.map(o => ({ tipo: o.observacion_tipos?.nombre ?? "", texto: o.texto })),
    observacionesExtra: cot.observaciones_extra,
    ocultarTotales: cot.ocultar_totales,
    firma: FIRMA,
  }
}
