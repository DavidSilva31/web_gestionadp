import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

const VALID_ROLES = ["super_admin", "operador", "operador_carga"] as const

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles").select("role, nombre").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/create-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (adminProfile?.role !== "super_admin")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    let body: { nombre?: string; email?: string; role?: string; permisos?: string[] | null }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { nombre, email, role, permisos } = body
    if (!nombre || !email || !role)
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 })

    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 })

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4400"
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    })
    if (authError) {
      const msg = /already.*registered/i.test(authError.message)
        ? "Ya existe un usuario con ese correo electrónico."
        : "No se pudo crear el usuario. Intenta de nuevo."
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id:                   newUser.user.id,
      email,
      nombre,
      role,
      activo:               true,
      permisos:             permisos ?? null,
      must_change_password: false,
    })
    if (profileError) {
      console.error("[admin/create-user] error creando perfil:", profileError)
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: "Error al crear el perfil del usuario." }, { status: 500 })
    }

    await logAuditServer({
      tabla:          "profiles",
      registro_id:    newUser.user.id,
      accion:         "admin.crear_usuario",
      descripcion:    `Usuario ${email} creado con rol ${role} por ${adminProfile?.nombre ?? user.email} (invitación enviada por correo)`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/create-user] error registrando auditoría:", err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/create-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
