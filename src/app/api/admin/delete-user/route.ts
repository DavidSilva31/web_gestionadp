import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles").select("role, nombre").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/delete-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (adminProfile?.role !== "super_admin")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    let body: { targetId?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { targetId } = body
    if (!targetId) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    if (targetId === user.id)
      return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 })

    // Obtener datos del usuario antes de eliminarlo (para el log)
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles").select("email, nombre, role").eq("id", targetId).single()
    if (targetError) console.error("[admin/delete-user] error obteniendo perfil objetivo:", targetError)

    // Eliminar primero de Auth para evitar dejar un perfil huérfano si falla la segunda operación
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId)
    if (authError) {
      console.error("[admin/delete-user] error eliminando usuario de Auth:", authError)
      return NextResponse.json({ error: "No se pudo eliminar el usuario." }, { status: 500 })
    }

    const { error: deleteProfileError } = await supabaseAdmin.from("profiles").delete().eq("id", targetId)
    if (deleteProfileError)
      console.error("[admin/delete-user] error eliminando perfil (usuario ya eliminado de Auth):", deleteProfileError)

    await logAuditServer({
      tabla:          "profiles",
      registro_id:    targetId,
      accion:         "admin.eliminar_usuario",
      descripcion:    `Usuario ${targetProfile?.email ?? targetId} (${targetProfile?.role ?? "?"}) eliminado por ${adminProfile?.nombre ?? user.email}`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/delete-user] error registrando auditoría:", err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[admin/delete-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
