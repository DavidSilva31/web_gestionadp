import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { decodeFirmaPng } from "@/lib/firma-server"

// Guarda la firma del propio usuario (Configuración → Mi firma). Después se
// aplica con un clic al firmar como Recepción o encargado de bodega en un report.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    let body: { firma?: string }
    try { body = await req.json() as { firma?: string } }
    catch { return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 }) }

    const bytes = decodeFirmaPng(body.firma)
    if (!bytes) return NextResponse.json({ error: "La firma no es válida. Vuelve a firmar." }, { status: 400 })

    const path = `firma-perfil-${user.id}.png`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("reports-firmados").upload(path, bytes, { upsert: true, contentType: "image/png" })
    if (uploadErr) {
      console.error("[profile/firma] error subiendo firma:", uploadErr)
      return NextResponse.json({ error: "No se pudo guardar la firma." }, { status: 500 })
    }

    const { error: updateErr } = await supabaseAdmin.from("profiles").update({ firma_url: path }).eq("id", user.id)
    if (updateErr) {
      console.error("[profile/firma] error guardando referencia de la firma:", updateErr)
      return NextResponse.json({ error: "No se pudo guardar la firma." }, { status: 500 })
    }
    return NextResponse.json({ success: true, path })
  } catch (err) {
    console.error("[profile/firma] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo guardar la firma." }, { status: 500 })
  }
}
