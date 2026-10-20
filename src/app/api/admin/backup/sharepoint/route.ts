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
  // Mismo dominio por el que entró el usuario: con process.env.URL (dominio principal) una
  // redirección convertía el POST en GET y la función respondía 405.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const base = host ? `https://${host}` : (process.env.URL ?? req.nextUrl.origin)
  try {
    const res = await fetch(`${base}/.netlify/functions/respaldo-background`, {
      method: "POST",
      headers: { "x-respaldo-secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: admin.id, usuarioNombre: admin.nombre }),
      redirect: "manual",
    })
    if (res.status >= 300) {
      console.error("[backup/sharepoint] la función respondió", res.status, base)
      const causa = res.status === 404 ? "la función de respaldo no está desplegada en Netlify"
        : res.status === 401 ? "BACKUP_CRON_SECRET no coincide (¿se redesplegó tras crear la variable?)"
        : res.status < 400 ? `redirección a ${res.headers.get("location") ?? "otra URL"}`
        : "error de la función"
      return NextResponse.json({ error: `No se pudo iniciar el respaldo: ${causa} (HTTP ${res.status}).` }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[backup/sharepoint] no se pudo disparar:", err)
    return NextResponse.json({ error: `No se pudo iniciar el respaldo: ${err instanceof Error ? err.message : "error de red"}` }, { status: 502 })
  }
}
