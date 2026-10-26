"use client"

import { useState } from "react"
import { Download, FileText, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloseOnBack } from "@/hooks/use-close-on-back"

// Visor de un archivo dentro del sistema, sobre la misma pantalla — sin abrir otra pestaña.
// Mismo diseño que el visor de reports. El padre lo monta solo mientras está abierto.
//  - "pdf" e "imagen" se ven aquí mismo.
//  - "otro" (Word, etc.) el navegador no lo puede mostrar: se ofrece descargarlo.
export function VisorArchivo({ url, titulo, subtitulo, tipo, onClose }: {
  url: string
  titulo: string
  subtitulo?: string
  tipo: "pdf" | "imagen" | "otro"
  onClose: () => void
}) {
  const [cargando, setCargando] = useState(tipo !== "otro")
  // El botón "Atrás" del navegador cierra el visor en vez de salir del módulo.
  useCloseOnBack(true, onClose)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight truncate">{titulo}</p>
            {subtitulo && <p className="text-[11px] text-muted-foreground truncate">{subtitulo}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} download target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]">
              <Download className="h-3.5 w-3.5" /> Descargar
            </Button>
          </a>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-muted/30">
        {cargando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Cargando…</p>
          </div>
        )}
        {tipo === "imagen" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={titulo} onLoad={() => setCargando(false)} onError={() => setCargando(false)} className="mx-auto h-full max-w-full object-contain" />
        )}
        {tipo === "pdf" && (
          <iframe src={url} title={titulo} onLoad={() => setCargando(false)} className="w-full h-full border-0 bg-white" />
        )}
        {tipo === "otro" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Este tipo de archivo no se puede mostrar en el sistema</p>
            <p className="text-xs text-muted-foreground">Descárgalo para abrirlo en tu computador (Word, escaneos y otros formatos).</p>
            <a href={url} download target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" /> Descargar archivo</Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
