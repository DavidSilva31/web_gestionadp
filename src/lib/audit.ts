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
}

export function accionLabel(accion: string) {
  return ACCION_LABEL[accion as AuditAccion] ?? accion
}

export async function logAudit({
  tabla,
  registro_id,
  accion,
  descripcion,
  datos_prev,
  datos_nuevo,
  usuario_id,
  usuario_nombre,
}: {
  tabla:          string
  registro_id:    string
  accion:         AuditAccion
  descripcion?:   string
  datos_prev?:    Record<string, unknown> | null
  datos_nuevo?:   Record<string, unknown> | null
  usuario_id?:    string | null
  usuario_nombre?: string | null
}) {
  const supabase = createClient()
  await supabase.from("audit_logs").insert({
    tabla,
    registro_id,
    accion,
    descripcion:    descripcion ?? null,
    datos_prev:     datos_prev  ?? null,
    datos_nuevo:    datos_nuevo ?? null,
    usuario_id:     usuario_id  ?? null,
    usuario_nombre: usuario_nombre ?? null,
  })
}
