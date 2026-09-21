// Huella (SHA-256) del contenido firmable de un report. Se calcula al firmar
// (servidor) y se recalcula al generar el PDF (navegador) — si difiere, el
// report se modificó después de la firma y el PDF lo indica.
//
// Solo entran los datos que el conductor/operador está firmando: identificación,
// transporte y las tres secciones. Quedan fuera adjuntos (archivos), estado,
// servicios y todo lo de despacho — cambian por el flujo normal sin invalidar
// lo que se firmó.

const CAMPOS_BASE = [
  "numero", "fecha", "cliente", "patente", "conductor", "rut_conductor",
  "nombre_operador", "transporte_tipo", "empresa_transporte", "observaciones",
]

// Recepción llena Antecedentes + Sección 1 y ese lado queda congelado al pasar
// a Operaciones; lo que Operaciones completa después (Sección 2/3, nombre del
// operador) no debe invalidar la firma de Recepción.
function esCampoFirmable(key: string, rol: RolFirma): boolean {
  if (/_(archivos|url)$/.test(key)) return false
  if (rol === "recepcion") return (CAMPOS_BASE.includes(key) && key !== "nombre_operador") || key.startsWith("sec1_")
  return CAMPOS_BASE.includes(key) || /^sec[123]_/.test(key)
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

export async function hashContenidoReport(report: Record<string, unknown>, rol: RolFirma): Promise<string> {
  const contenido: Record<string, unknown> = {}
  for (const key of Object.keys(report).filter(k => esCampoFirmable(k, rol)).sort()) {
    contenido[key] = report[key] ?? null
  }
  const data = new TextEncoder().encode(JSON.stringify(contenido))
  return toHex(await crypto.subtle.digest("SHA-256", data))
}

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource))
}

// conductor: firma en pantalla (dedo/lápiz). recepcion y bodega (encargado de
// bodega / Operaciones): firma guardada en el perfil del usuario, aplicada con un clic.
export type RolFirma = "conductor" | "recepcion" | "bodega"

export const ROL_FIRMA_LABEL: Record<RolFirma, string> = {
  conductor: "conductor",
  recepcion: "Recepción",
  bodega:    "encargado de bodega",
}

export interface EvidenciaFirma {
  at:          string   // ISO UTC
  user_id:     string   // usuario que capturó/aplicó la firma
  user_nombre: string
  ip:          string
  user_agent:  string
  hash:        string   // huella del contenido del report al firmar
  firma_sha256: string  // huella de la imagen de firma
}

export type FirmaEvidencia = Partial<Record<RolFirma, EvidenciaFirma>>
