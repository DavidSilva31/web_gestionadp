"use client"

import { useRef } from "react"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Abre la cámara directamente (en una tablet o un celular), sin pasar por el selector de archivos: se saca la
// foto y ya queda adjunta. En un computador, donde no hay cámara que abrir, funciona como "elegir una imagen".
// Cada toque saca una foto; para varias, se vuelve a tocar.
export function TomarFotoBoton({ onFotos, disabled, label = "Tomar foto", className }: {
  onFotos: (fotos: File[]) => void
  disabled?: boolean
  label?: string
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) onFotos(fs); e.target.value = "" }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className={cn("h-10 gap-2 text-sm", className)}
      >
        <Camera className="h-4 w-4" />
        {label}
      </Button>
    </>
  )
}
