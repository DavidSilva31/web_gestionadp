import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

const VALID_ROLES = ["super_admin", "operador", "operador_carga"] as const

function generateTempPassword(): string {
  // Caracteres sin ambigüedades visuales (sin 0/O, 1/l/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes).map(b => chars[b % chars.length]).join("")
}

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

    const tempPassword = generateTempPassword()

    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password:      tempPassword,
      email_confirm: true,
    })
    if (authError) {
      const msg = authError.message.includes("already registered")
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
      must_change_password: true,
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
      descripcion:    `Usuario ${email} creado con rol ${role} por ${adminProfile?.nombre ?? user.email}`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/create-user] error registrando auditoría:", err))

    return NextResponse.json({ success: true, tempPassword })
  } catch (err) {
    console.error("[admin/create-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
