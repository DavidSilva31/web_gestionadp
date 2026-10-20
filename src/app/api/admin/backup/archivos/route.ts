import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { BUCKET_FIRMADOS, exigirSuperAdmin } from "@/lib/backup-servidor"

export const dynamic = "force-dynamic"

// POST { nombres: string[] } → URLs firmadas (10 min) para que el navegador descargue cada archivo.
export async function POST(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  let nombres: unknown
  try { ({ nombres } = await req.json()) } catch { return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }) }
  if (!Array.isArray(nombres) || nombres.length === 0 || nombres.length > 100 || nombres.some(n => typeof n !== "string"))
    return NextResponse.json({ error: "Lista de archivos inválida" }, { status: 400 })
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_FIRMADOS).createSignedUrls(nombres as string[], 600)
  if (error) {
    console.error("[backup/archivos]", error)
    return NextResponse.json({ error: "No se pudieron firmar los archivos." }, { status: 500 })
  }
  return NextResponse.json({ urls: (data ?? []).map(d => ({ nombre: d.path, url: d.signedUrl, error: d.error })) })
}
