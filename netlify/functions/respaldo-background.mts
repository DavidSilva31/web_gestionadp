// Función en segundo plano (hasta 15 min): genera el respaldo completo y lo sube a SharePoint,
// reemplazando el ZIP de la semana anterior. La invocan la función programada y el botón de
// "Respaldar ahora" (vía /api/admin/backup/sharepoint), ambos con el secreto compartido.
import { auditarRespaldoSharePoint, generarRespaldoZip } from "../../src/lib/backup-core"
import { subirArchivoGrandeASharePoint } from "../../src/lib/sharepoint"

const CARPETAS = (process.env.SHAREPOINT_BACKUP_PATH ?? "RESPALDOS ADP").split("/").filter(Boolean)
const NOMBRE = "respaldo_adp_semanal.zip"

export default async (req: Request) => {
  if (!process.env.BACKUP_CRON_SECRET || req.headers.get("x-respaldo-secret") !== process.env.BACKUP_CRON_SECRET) {
    return new Response("No autorizado", { status: 401 })
  }
  let quien: { id: string; nombre: string } | undefined
  try {
    const b = await req.json() as { usuarioId?: string; usuarioNombre?: string }
    if (b.usuarioId) quien = { id: b.usuarioId, nombre: b.usuarioNombre ?? "super_admin" }
  } catch { /* disparo programado: sin cuerpo */ }

  try {
    const { zip, resumen } = await generarRespaldoZip()
    const { webUrl } = await subirArchivoGrandeASharePoint({ carpetas: CARPETAS, nombreArchivo: NOMBRE, contenido: zip })
    const mb = (resumen.bytes / 1048576).toFixed(1)
    await auditarRespaldoSharePoint(
      true,
      `Respaldo subido a SharePoint (${CARPETAS.join("/")}/${NOMBRE}): ${resumen.tablas} tablas, ${resumen.filas} registros, ${resumen.archivos} archivos (${mb} MB)${resumen.omitidos ? `, ${resumen.omitidos} archivos omitidos` : ""}`,
      { ...resumen, webUrl },
      quien,
    )
  } catch (err) {
    console.error("[respaldo-background] error:", err)
    await auditarRespaldoSharePoint(
      false,
      `Falló el respaldo a SharePoint: ${err instanceof Error ? err.message : "error desconocido"}`,
      {},
      quien,
    )
  }
  return new Response("ok")
}
