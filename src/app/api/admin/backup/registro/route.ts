import { NextRequest, NextResponse } from "next/server"
import { logAuditServer } from "@/lib/audit"
import { exigirSuperAdmin } from "@/lib/backup-servidor"

export const dynamic = "force-dynamic"

// POST { tablas, filas, archivos, bytes, omitidos } → deja constancia en la auditoría.
export async function POST(req: NextRequest) {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  let b: { tablas?: number; filas?: number; archivos?: number; bytes?: number; omitidos?: number } = {}
  try { b = await req.json() } catch { /* sin detalle */ }
  const mb = ((b.bytes ?? 0) / 1048576).toFixed(1)
  await logAuditServer({
    tabla: "sistema",
    registro_id: "respaldo",
    accion: "sistema.respaldo",
    descripcion: `Copia de seguridad descargada · ${mb} MB${b.omitidos ? ` · ${b.omitidos} archivos omitidos` : ""}`,
    datos_nuevo: b as Record<string, unknown>,
    usuario_id: admin.id,
    usuario_nombre: admin.nombre,
  })
  return NextResponse.json({ ok: true })
}
