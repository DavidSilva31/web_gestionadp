// Función programada (domingo ~02:00 hora de Chile): solo dispara la función en segundo plano que
// arma el ZIP y lo sube a SharePoint. Las funciones programadas duran poco; el respaldo tarda minutos.
export default async () => {
  const base = process.env.URL
  const secreto = process.env.BACKUP_CRON_SECRET
  if (!base || !secreto) {
    console.error("[respaldo-semanal] falta URL o BACKUP_CRON_SECRET")
    return
  }
  const res = await fetch(`${base}/.netlify/functions/respaldo-background`, {
    method: "POST",
    headers: { "x-respaldo-secret": secreto },
  })
  console.log("[respaldo-semanal] disparado:", res.status)
}

// Cron en UTC: domingo 05:00 UTC = 01:00/02:00 en Chile según horario de verano.
export const config = { schedule: "0 5 * * 0" }
