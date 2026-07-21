import { createClient } from "@/lib/supabase"

export type AuditAccion =
  | "report.crear_borrador"
  | "report.actualizar"
  | "report.enviar_despacho"
  | "report.confirmar_despacho"
  | "report.despachar"
  | "report.eliminar"
  | "inventario.ingreso"
  | "inventario.despacho"
  | "admin.crear_usuario"
  | "admin.eliminar_usuario"
  | "admin.actualizar_usuario"

export interface AuditLog {
  id:             string
  tabla:          string
  registro_id:    string
  accion:         AuditAccion
  descripcion:    string | null
  datos_prev:     Record<string, unknown> | null
  datos_nuevo:    Record<string, unknown> | null
  usuario_id:     string | null
  usuario_nombre: string | null
  created_at:     string
}

const ACCION_LABEL: Record<AuditAccion, string> = {
  "report.crear_borrador":       "Report creado como borrador",
  "report.actualizar":           "Report actualizado",
  "report.enviar_despacho":      "Enviado a cola de despacho",
  "report.confirmar_despacho":   "Despacho confirmado",
  "report.despachar":            "Despacho confirmado con documento firmado",
  "report.eliminar":             "Report eliminado",
  "inventario.ingreso":          "Ingreso registrado en inventario",
  "inventario.despacho":         "Despacho registrado en inventario",
  "admin.crear_usuario":         "Usuario creado",
  "admin.eliminar_usuario":      "Usuario eliminado",
  "admin.actualizar_usuario":    "Usuario actualizado",
}

export function accionLabel(accion: string) {
  return ACCION_LABEL[accion as AuditAccion] ?? accion
}

interface AuditPayload {
  tabla:           string
  registro_id:     string
  accion:          AuditAccion
  descripcion?:    string
  datos_prev?:     Record<string, unknown> | null
  datos_nuevo?:    Record<string, unknown> | null
  usuario_id?:     string | null
  usuario_nombre?: string | null
}

// Versión cliente — usar desde componentes React.
// Nunca rechaza: la mayoría de las llamadas son fire-and-forget (sin await/catch
// en el caller), así que un reject acá se volvería un unhandled promise rejection.
export async function logAudit(payload: AuditPayload) {
  try {
    const supabase = createClient()
    const { error } = await supabase.from("audit_logs").insert({
      tabla:          payload.tabla,
      registro_id:    payload.registro_id,
      accion:         payload.accion,
      descripcion:    payload.descripcion    ?? null,
      datos_prev:     payload.datos_prev     ?? null,
      datos_nuevo:    payload.datos_nuevo    ?? null,
      usuario_id:     payload.usuario_id     ?? null,
      usuario_nombre: payload.usuario_nombre ?? null,
    })
    if (error) console.error("[audit] error registrando log:", payload.accion, error)
  } catch (err) {
    console.error("[audit] excepción registrando log:", payload.accion, err)
  }
}

// Versión servidor — usar desde API routes (usa el service role key)
export async function logAuditServer(payload: AuditPayload) {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin")
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      tabla:          payload.tabla,
      registro_id:    payload.registro_id,
      accion:         payload.accion,
      descripcion:    payload.descripcion    ?? null,
      datos_prev:     payload.datos_prev     ?? null,
      datos_nuevo:    payload.datos_nuevo    ?? null,
      usuario_id:     payload.usuario_id     ?? null,
      usuario_nombre: payload.usuario_nombre ?? null,
    })
    if (error) console.error("[audit] error registrando log:", payload.accion, error)
  } catch (err) {
    console.error("[audit] excepción registrando log:", payload.accion, err)
  }
}
