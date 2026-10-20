import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { exigirSuperAdmin } from "@/lib/backup-servidor"

export const dynamic = "force-dynamic"

// GET → resultado del último respaldo automático (de la auditoría).
export async function GET() {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const { data } = await supabaseAdmin
    .from("audit_logs").select("created_at, descripcion, datos_nuevo, usuario_nombre")
    .eq("accion", "sistema.respaldo_sharepoint").order("created_at", { ascending: false }).limit(1)
  const u = data?.[0]
  return NextResponse.json({
    configurado: !!process.env.BACKUP_CRON_SECRET,
    ultimo: u ? { fecha: u.created_at, ok: (u.datos_nuevo as { ok?: boolean } | null)?.ok === true, descripcion: u.descripcion, por: u.usuario_nombre } : null,
  })
}

// POST → "Respaldar ahora": dispara la función en segundo plano (tarda varios minutos) y responde de inmediato.
export async function POST(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const secreto = process.env.BACKUP_CRON_SECRET
  if (!secreto) return NextResponse.json({ error: "Falta configurar BACKUP_CRON_SECRET en el servidor." }, { status: 500 })
  const base = process.env.URL ?? req.nextUrl.origin
  try {
    const res = await fetch(`${base}/.netlify/functions/respaldo-background`, {
      method: "POST",
      headers: { "x-respaldo-secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: admin.id, usuarioNombre: admin.nombre }),
    })
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[backup/sharepoint] no se pudo disparar:", err)
    return NextResponse.json({ error: "No se pudo iniciar el respaldo (¿estás en producción?)." }, { status: 502 })
  }
}
