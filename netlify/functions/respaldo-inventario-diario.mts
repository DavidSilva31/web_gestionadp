// Función programada (todos los días ~02:00 hora de Chile): dispara la función en segundo plano
// que genera el Excel del inventario y lo sube a SharePoint.
export default async () => {
  const base = process.env.URL
  const secreto = process.env.BACKUP_CRON_SECRET
  if (!base || !secreto) {
    console.error("[respaldo-inventario-diario] falta URL o BACKUP_CRON_SECRET")
    return
  }
  const res = await fetch(`${base}/.netlify/functions/respaldo-inventario-background`, {
    method: "POST",
    headers: { "x-respaldo-secret": secreto },
  })
  console.log("[respaldo-inventario-diario] disparado:", res.status)
}

// Cron en UTC: 06:00 UTC = 02:00/03:00 en Chile según horario de verano.
export const config = { schedule: "0 6 * * *" }
