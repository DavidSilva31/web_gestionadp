import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: adminProfile } = await supabase
    .from("profiles").select("role, nombre").eq("id", user.id).single()
  if (adminProfile?.role !== "super_admin")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const { targetId } = await req.json()
  if (!targetId) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
  if (targetId === user.id)
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 })

  // Obtener datos del usuario antes de eliminarlo (para el log)
  const { data: targetProfile } = await supabaseAdmin
    .from("profiles").select("email, nombre, role").eq("id", targetId).single()

  // Eliminar primero de Auth para evitar dejar un perfil huérfano si falla la segunda operación
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId)
  if (authError) return NextResponse.json({ error: "No se pudo eliminar el usuario." }, { status: 500 })

  await supabaseAdmin.from("profiles").delete().eq("id", targetId)

  await logAuditServer({
    tabla:          "profiles",
    registro_id:    targetId,
    accion:         "admin.eliminar_usuario",
    descripcion:    `Usuario ${targetProfile?.email ?? targetId} (${targetProfile?.role ?? "?"}) eliminado por ${adminProfile?.nombre ?? user.email}`,
    usuario_id:     user.id,
    usuario_nombre: adminProfile?.nombre ?? user.email,
  })

  return NextResponse.json({ success: true })
}
