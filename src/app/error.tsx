'use client'

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[error.tsx]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-lg font-semibold">Algo salió mal</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Ocurrió un error inesperado. Puedes intentar de nuevo; si el problema persiste, contacta al administrador.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Código: {error.digest}</p>
      )}
      <Button onClick={() => unstable_retry()}>Intentar de nuevo</Button>
    </div>
  )
}
