"use client"

import { useEffect, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { X, Loader2, FileText, Download } from "lucide-react"
import { useCloseOnBack } from "@/hooks/use-close-on-back"
import { nombreArchivoTarifado } from "@/lib/tarifado-transporte-pdf-build"
import type { TarifadoPDFData } from "@/components/tarifado-transporte/tarifado-pdf"

export function TarifadoPreviewModal({ data, onClose }: { data: TarifadoPDFData; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useCloseOnBack(true, onClose)

  useEffect(() => {
    let objectUrl: string | undefined
    ;(async () => {
      try {
        const { pdf } = await import("@react-pdf/renderer")
        const { TarifadoPDF } = await import("@/components/tarifado-transporte/tarifado-pdf")
        objectUrl = URL.createObjectURL(await pdf(<TarifadoPDF data={data} />).toBlob())
        setUrl(objectUrl)
      } catch {
        setError(true)
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
            <p className="text-[13px] font-semibold leading-tight">Tarifado Transporte N° {data.numero}</p>
            <p className="text-[11px] text-muted-foreground">{data.cliente.razonSocial} · {data.emisor.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {url && (
            <a href={url} download={nombreArchivoTarifado(data)}
              className={buttonVariants({ size: "sm", variant: "outline", className: "h-8 gap-1.5 text-[12px]" })}>
              <Download className="h-3.5 w-3.5" /> Descargar
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {!url && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Generando tarifado…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No se pudo generar la vista previa</p>
          </div>
        )}
        {url && <iframe src={url} className="w-full h-full border-0" title={`Tarifado ${data.numero}`} />}
      </div>
    </div>
  )
}
