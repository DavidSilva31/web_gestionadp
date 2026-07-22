import { createClient } from "@/lib/supabase"
import {
  FileText, FilePen, FileCheck2, Truck, ScanLine, Trash2,
  PackagePlus, PackageMinus, Boxes, Users, Wrench, Coins,
  UserPlus, UserMinus, UserCog, type LucideIcon,
} from "lucide-react"

export type AuditAccion =
  | "report.crear_borrador"
  | "report.actualizar"
  | "report.enviar_despacho"
  | "report.confirmar_despacho"
  | "report.despachar"
  | "report.eliminar"
  | "inventario.ingreso"
  | "inventario.despacho"
  | "inventario.crear_item"
  | "inventario.actualizar_item"
  | "inventario.eliminar_item"
  | "cliente.crear"
  | "cliente.actualizar"
  | "servicio.crear"
  | "servicio.actualizar"
  | "servicio.eliminar"
  | "tarifa.crear"
  | "tarifa.actualizar"
  | "perfil.actualizar"
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
  "inventario.crear_item":       "Ítem de inventario creado",
  "inventario.actualizar_item":  "Ítem de inventario actualizado",
  "inventario.eliminar_item":    "Ítem de inventario eliminado",
  "cliente.crear":               "Cliente creado",
  "cliente.actualizar":          "Cliente actualizado",
  "servicio.crear":              "Servicio creado",
  "servicio.actualizar":         "Servicio actualizado",
  "servicio.eliminar":           "Servicio eliminado",
  "tarifa.crear":                "Tarifa creada",
  "tarifa.actualizar":           "Tarifa actualizada",
  "perfil.actualizar":           "Perfil actualizado",
  "admin.crear_usuario":         "Usuario creado",
  "admin.eliminar_usuario":      "Usuario eliminado",
  "admin.actualizar_usuario":    "Usuario actualizado",
}

export function accionLabel(accion: string) {
  return ACCION_LABEL[accion as AuditAccion] ?? accion
}

// Ícono + color por acción — compartido entre Auditoría y el dropdown de notificaciones.
export const ACCION_STYLE: Record<string, { icon: LucideIcon; pill: string }> = {
  "report.crear_borrador":      { icon: FileText,      pill: "bg-gray-100    text-gray-600    dark:bg-gray-800     dark:text-gray-400"    },
  "report.actualizar":          { icon: FilePen,       pill: "bg-blue-100    text-blue-700    dark:bg-blue-900/30  dark:text-blue-400"    },
  "report.enviar_despacho":     { icon: FileCheck2,    pill: "bg-amber-100   text-amber-700   dark:bg-amber-900/30 dark:text-amber-400"   },
  "report.confirmar_despacho":  { icon: Truck,         pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "report.despachar":           { icon: ScanLine,      pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "report.eliminar":            { icon: Trash2,        pill: "bg-red-100     text-red-700     dark:bg-red-900/30   dark:text-red-400"     },
  "inventario.ingreso":         { icon: PackagePlus,   pill: "bg-sky-100     text-sky-700     dark:bg-sky-900/30   dark:text-sky-400"     },
  "inventario.despacho":        { icon: PackageMinus,  pill: "bg-violet-100  text-violet-700  dark:bg-violet-900/30 dark:text-violet-400"  },
  "inventario.crear_item":      { icon: Boxes,         pill: "bg-sky-100     text-sky-700     dark:bg-sky-900/30   dark:text-sky-400"     },
  "inventario.actualizar_item": { icon: Boxes,         pill: "bg-blue-100    text-blue-700    dark:bg-blue-900/30  dark:text-blue-400"    },
  "inventario.eliminar_item":   { icon: Trash2,        pill: "bg-red-100     text-red-700     dark:bg-red-900/30   dark:text-red-400"     },
  "cliente.crear":              { icon: Users,         pill: "bg-teal-100    text-teal-700    dark:bg-teal-900/30  dark:text-teal-400"    },
  "cliente.actualizar":         { icon: Users,         pill: "bg-blue-100    text-blue-700    dark:bg-blue-900/30  dark:text-blue-400"    },
  "servicio.crear":             { icon: Wrench,        pill: "bg-teal-100    text-teal-700    dark:bg-teal-900/30  dark:text-teal-400"    },
  "servicio.actualizar":        { icon: Wrench,        pill: "bg-blue-100    text-blue-700    dark:bg-blue-900/30  dark:text-blue-400"    },
  "servicio.eliminar":          { icon: Trash2,        pill: "bg-red-100     text-red-700     dark:bg-red-900/30   dark:text-red-400"     },
  "tarifa.crear":               { icon: Coins,         pill: "bg-teal-100    text-teal-700    dark:bg-teal-900/30  dark:text-teal-400"    },
  "tarifa.actualizar":          { icon: Coins,         pill: "bg-blue-100    text-blue-700    dark:bg-blue-900/30  dark:text-blue-400"    },
  "perfil.actualizar":          { icon: UserCog,       pill: "bg-indigo-100  text-indigo-700  dark:bg-indigo-900/30 dark:text-indigo-400"  },
  "admin.crear_usuario":        { icon: UserPlus,      pill: "bg-teal-100    text-teal-700    dark:bg-teal-900/30  dark:text-teal-400"    },
  "admin.eliminar_usuario":     { icon: UserMinus,     pill: "bg-rose-100    text-rose-700    dark:bg-rose-900/30  dark:text-rose-400"    },
  "admin.actualizar_usuario":   { icon: UserCog,       pill: "bg-indigo-100  text-indigo-700  dark:bg-indigo-900/30 dark:text-indigo-400"  },
}

// Subset de acciones que generan campanita/notificación — evita saturar con
// ediciones rutinarias (ej. report.actualizar) que sí quedan en Auditoría
// pero no ameritan una notificación push.
export const NOTIFY_ACCIONES: AuditAccion[] = [
  "report.crear_borrador",
  "report.enviar_despacho",
  "report.despachar",
  "report.eliminar",
  "inventario.ingreso",
  "inventario.despacho",
  "inventario.crear_item",
  "inventario.eliminar_item",
  "cliente.crear",
  "servicio.crear",
  "servicio.eliminar",
  "tarifa.crear",
  "admin.crear_usuario",
  "admin.eliminar_usuario",
  "admin.actualizar_usuario",
]

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
