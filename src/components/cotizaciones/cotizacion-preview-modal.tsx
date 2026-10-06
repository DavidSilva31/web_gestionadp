"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Loader2, FileText } from "lucide-react"
import { useCloseOnBack } from "@/hooks/use-close-on-back"
import type { CotizacionPDFData } from "@/components/cotizaciones/cotizacion-pdf"

interface Props {
  data:       CotizacionPDFData
  onClose:    () => void
  onDownload: () => void
}

export function CotizacionPreviewModal({ data, onClose, onDownload }: Props) {
  const [url,     setUrl]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useCloseOnBack(true, onClose)

  useEffect(() => {
    let objectUrl: string | undefined
    ;(async () => {
      try {
        const { pdf }        = await import("@react-pdf/renderer")
        const { CotizacionPDF } = await import("@/components/cotizaciones/cotizacion-pdf")
        const blob = await pdf(<CotizacionPDF data={data} />).toBlob()
        objectUrl  = URL.createObjectURL(blob)
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
      <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[13px] font-semibold leading-tight">Cotización N° {data.numero}</p>
            <p className="text-[11px] text-muted-foreground">{data.cliente.razonSocial} · {data.emisor.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDownload} disabled={loading || error} className="h-8 gap-1.5 text-[12px]">
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Generando cotización…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No se pudo generar la vista previa</p>
          </div>
        )}
        {url && !error && (
          <iframe src={url} className="w-full h-full border-0" title={`Cotización ${data.numero}`} />
        )}
      </div>
    </div>
  )
}
