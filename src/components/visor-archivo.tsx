"use client"

import { useEffect, useRef, useState } from "react"
import { Download, FileText, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCloseOnBack } from "@/hooks/use-close-on-back"
import type { TipoVisor } from "@/lib/equipos"

// Visor de un archivo dentro del sistema, sobre la misma pantalla — sin abrir otra pestaña.
// Mismo diseño que el visor de reports. El padre lo monta solo mientras está abierto.
//  - "pdf" e "imagen" los muestra el navegador.
//  - "docx", "xlsx" y "texto" se dibujan aquí mismo en el navegador (el archivo no sale a ningún servicio externo).
//  - "otro" (p. ej. .doc antiguo) no se puede mostrar: se ofrece descargarlo.
const MAX_FILAS_XLSX = 500
type Hoja = { nombre: string; filas: string[][] }

export function VisorArchivo({ url, titulo, subtitulo, tipo, onClose }: {
  url: string
  titulo: string
  subtitulo?: string
  tipo: TipoVisor
  onClose: () => void
}) {
  const [cargando, setCargando] = useState(tipo !== "otro")
  const [falla, setFalla] = useState(false)
  const [texto, setTexto] = useState("")
  const [hojas, setHojas] = useState<Hoja[]>([])
  const docxRef = useRef<HTMLDivElement>(null)
  // El botón "Atrás" del navegador cierra el visor en vez de salir del módulo.
  useCloseOnBack(true, onClose)

  // Word, Excel y texto: se baja el archivo y se dibuja aquí. Si algo falla, queda el botón de descargar.
  useEffect(() => {
    if (tipo !== "docx" && tipo !== "xlsx" && tipo !== "texto") return
    let activo = true
    ;(async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        if (tipo === "texto") { const t = await res.text(); if (activo) setTexto(t) }
        else if (tipo === "docx") {
          const { renderAsync } = await import("docx-preview")
          if (activo && docxRef.current) await renderAsync(await res.blob(), docxRef.current, undefined, { inWrapper: true, ignoreWidth: false })
        } else {
          const ExcelJS = (await import("exceljs")).default
          const wb = new ExcelJS.Workbook()
          await wb.xlsx.load(await res.arrayBuffer())
          const hs = wb.worksheets.map(ws => {
            const filas: string[][] = []
            ws.eachRow({ includeEmpty: false }, (row, n) => {
              if (n > MAX_FILAS_XLSX) return
              const celdas: string[] = []
              for (let c = 1; c <= ws.columnCount; c++) celdas.push(row.getCell(c).text ?? "")
              filas.push(celdas)
            })
            return { nombre: ws.name, filas }
          })
          if (activo) setHojas(hs)
        }
      } catch { if (activo) setFalla(true) }
      if (activo) setCargando(false)
    })()
    return () => { activo = false }
  }, [url, tipo])

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
        {tipo === "docx" && <div ref={docxRef} className="h-full overflow-auto" />}
        {tipo === "texto" && !falla && <pre className="h-full overflow-auto p-4 text-xs whitespace-pre-wrap bg-background">{texto}</pre>}
        {tipo === "xlsx" && !falla && (
          <div className="h-full overflow-auto p-4 space-y-6 bg-background">
            {hojas.map(h => (
              <div key={h.nombre}>
                <p className="text-xs font-semibold mb-1">{h.nombre}</p>
                <table className="text-xs border-collapse">
                  <tbody>
                    {h.filas.map((f, i) => (
                      <tr key={i}>{f.map((c, j) => <td key={j} className="border border-border/60 px-2 py-1 whitespace-nowrap">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {h.filas.length >= MAX_FILAS_XLSX && <p className="text-[11px] text-muted-foreground mt-1">Se muestran las primeras {MAX_FILAS_XLSX} filas; descarga el archivo para verlo completo.</p>}
              </div>
            ))}
          </div>
        )}
        {(tipo === "otro" || falla) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{falla ? "No se pudo mostrar el archivo en el sistema" : "Este tipo de archivo no se puede mostrar en el sistema"}</p>
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
