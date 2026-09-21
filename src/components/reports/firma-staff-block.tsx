"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Loader2, PenLine } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { firmarReport, type ResultadoFirma } from "@/lib/report-firmas"
import type { EvidenciaFirma, FirmaEvidencia, RolFirma } from "@/lib/firma-hash"

interface Props {
  reportId:         string
  rol:              Exclude<RolFirma, "conductor">
  titulo:           string
  path:             string | null
  evidencia?:       EvidenciaFirma
  bloqueada:        boolean          // report despachado
  tieneFirmaPerfil: boolean
  onSigned:         (res: ResultadoFirma) => void
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// Firma de Recepción / encargado de bodega: se aplica con un clic usando la
// firma guardada en el perfil del usuario (Configuración → Mi firma). Queda
// registrada con fecha/hora, usuario, IP y huella del contenido.
export function FirmaStaffBlock({ reportId, rol, titulo, path, evidencia, bloqueada, tieneFirmaPerfil, onSigned }: Props) {
  const [url,     setUrl]     = useState<string | null>(null)
  const [urlErr,  setUrlErr]  = useState(false)
  const [signing, setSigning] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    createClient().storage.from("reports-firmados").createSignedUrl(path, 3600)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data) { console.error("[firma-staff-block] error generando URL de la firma:", err); setUrlErr(true); return }
        setUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [path])

  async function firmar() {
    setSigning(true)
    setError(null)
    try {
      onSigned(await firmarReport(reportId, rol))
    } catch (err) {
      console.error("[firma-staff-block] error firmando:", err)
      setError(err instanceof Error ? err.message : "No se pudo registrar la firma.")
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-bold text-foreground">{titulo}</h3>

      {path ? (
        <>
          <div className="rounded-lg border bg-white overflow-hidden h-[90px] flex items-center justify-center">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={titulo} className="max-w-full max-h-full object-contain" />
            ) : urlErr ? (
              <span className="flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> No se pudo cargar</span>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {evidencia && (
            <p className="flex items-start gap-1 text-[10.5px] text-muted-foreground leading-snug">
              <CheckCircle2 className="h-3 w-3 mt-px flex-shrink-0 text-emerald-600" />
              <span>Firmado electrónicamente por {evidencia.user_nombre} · {fechaHora(evidencia.at)} · Cód. {evidencia.hash.slice(0, 8).toUpperCase()}</span>
            </p>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 h-[90px] flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
          {bloqueada ? "Sin firma" : "Pendiente de firma"}
        </div>
      )}

      {!bloqueada && (
        tieneFirmaPerfil ? (
          <button
            type="button"
            onClick={firmar}
            disabled={signing}
            className="self-start flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted/60 disabled:opacity-60"
          >
            {signing ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
            {path ? "Volver a firmar" : "Firmar con mi firma"}
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Aún no registras tu firma.{" "}
            <Link href="/configuracion" className="text-primary underline underline-offset-2">Regístrala en Configuración</Link>
          </p>
        )
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

interface RecepcionDespachoProps {
  reportId: string
  /** Avisa si el report ya tiene la firma de Recepción (al cargar y al firmar). */
  onChange: (firmado: boolean) => void
}

// Firma de Recepción al confirmar el despacho: carga el estado actual de la
// firma del report, deja firmar con un clic y le avisa al modal/tarjeta de
// despacho si ya está firmado (sin firma no se confirma la salida).
export function FirmaRecepcionDespacho({ reportId, onChange }: RecepcionDespachoProps) {
  const { profile } = useAuth()
  const [path,      setPath]      = useState<string | null>(null)
  const [evidencia, setEvidencia] = useState<EvidenciaFirma | undefined>()
  const [loaded,    setLoaded]    = useState(false)

  useEffect(() => {
    let cancelled = false
    createClient().from("reports").select("firma_recepcion_url, firma_evidencia").eq("id", reportId).single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error("[firma-recepcion-despacho] error leyendo la firma:", error)
        const p = (data?.firma_recepcion_url as string | null) ?? null
        setPath(p)
        setEvidencia((data?.firma_evidencia as FirmaEvidencia | null)?.recepcion)
        setLoaded(true)
        onChange(!!p)
      })
    return () => { cancelled = true }
    // onChange es un setState del padre — estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  if (!loaded) return <div className="h-[90px] flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>

  return (
    <FirmaStaffBlock
      reportId={reportId}
      rol="recepcion"
      titulo="Firma de Recepción"
      path={path}
      evidencia={evidencia}
      bloqueada={false}
      tieneFirmaPerfil={!!profile?.firma_url}
      onSigned={res => { setPath(res.path); setEvidencia(res.evidencia.recepcion); onChange(true) }}
    />
  )
}
