// Función en segundo plano: genera el Excel del inventario y lo sube a SharePoint, reemplazando
// el archivo del día anterior. La invocan la función programada diaria y el botón de
// "Respaldar inventario ahora" (vía /api/admin/backup/sharepoint), ambos con el secreto compartido.
import { auditarRespaldoInventario } from "../../src/lib/backup-core"
import { generarInventarioXlsx } from "../../src/lib/backup-inventario"
import { subirArchivoGrandeASharePoint } from "../../src/lib/sharepoint"

// Misma carpeta del respaldo semanal.
const CARPETAS = (process.env.SHAREPOINT_BACKUP_PATH ?? "TI Informática/Respaldo ADP").split("/").filter(Boolean)
const NOMBRE = "inventario_adp_diario.xlsx"

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
    const { buffer, resumen } = await generarInventarioXlsx()
    const { webUrl } = await subirArchivoGrandeASharePoint({ carpetas: CARPETAS, nombreArchivo: NOMBRE, contenido: buffer })
    await auditarRespaldoInventario(
      true,
      `Inventario respaldado en SharePoint · ${resumen.items} productos · ${resumen.movimientos} movimientos`,
      { ...resumen, webUrl, carpeta: `${CARPETAS.join("/")}/${NOMBRE}` },
      quien,
    )
  } catch (err) {
    console.error("[respaldo-inventario-background] error:", err)
    await auditarRespaldoInventario(
      false,
      `Falló el respaldo del inventario: ${(err instanceof Error ? err.message : "error desconocido").slice(0, 120)}`,
      {},
      quien,
    )
  }
  return new Response("ok")
}
