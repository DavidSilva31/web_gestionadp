"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Loader2, FileText } from "lucide-react"
import { useCloseOnBack } from "@/hooks/use-close-on-back"
import type { Report } from "@/types/database"

interface Props {
  report:     Report
  onClose:    () => void
  onDownload: () => void | Promise<void>
}

export function ReportPreviewModal({ report, onClose, onDownload }: Props) {
  const [loading,       setLoading]      = useState(true)
  const [downloading,   setDownloading]  = useState(false)
  const [downloadError, setDownloadError] = useState(false)

  // Este componente solo existe montado mientras el modal está abierto (el
  // padre lo desmonta al cerrar) — así que "open" es simplemente "true"
  // mientras exista, y el back del navegador lo cierra en vez de salir del
  // módulo.
  useCloseOnBack(true, onClose)

  async function handleDownloadClick() {
    setDownloading(true)
    setDownloadError(false)
    try {
      await onDownload()
    } catch (err) {
      console.error("[report-preview-modal] error descargando PDF:", err)
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm">

      {/* ── Barra superior ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-background border-b border-border/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[13px] font-semibold leading-tight">
              REP-{String(report.numero).padStart(3, "0")}
            </p>
            <p className="text-[11px] text-muted-foreground">{report.cliente} · {report.fecha}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {downloadError && (
            <span className="text-[11px] text-destructive">Error al descargar</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownloadClick}
            disabled={downloading}
            className="h-8 gap-1.5 text-[12px]"
          >
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />
            }
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
            <p className="text-sm">Generando vista previa…</p>
          </div>
        )}
        {/* El PDF se genera en el servidor (/api/reports/[id]/pdf) y se sirve
            con Content-Disposition — a diferencia de un blob: URL armado en
            el navegador, esto sí le da al botón de descarga del visor nativo
            del PDF (el de su propia barra, no el "Descargar" de acá arriba)
            un nombre de archivo real para sugerir al guardar. */}
        <iframe
          src={`/api/reports/${report.id}/pdf`}
          className="w-full h-full border-0"
          title={`Report REP-${String(report.numero).padStart(3, "0")}`}
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  )
}
