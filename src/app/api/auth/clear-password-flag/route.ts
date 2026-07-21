import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      if (authError) console.error("[auth/clear-password-flag] error de autenticación:", authError)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id)

    if (error) {
      console.error("[auth/clear-password-flag] error actualizando perfil:", error)
      return NextResponse.json({ error: "No se pudo actualizar el estado de la contraseña." }, { status: 500 })
    }
    return NextResponse.json({ success: true, userId: user.id })
  } catch (err) {
    console.error("[auth/clear-password-flag] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
