"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Loader2, FileText } from "lucide-react"
import type { AnaliticaPDFData } from "@/components/analitica/analitica-pdf"

interface Props {
  data:       AnaliticaPDFData
  onClose:    () => void
  onDownload: () => void
}

export function AnaliticaPreviewModal({ data, onClose, onDownload }: Props) {
  const [url,     setUrl]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    let objectUrl: string
    ;(async () => {
      try {
        const { pdf }          = await import("@react-pdf/renderer")
        const { AnaliticaPDF } = await import("@/components/analitica/analitica-pdf")
        const blob  = await pdf(<AnaliticaPDF data={data} />).toBlob()
        objectUrl   = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    })()
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [data])

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">

      {/* ── Barra superior ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[13px] font-semibold leading-tight">Informe de Analítica</p>
            <p className="text-[11px] text-muted-foreground">{data.periodoLabel} · Altos del Puerto</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onDownload}
            disabled={loading || error}
            className="h-8 gap-1.5 text-[12px]"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Generando informe…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No se pudo generar la vista previa</p>
          </div>
        )}
        {url && !error && (
          <iframe
            src={url}
            className="w-full h-full border-0"
            title="Informe de Analítica"
          />
        )}
      </div>
    </div>
  )
}
