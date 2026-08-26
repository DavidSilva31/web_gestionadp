// Validación de archivos subidos al bucket privado "reports-firmados" (HDS,
// evidencia fotográfica, documento firmado). El atributo `accept` del input
// es solo un hint de UI — cualquier cliente HTTP puede saltárselo, así que
// el tipo/tamaño real se valida acá antes de subir.
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"]
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export function sanitizeExt(filename: string, fallback = "pdf"): string {
  const raw = (filename.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return ALLOWED_EXT.includes(raw) ? raw : fallback
}

// Devuelve un mensaje de error si el archivo no pasa la validación, o null si está OK.
export function validateUploadFile(file: File): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.type)) {
    return `Tipo de archivo no permitido (${file.name}) — solo PDF, JPG o PNG.`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `Archivo muy grande (${file.name}) — máximo 10 MB.`
  }
  return null
}
