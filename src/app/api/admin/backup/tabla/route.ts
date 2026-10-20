import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { exigirSuperAdmin, listarTablas } from "@/lib/backup-servidor"

export const dynamic = "force-dynamic"
const LOTE = 1000

// GET ?nombre=tabla&desde=0 → hasta 1000 filas ordenadas por clave primaria.
export async function GET(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const nombre = req.nextUrl.searchParams.get("nombre") ?? ""
  const desde = Math.max(0, Number(req.nextUrl.searchParams.get("desde")) || 0)
  try {
    const tabla = (await listarTablas()).find(t => t.nombre === nombre)
    if (!tabla) return NextResponse.json({ error: "Tabla desconocida" }, { status: 400 })
    let q = supabaseAdmin.from(tabla.nombre).select("*")
    for (const col of tabla.pk) q = q.order(col, { ascending: true })
    const { data, error } = await q.range(desde, desde + LOTE - 1)
    if (error) throw error
    return NextResponse.json({ filas: data ?? [], fin: (data?.length ?? 0) < LOTE })
  } catch (err) {
    console.error("[backup/tabla]", nombre, err)
    return NextResponse.json({ error: `No se pudo leer la tabla ${nombre}.` }, { status: 500 })
  }
}
