import type { NextRequest } from "next/server"

const MAX_FIRMA_BYTES = 400 * 1024
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Decodifica un data URL PNG de firma. null si no es un PNG válido o es muy grande.
export function decodeFirmaPng(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string") return null
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!m) return null
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"))
  if (bytes.length === 0 || bytes.length > MAX_FIRMA_BYTES) return null
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null
  return bytes
}

// IP del cliente detrás del proxy (Netlify manda x-nf-client-connection-ip).
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-nf-client-connection-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "desconocida"
}
