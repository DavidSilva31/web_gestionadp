'use client'

import { useEffect } from "react"

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[global-error.tsx]", error)
  }, [error])

  return (
    <html lang="es">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Algo salió mal</h2>
        <p style={{ maxWidth: 420, fontSize: "0.875rem", color: "#666" }}>
          Ocurrió un error inesperado al cargar la aplicación. Intenta de nuevo o contacta al administrador.
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#999" }}>Código: {error.digest}</p>
        )}
        <button
          onClick={() => unstable_retry()}
          style={{ padding: "0.5rem 1rem", borderRadius: 6, background: "#111", color: "#fff", border: "none", cursor: "pointer" }}
        >
          Intentar de nuevo
        </button>
      </body>
    </html>
  )
}
