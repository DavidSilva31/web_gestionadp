"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, Loader2, Paperclip, Plus, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { validateUploadFile, sanitizeExt } from "@/lib/upload-validation"

interface Props {
  reportId: string
  numero:   number
  /** Paths ya guardados en reports.archivos_pendiente_despacho. */
  initial:  string[]
}

// Archivos adjuntos de un report — disponible en cualquier estado (borrador,
// pendiente_operaciones, pendiente_despacho y despachado). Usa la misma columna
// que el clip de la grilla de /reports y de la cola de despacho
// (reports.archivos_pendiente_despacho), así ambas vistas muestran la misma lista.
// Sube y guarda al instante — no depende del botón "Guardar" del formulario.
export function ReportArchivosPanel({ reportId, numero, initial }: Props) {
  const [archivos,  setArchivos]  = useState<string[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [dragOver,  setDragOver]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(list: FileList | File[]) {
    const files = Array.from(list)
    if (files.length === 0) return
    const invalido = files.map(f => validateUploadFile(f)).find(Boolean)
    if (invalido) { setError(invalido); return }
    setError(null)
    setUploading(true)
    try {
      const supabase = createClient()
      const subidos: string[] = []
      for (let i = 0; i < files.length; i++) {
        const path = `pd-${numero}-${reportId}-${Date.now()}-${i}.${sanitizeExt(files[i].name)}`
        const { error: uploadErr } = await supabase.storage.from("reports-firmados").upload(path, files[i], { upsert: true })
        if (uploadErr) throw uploadErr
        subidos.push(path)
      }
      const nuevos = [...archivos, ...subidos]
      const { error: updateErr } = await supabase.from("reports")
        .update({ archivos_pendiente_despacho: nuevos }).eq("id", reportId)
      if (updateErr) throw updateErr
      setArchivos(nuevos)
    } catch (err) {
      console.error("[report-archivos-panel] error subiendo archivo:", err)
      setError("No se pudo subir el archivo. Intenta de nuevo.")
    } finally {
      setUploading(false)
    }
  }

  async function remove(index: number) {
    const nuevos = archivos.filter((_, i) => i !== index)
    setError(null)
    const { error: err } = await createClient().from("reports")
      .update({ archivos_pendiente_despacho: nuevos }).eq("id", reportId)
    if (err) {
      console.error("[report-archivos-panel] error quitando archivo:", err)
      setError("No se pudo quitar el archivo. Intenta de nuevo.")
      return
    }
    setArchivos(nuevos)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files) }}
      className={cn(
        "rounded-lg border border-dashed px-3 py-2.5 transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          Archivos adjuntos
          {archivos.length > 0 && <span className="text-[11px] font-medium text-muted-foreground">({archivos.length})</span>}
        </h2>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
          className="hidden"
          onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = "" }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted/60 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {uploading ? "Subiendo..." : "Adjuntar"}
        </button>
      </div>

      {archivos.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Sin archivos. Usa &quot;Adjuntar&quot; o arrastra PDF / imágenes aquí.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 max-h-[140px] overflow-y-auto">
          {archivos.map((path, i) => (
            <ArchivoItem key={path} path={path} index={i} onRemove={() => remove(i)} />
          ))}
        </ul>
      )}
      {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

function ArchivoItem({ path, index, onRemove }: { path: string; index: number; onRemove: () => void }) {
  const [url,      setUrl]      = useState<string | null>(null)
  const [failed,   setFailed]   = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const ext = path.split(".").pop()?.toUpperCase() ?? ""

  useEffect(() => {
    let cancelled = false
    createClient().storage.from("reports-firmados").createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) { console.error("[report-archivos-panel] error generando URL firmada:", error); setFailed(true); return }
        setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [path, retryKey])

  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1">
      <a
        href={failed ? "#" : url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        title={failed ? "No se pudo cargar el archivo — clic para reintentar" : undefined}
        onClick={failed ? e => { e.preventDefault(); setFailed(false); setUrl(null); setRetryKey(k => k + 1) } : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-xs",
          url ? "cursor-pointer hover:underline" : failed ? "cursor-pointer text-destructive hover:underline" : "pointer-events-none cursor-wait opacity-60"
        )}
      >
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="truncate">Archivo {index + 1}{failed && " — no se pudo cargar, clic para reintentar"}</span>
        {!failed && <span className="flex-shrink-0 text-[10px] text-muted-foreground">{ext}</span>}
      </a>
      <button type="button" onClick={onRemove} title="Quitar archivo" className="flex-shrink-0 text-muted-foreground hover:text-destructive">
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
