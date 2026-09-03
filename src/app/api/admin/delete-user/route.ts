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
      .from("profiles").select("role, nombre, activo").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/delete-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!adminProfile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })
    if (adminProfile.role !== "super_admin")
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

    // Perfil primero, Auth después: si el segundo paso falla, queda un
    // usuario de Auth sin perfil — inerte en la app (todo depende de
    // profiles para rol/permisos, no puede hacer nada útil). El orden
    // inverso (que tenía esto antes) dejaba justo lo que el comentario
    // decía evitar: un perfil huérfano apuntando a un auth.users borrado.
    const { error: deleteProfileError } = await supabaseAdmin.from("profiles").delete().eq("id", targetId)
    if (deleteProfileError) {
      console.error("[admin/delete-user] error eliminando perfil:", deleteProfileError)
      return NextResponse.json({ error: "No se pudo eliminar el usuario." }, { status: 500 })
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(targetId)
    if (authError) {
      console.error("[admin/delete-user] error eliminando usuario de Auth (perfil ya eliminado):", authError)
      return NextResponse.json({
        error: "El perfil se eliminó, pero no se pudo eliminar la cuenta de autenticación. Contacta soporte si el problema persiste.",
      }, { status: 500 })
    }

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
