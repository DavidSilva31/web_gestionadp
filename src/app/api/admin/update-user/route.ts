import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"
import { MODULE_LABEL, ROLE_MODULE_DEFAULTS } from "@/lib/modulos"
import { ROLE_LABELS, type UserRole } from "@/types/auth"

const VALID_ROLES = ["super_admin", "operador", "operador_carga"] as const

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles").select("role, nombre, activo").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/update-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!adminProfile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })
    if (adminProfile.role !== "super_admin")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    let body: { id?: string; role?: string; activo?: boolean; permisos?: string[] | null }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { id, role, activo, permisos } = body
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    if (id === user.id)
      return NextResponse.json({ error: "No puedes modificar tu propio rol o estado" }, { status: 400 })

    // Estado anterior del usuario, para describir qué cambió en la auditoría.
    const { data: antes } = await supabaseAdmin
      .from("profiles").select("nombre, role, activo, permisos").eq("id", id).single()

    const updates: Record<string, unknown> = {}

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
        return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
      updates.role = role
    }
    if (activo !== undefined) updates.activo = Boolean(activo)
    if (permisos !== undefined) updates.permisos = permisos

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: "Sin cambios que aplicar" }, { status: 400 })

    const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", id)
    if (error) {
      console.error("[admin/update-user] error actualizando perfil:", error)
      return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 })
    }

    // Al desactivar: banear en Auth para que no pueda volver a autenticarse ni
    // refrescar su sesión ya abierta (además del corte inmediato en proxy.ts
    // y en cada ruta /api/* que valida profiles.activo por su cuenta). Al
    // reactivar, se remueve el ban. profiles.activo ya quedó en false arriba
    // de todas formas — si esto falla, el usuario queda igual bloqueado por
    // esos otros chequeos, pero avisamos al admin para que no crea que el
    // baneo de Auth se aplicó cuando no fue así.
    let banWarning = false
    if (activo !== undefined) {
      const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: activo ? "none" : "876000h",
      })
      if (banErr) {
        console.error("[admin/update-user] error actualizando ban de Auth:", banErr)
        banWarning = true
      }
    }

    // Mensaje legible: a quién se le cambió y qué cambió, con nombres de módulo
    // (no el arreglo crudo de rutas). Ej: "Gonzalo Bozzolo: permisos +Reports, −Auditoría".
    const nombreRol = (r: unknown) => ROLE_LABELS[r as UserRole] ?? String(r)
    const nombreMod = (ruta: string) => MODULE_LABEL[ruta] ?? ruta
    const partes: string[] = []
    if (updates.role !== undefined && updates.role !== antes?.role) {
      partes.push(`rol ${antes ? nombreRol(antes.role) : "?"} → ${nombreRol(updates.role)}`)
    }
    if (updates.activo !== undefined && updates.activo !== antes?.activo) {
      partes.push(updates.activo ? "reactivado" : "desactivado")
    }
    if (updates.permisos !== undefined) {
      if (updates.permisos === null) {
        partes.push("permisos restablecidos a los del rol")
      } else {
        const nuevos = updates.permisos as string[]
        const previos: string[] = antes?.permisos ?? (antes ? ROLE_MODULE_DEFAULTS[antes.role as UserRole] ?? [] : [])
        const agregados = nuevos.filter(p => !previos.includes(p)).map(nombreMod)
        const quitados  = previos.filter(p => !nuevos.includes(p)).map(nombreMod)
        const cambiosPerm = [...agregados.map(m => `+${m}`), ...quitados.map(m => `−${m}`)]
        partes.push(cambiosPerm.length > 0 ? `permisos ${cambiosPerm.join(", ")}` : "permisos sin cambios")
      }
    }
    const cambios = `${antes?.nombre ?? "Usuario"}: ${partes.length > 0 ? partes.join("; ") : "sin cambios"}`

    await logAuditServer({
      tabla:          "profiles",
      registro_id:    id,
      accion:         "admin.actualizar_usuario",
      descripcion:    `${cambios} — por ${adminProfile?.nombre ?? user.email}`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/update-user] error registrando auditoría:", err))

    return NextResponse.json({ success: true, banWarning })
  } catch (err) {
    console.error("[admin/update-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
