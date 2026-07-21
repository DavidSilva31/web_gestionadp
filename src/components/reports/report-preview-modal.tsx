"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Loader2, FileText } from "lucide-react"
import type { Report } from "@/types/database"

interface Props {
  report:     Report
  onClose:    () => void
  onDownload: () => void | Promise<void>
}

export function ReportPreviewModal({ report, onClose, onDownload }: Props) {
  const [url,          setUrl]          = useState<string | null>(null)
  const [loading,       setLoading]      = useState(true)
  const [error,         setError]        = useState(false)
  const [downloading,   setDownloading]  = useState(false)
  const [downloadError, setDownloadError] = useState(false)

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

  useEffect(() => {
    let objectUrl: string
    ;(async () => {
      try {
        const { pdf }       = await import("@react-pdf/renderer")
        const { ReportPDF } = await import("@/components/reports/report-pdf")
        const blob  = await pdf(<ReportPDF report={report} />).toBlob()
        objectUrl   = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    })()
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [report])

  // Cerrar con Escape
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
            disabled={loading || error || downloading}
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
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Generando vista previa…</p>
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
            title={`Report REP-${String(report.numero).padStart(3, "0")}`}
          />
        )}
      </div>
    </div>
  )
}
