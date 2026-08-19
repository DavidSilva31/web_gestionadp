import { NextRequest } from "next/server"

// El origin del request (`new URL(req.url).origin`) se arma a partir del
// header Host, que cualquiera puede spoofear en el POST — usarlo como
// destino de un link de reset/invitación permite host-header injection
// (el atacante recibe el token de recuperación en su propio dominio).
// `process.env.URL` la inyecta Netlify automáticamente en runtime (no
// depende del request ni de configurar nada en el dashboard), así que
// cubre el caso real que motivaba confiar en el origin sin abrir el hueco.
export function resolveSiteUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  if (process.env.URL) return process.env.URL
  return new URL(req.url).origin
}
