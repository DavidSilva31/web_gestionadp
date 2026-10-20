import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { exigirSuperAdmin } from "@/lib/backup-servidor"
import { auditarRespaldoInventario } from "@/lib/backup-core"

export const dynamic = "force-dynamic"

// GET → resultado del último respaldo diario del inventario (de la auditoría).
export async function GET() {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const { data } = await supabaseAdmin
    .from("audit_logs").select("created_at, descripcion, datos_nuevo, usuario_nombre")
    .eq("accion", "sistema.respaldo_inventario").order("created_at", { ascending: false }).limit(1)
  const u = data?.[0]
  return NextResponse.json({
    ultimo: u ? { fecha: u.created_at, ok: (u.datos_nuevo as { ok?: boolean } | null)?.ok === true, descripcion: u.descripcion, por: u.usuario_nombre } : null,
  })
}

// POST → "Respaldar inventario ahora": dispara la función en segundo plano (tarda unos segundos).
export async function POST(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const secreto = process.env.BACKUP_CRON_SECRET
  if (!secreto) return NextResponse.json({ error: "Falta configurar BACKUP_CRON_SECRET en el servidor." }, { status: 500 })
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const base = host ? `https://${host}` : (process.env.URL ?? req.nextUrl.origin)
  try {
    const res = await fetch(`${base}/.netlify/functions/respaldo-inventario-background`, {
      method: "POST",
      headers: { "x-respaldo-secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify({ usuarioId: admin.id, usuarioNombre: admin.nombre }),
      redirect: "manual",
    })
    if (res.status >= 300) {
      console.error("[backup/inventario] la función respondió", res.status, base)
      const causa = res.status === 404 ? "la función no está desplegada en Netlify"
        : res.status === 401 ? "BACKUP_CRON_SECRET no coincide"
        : res.status < 400 ? `redirección a ${res.headers.get("location") ?? "otra URL"}`
        : "error de la función"
      const msg = `No se pudo iniciar el respaldo del inventario: ${causa} (HTTP ${res.status}).`
      await auditarRespaldoInventario(false, msg.slice(0, 160), {}, admin)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[backup/inventario] no se pudo disparar:", err)
    const msg = `No se pudo iniciar el respaldo del inventario: ${err instanceof Error ? err.message : "error de red"}`
    await auditarRespaldoInventario(false, msg.slice(0, 160), {}, admin)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
