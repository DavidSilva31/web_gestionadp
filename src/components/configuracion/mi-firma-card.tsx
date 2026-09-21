"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { guardarFirmaPerfil } from "@/lib/report-firmas"
import { FirmaCanvas } from "@/components/reports/report-form-widgets"

// Firma personal del usuario. Recepción y el encargado de bodega la aplican
// con un clic a los reports (queda registrada con fecha, usuario e IP).
export function MiFirmaCard() {
  const { profile, refreshProfile } = useAuth()
  const [actualUrl, setActualUrl] = useState<string | null>(null)
  const [editando,  setEditando]  = useState(false)
  const [nueva,     setNueva]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  // Cambia al guardar para volver a pedir la URL firmada de la firma nueva.
  const [version,   setVersion]   = useState(0)
  const path = profile?.firma_url ?? null

  useEffect(() => {
    if (!path) return
    let cancelled = false
    createClient().storage.from("reports-firmados").createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) { console.error("[mi-firma] error generando URL de la firma:", error); return }
        setActualUrl(data.signedUrl)
      })
    return () => { cancelled = true }
  }, [path, version])

  async function guardar() {
    if (!nueva) return
    setSaving(true)
    setMsg(null)
    try {
      await guardarFirmaPerfil(nueva)
      await refreshProfile()
      setVersion(v => v + 1)
      setEditando(false)
      setNueva(null)
      setMsg({ ok: true, text: "Firma guardada" })
    } catch (err) {
      console.error("[mi-firma] error guardando firma:", err)
      setMsg({ ok: false, text: err instanceof Error ? err.message : "No se pudo guardar la firma." })
    } finally {
      setSaving(false)
    }
  }

  const mostrandoLienzo = editando || !path

  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b">
        <PenLine className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-bold text-foreground">Mi firma</h2>
          <p className="text-xs text-muted-foreground">
            Se aplica con un clic al firmar reports como Recepción o encargado de bodega.
          </p>
        </div>
      </div>

      {mostrandoLienzo ? (
        <div className="space-y-2">
          <FirmaCanvas onChange={setNueva} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={guardar} disabled={!nueva || saving} className="h-8 gap-1.5 text-xs">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar firma
            </Button>
            {path && (
              <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setNueva(null) }} className="h-8 text-xs">
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border bg-white h-[120px] flex items-center justify-center overflow-hidden">
            {actualUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={actualUrl} alt="Mi firma" className="max-w-full max-h-full object-contain" />
              : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            }
          </div>
          <Button size="sm" variant="outline" onClick={() => { setEditando(true); setMsg(null) }} className="h-8 text-xs">
            Cambiar firma
          </Button>
        </div>
      )}

      {msg && (
        <p className={msg.ok ? "flex items-center gap-1 text-xs text-emerald-600" : "text-xs text-destructive"}>
          {msg.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
          {msg.text}
        </p>
      )}
    </div>
  )
}
