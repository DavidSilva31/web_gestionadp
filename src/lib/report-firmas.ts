import { createClient } from "@/lib/supabase"
import { hashContenidoReport, type FirmaEvidencia, type RolFirma } from "@/lib/firma-hash"

// ── Firmar ──────────────────────────────────────────────────────────────

export interface ResultadoFirma {
  path:      string
  evidencia: FirmaEvidencia
}

// Registra la firma en el servidor. `firma` (data URL PNG) solo aplica al
// conductor; Recepción y bodega usan la firma guardada en el perfil.
export async function firmarReport(reportId: string, rol: RolFirma, firma?: string): Promise<ResultadoFirma> {
  const res = await fetch("/api/reports/firmar", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ reportId, rol, firma }),
  })
  const data = await res.json().catch(() => ({})) as { error?: string; path?: string; evidencia?: FirmaEvidencia }
  if (!res.ok || !data.path || !data.evidencia) throw new Error(data.error ?? "No se pudo registrar la firma.")
  return { path: data.path, evidencia: data.evidencia }
}

export async function guardarFirmaPerfil(firma: string): Promise<string> {
  const res = await fetch("/api/profile/firma", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ firma }),
  })
  const data = await res.json().catch(() => ({})) as { error?: string; path?: string }
  if (!res.ok || !data.path) throw new Error(data.error ?? "No se pudo guardar la firma.")
  return data.path
}

// ── Firmas para el PDF ──────────────────────────────────────────────────

export interface FirmaPdf {
  url:        string | null   // URL firmada de la imagen
  nombre:     string          // quién aplicó la firma
  at:         string          // ISO
  codigo:     string          // primeros 8 hex de la huella del contenido
  modificado: boolean         // el report cambió después de firmar
}
export type FirmasPdf = Partial<Record<RolFirma, FirmaPdf>>

const COLUMNA: Record<RolFirma, "firma_conductor_url" | "firma_recepcion_url" | "firma_bodega_url"> = {
  conductor: "firma_conductor_url",
  recepcion: "firma_recepcion_url",
  bodega:    "firma_bodega_url",
}

// Trae las firmas del report (siempre desde la BD, no del objeto que llegue a
// la vista previa — varias pantallas cargan solo algunas columnas) y verifica
// que el contenido no haya cambiado desde que se firmó.
export async function cargarFirmasReport(reportId: string): Promise<FirmasPdf> {
  const supabase = createClient()
  const { data: row, error } = await supabase.from("reports").select("*").eq("id", reportId).single()
  if (error || !row) {
    console.error("[report-firmas] error leyendo el report para las firmas:", error)
    return {}
  }
  const evidencia = (row.firma_evidencia ?? {}) as FirmaEvidencia

  const out: FirmasPdf = {}
  for (const rol of ["conductor", "recepcion", "bodega"] as RolFirma[]) {
    const path = row[COLUMNA[rol]] as string | null
    if (!path) continue
    const ev = evidencia[rol]
    const { data, error: urlErr } = await supabase.storage.from("reports-firmados").createSignedUrl(path, 3600)
    if (urlErr) console.error(`[report-firmas] error generando URL de la firma (${rol}):`, urlErr)
    out[rol] = {
      url:        data?.signedUrl ?? null,
      nombre:     ev?.user_nombre ?? "",
      at:         ev?.at ?? "",
      codigo:     ev ? ev.hash.slice(0, 8).toUpperCase() : "",
      // Firmas anteriores a la firma electrónica no tienen evidencia — no se
      // pueden verificar, pero tampoco se marcan como modificadas.
      modificado: ev ? ev.hash !== await hashContenidoReport(row as Record<string, unknown>, rol) : false,
    }
  }
  return out
}
