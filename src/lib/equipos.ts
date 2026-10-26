export const TIPOS_EQUIPO = ["Notebook / PC", "Tablet"] as const
export const ESTADOS_EQUIPO = ["Disponible", "Asignado", "En reparación", "Dado de baja"] as const

export function estadoEquipoClase(estado: string): string {
  switch (estado) {
    case "Asignado":      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    case "Disponible":    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    case "En reparación": return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    default:              return "bg-muted text-muted-foreground"
  }
}

// ── Actas de entrega: se acepta cualquier tipo de archivo (PDF, Word, imágenes escaneadas, etc.) ──
export const ACTA_MAX_BYTES = 25 * 1024 * 1024 // 25 MB
// Por seguridad no se aceptan archivos ejecutables o scripts, aunque el resto de los tipos sí.
const ACTA_BLOQUEADAS = ["exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "sh", "dll", "lnk"]

export function extensionActa(nombre: string): string {
  const ext = (nombre.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)
  return nombre.includes(".") && ext ? ext : "bin"
}

// Devuelve un mensaje de error si el archivo no se puede subir, o null si está bien.
export function validarActa(file: File): string | null {
  if (ACTA_BLOQUEADAS.includes(extensionActa(file.name))) return `No se aceptan archivos ejecutables o de comandos (${file.name}).`
  if (file.size > ACTA_MAX_BYTES) return `Archivo muy grande (${file.name}) — máximo 25 MB.`
  if (file.size === 0) return `El archivo está vacío (${file.name}).`
  return null
}

// Cómo se muestra un acta en el visor: PDF e imágenes comunes se ven dentro del sistema; Word y el resto solo se descargan.
export function tipoVisorActa(path: string): "pdf" | "imagen" | "otro" {
  const ext = extensionActa(path)
  if (ext === "pdf") return "pdf"
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"].includes(ext)) return "imagen"
  return "otro"
}
