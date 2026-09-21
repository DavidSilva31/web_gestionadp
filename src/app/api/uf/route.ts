import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { obtenerUf, UfError } from "@/lib/uf"

// GET /api/uf?fecha=YYYY-MM-DD — valor de la UF de esa fecha (por defecto, hoy).
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const fecha = req.nextUrl.searchParams.get("fecha")
      ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date())
    const { valor, origen } = await obtenerUf(fecha)
    return NextResponse.json({ fecha, valor, origen })
  } catch (err) {
    if (err instanceof UfError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error("[api/uf] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo obtener la UF." }, { status: 500 })
  }
}
