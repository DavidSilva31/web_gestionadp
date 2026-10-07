import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { subirArchivoASharePoint } from "@/lib/sharepoint"

const BASE_PATH = (process.env.SHAREPOINT_BASE_PATH ?? "HES Y COTIZACIONES/COTIZACIONES/COTIZACIONES").split("/")

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role, activo").eq("id", user.id).single()
  if (!profile?.activo || profile.role !== "super_admin") {
    return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get("file")
  const numero = form.get("numero")
  const anio = form.get("anio")
  if (!(file instanceof File) || typeof numero !== "string" || typeof anio !== "string") {
    return NextResponse.json({ error: "Faltan datos del archivo" }, { status: 400 })
  }
  if (!/^\d{4}$/.test(anio)) return NextResponse.json({ error: "Año inválido" }, { status: 400 })

  try {
    const contenido = Buffer.from(await file.arrayBuffer())
    const { webUrl } = await subirArchivoASharePoint({
      carpetas: [...BASE_PATH, anio],
      nombreArchivo: `Cotizacion_${numero}.pdf`,
      contenido,
      contentType: "application/pdf",
    })
    return NextResponse.json({ webUrl })
  } catch (err) {
    console.error("[cotizaciones/sharepoint] error subiendo PDF:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error desconocido" }, { status: 502 })
  }
}
