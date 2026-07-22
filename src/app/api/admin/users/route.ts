import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("role").eq("id", user.id).single()
    if (profileError) {
      console.error("[admin/users] error obteniendo perfil:", profileError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (profile?.role !== "super_admin")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, nombre, email, role, activo, permisos, avatar_icon, created_at")
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[admin/users] error listando usuarios:", error)
      return NextResponse.json({ error: "No se pudo obtener la lista de usuarios." }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error("[admin/users] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
