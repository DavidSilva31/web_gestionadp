import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

  const normalized = email.toLowerCase().trim()

  // Verificar que el email pertenezca a un usuario registrado y activo
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, activo")
    .eq("email", normalized)
    .single()

  if (!profile || !profile.activo) {
    return NextResponse.json({ error: "not_registered" }, { status: 404 })
  }

  // Enviar correo de recuperación con redirect a nuestra página
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const origin = req.headers.get("origin") ?? ""
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
