import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

const VALID_ROLES = ["super_admin", "operador", "operador_carga"] as const

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles").select("role, nombre").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/update-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (adminProfile?.role !== "super_admin")
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

    const cambios = Object.entries(updates)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ")

    await logAuditServer({
      tabla:          "profiles",
      registro_id:    id,
      accion:         "admin.actualizar_usuario",
      descripcion:    `${cambios} — por ${adminProfile?.nombre ?? user.email}`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/update-user] error registrando auditoría:", err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/update-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
