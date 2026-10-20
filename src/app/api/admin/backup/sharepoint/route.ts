import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { exigirSuperAdmin } from "@/lib/backup-servidor"
import { auditarInicioRespaldoSharePoint, auditarRespaldoSharePoint } from "@/lib/backup-core"

export const dynamic = "force-dynamic"

// Un respaldo "en curso" sin resultado tras este tiempo se da por interrumpido (la función dura 2 a 5 min).
const MAX_EN_CURSO_MS = 10 * 60 * 1000

type Fila = { created_at: string; descripcion: string | null; datos_nuevo: { ok?: boolean; estado?: string } | null; usuario_nombre: string | null }

// Estado a partir de la auditoría: el registro más reciente dice si hay un respaldo corriendo,
// y el último con resultado (ok o error) es el que se muestra como "último respaldo".
async function leerEstado() {
  const { data } = await supabaseAdmin
    .from("audit_logs").select("created_at, descripcion, datos_nuevo, usuario_nombre")
    .eq("accion", "sistema.respaldo_sharepoint").order("created_at", { ascending: false }).limit(10)
  const filas = (data ?? []) as Fila[]
  const reciente = filas[0]
  const enCurso = !!reciente && reciente.datos_nuevo?.estado === "en_curso"
    && Date.now() - new Date(reciente.created_at).getTime() < MAX_EN_CURSO_MS
  const u = filas.find(f => typeof f.datos_nuevo?.ok === "boolean")
  return {
    enCurso: enCurso ? { desde: reciente.created_at, por: reciente.usuario_nombre } : null,
    ultimo: u ? { fecha: u.created_at, ok: u.datos_nuevo?.ok === true, descripcion: u.descripcion, por: u.usuario_nombre } : null,
  }
}

export async function GET() {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  return NextResponse.json({ configurado: !!process.env.BACKUP_CRON_SECRET, ...await leerEstado() })
}

// POST → "Respaldar ahora": dispara la función en segundo plano (tarda varios minutos) y responde de inmediato.
export async function POST(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  const secreto = process.env.BACKUP_CRON_SECRET
  if (!secreto) return NextResponse.json({ error: "Falta configurar BACKUP_CRON_SECRET en el servidor." }, { status: 500 })
  if ((await leerEstado()).enCurso) return NextResponse.json({ error: "Ya hay un respaldo en curso." }, { status: 409 })
  // Mismo dominio por el que entró el usuario: con process.env.URL (dominio principal) una
  // redirección convertía el POST en GET y la función respondía 405.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  const base = host ? `https://${host}` : (process.env.URL ?? req.nextUrl.origin)
  await auditarInicioRespaldoSharePoint(admin)
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
      const msg = `No se pudo iniciar el respaldo: ${causa} (HTTP ${res.status}).`
      await auditarRespaldoSharePoint(false, msg.slice(0, 160), {}, admin) // cierra el "en curso"
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[backup/sharepoint] no se pudo disparar:", err)
    const msg = `No se pudo iniciar el respaldo: ${err instanceof Error ? err.message : "error de red"}`
    await auditarRespaldoSharePoint(false, msg.slice(0, 160), {}, admin) // cierra el "en curso"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
