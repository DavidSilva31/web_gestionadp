import type { NextConfig } from "next"

// Único origen externo que la app llama en runtime — next/font/google
// autohospeda las fuentes en build, así que no hace falta abrir
// fonts.googleapis.com/fonts.gstatic.com acá.
const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
// Supabase Realtime (usado por notificaciones en vivo) conecta por WebSocket
// — es un esquema aparte de https en CSP, así que connect-src necesita el
// origen wss:// explícito además del https:// para las llamadas REST normales.
const supabaseWsUrl  = supabaseUrl.replace(/^https:/, "wss:")

// 'unsafe-inline' en script-src es necesario por el script inline de tema
// en src/app/layout.tsx (antes de que React hidrate) — es estático, sin
// interpolación de datos de usuario, así que el riesgo real es bajo.
// 'unsafe-eval' solo se agrega en desarrollo: Turbopack/React Fast Refresh
// usan eval() para el hot-reload y para reconstruir call stacks del overlay
// de errores — sin esto, cualquier página tira "eval() is not supported".
// En producción (npm run build/start) NODE_ENV es 'production' y esto no
// se incluye, así que el CSP de producción sigue tan estricto como antes.
const isDev = process.env.NODE_ENV === "development"
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseUrl}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl} ${supabaseWsUrl} https://api.resend.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff"                         },
  { key: "X-Frame-Options",           value: "DENY"                            },
  { key: "X-XSS-Protection",          value: "1; mode=block"                   },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  // Solo en producción: React dev necesita eval() para reconstruir
  // callstacks al debuggear (nunca lo usa en producción), así que el CSP
  // en dev rompe la consola de Next con "eval() is not supported".
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: csp }]
    : []),
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
