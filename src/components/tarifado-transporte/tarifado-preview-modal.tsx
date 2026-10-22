"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Loader2, FileText, CloudUpload, CloudCheck, CloudAlert } from "lucide-react"
import { useCloseOnBack } from "@/hooks/use-close-on-back"
import { nombreArchivoTarifado } from "@/lib/tarifado-transporte-pdf-build"
import type { TarifadoPDFData } from "@/components/tarifado-transporte/tarifado-pdf"

type EstadoSharePoint = { tipo: "subiendo" | "ok" | "error"; mensaje?: string }

// El PDF se sirve desde el servidor (/api/tarifado-transporte/[id]/pdf, con Content-Disposition) para que
// al guardarlo desde el visor del navegador el archivo se llame como el tarifado y no como el UUID del blob.
export function TarifadoPreviewModal({ data, tarifadoId, onClose }: { data: TarifadoPDFData; tarifadoId: string; onClose: () => void }) {
  const url = `/api/tarifado-transporte/${tarifadoId}/pdf`
  const [cargando, setCargando] = useState(true)
  const [sharePoint, setSharePoint] = useState<EstadoSharePoint | null>(null)

  useCloseOnBack(true, onClose)

  async function subirASharePoint() {
    setSharePoint({ tipo: "subiendo" })
    try {
      const res0 = await fetch(url)
      if (!res0.ok) throw new Error("No se pudo obtener el PDF")
      const blob = await res0.blob()
      const anio = data.fecha.match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear())
      const nombreArchivo = nombreArchivoTarifado(data)
      const form = new FormData()
      form.append("file", blob, nombreArchivo)
      form.append("nombreArchivo", nombreArchivo)
      form.append("anio", anio)
      const res = await fetch("/api/tarifado-transporte/sharepoint", { method: "POST", body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "No se pudo subir a SharePoint")
      setSharePoint({ tipo: "ok" })
    } catch (err) {
      setSharePoint({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error desconocido" })
    }
  }

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
          {sharePoint?.tipo === "subiendo" && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> Subiendo a SharePoint…
            </span>
          )}
          {sharePoint?.tipo === "ok" && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-600">
              <CloudCheck className="h-3.5 w-3.5" /> Guardado en SharePoint
            </span>
          )}
          {sharePoint?.tipo === "error" && (
            <span className="flex items-center gap-1.5 text-[11px] text-destructive" title={sharePoint.mensaje}>
              <CloudAlert className="h-3.5 w-3.5" /> No se pudo subir a SharePoint
            </span>
          )}
          <Button size="sm" variant="outline" onClick={subirASharePoint}
            disabled={cargando || sharePoint?.tipo === "subiendo"}
            className="h-8 gap-1.5 text-[12px]">
            <CloudUpload className="h-3.5 w-3.5" />
            Subir a SharePoint
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {cargando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Generando tarifado…</p>
          </div>
        )}
        <iframe src={url} className="w-full h-full border-0" title={`Tarifado ${data.numero}`} onLoad={() => setCargando(false)} />
      </div>
    </div>
  )
}
