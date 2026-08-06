import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { email } = body
    if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

    const normalized = email.toLowerCase().trim()

    // La respuesta es siempre la misma sin importar si el correo existe,
    // está registrado o activo — de lo contrario un atacante puede probar
    // direcciones y usar la diferencia de respuesta (404 vs 200) para
    // enumerar qué correos tienen cuenta en el sistema.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, activo")
      .eq("email", normalized)
      .single()

    if (profile?.activo) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Ver nota en admin/create-user/route.ts sobre por qué no confiar solo en el env var.
      const requestOrigin = new URL(req.url).origin
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.includes("localhost")
        ? requestOrigin
        : (process.env.NEXT_PUBLIC_SITE_URL ?? requestOrigin)
      const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${siteUrl}/reset-password`,
      })
      if (error) console.error("[auth/forgot-password] error enviando correo:", error.message)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[auth/forgot-password] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
