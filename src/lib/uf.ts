import { supabaseAdmin } from "@/lib/supabase-admin"

// Valor de la UF para una fecha, consultado desde el servidor:
//   1) caché en Supabase (uf_valores) — la UF de una fecha nunca cambia, así
//      que una vez obtenida no se vuelve a pedir a ninguna API externa.
//   2) mindicador.cl (histórico por fecha), con un reintento ante fallas
//      transitorias — es una API pública gratuita, a veces lenta/inestable.
//   3) si falla y la fecha es HOY, respaldo con api.gael.cloud (otro proveedor,
//      sin key, pero solo entrega el valor del día actual).
// Se hace acá y no en el navegador porque el CSP de producción solo permite
// conectar a Supabase y Resend (connect-src): desde el navegador esas llamadas
// quedaban bloqueadas y la UF nunca se cargaba sola.

export class UfError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 502) { super(message) }
}

const TIMEOUT_MS = 8000

// mindicador publica la UF con anticipación (hasta el día 9 del mes siguiente);
// más allá de eso devuelve una serie vacía.
const MAX_DIAS_FUTURO = 45

function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date())
}

function validarFecha(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new UfError("Fecha inválida.", 400)
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) throw new UfError("Fecha inválida.", 400)
  const anio = d.getUTCFullYear()
  if (anio < 1990) throw new UfError("La UF no está disponible para esa fecha.", 400)
  const limite = new Date(`${hoyChile()}T00:00:00Z`).getTime() + MAX_DIAS_FUTURO * 86_400_000
  if (d.getTime() > limite) throw new UfError("Aún no hay valor de UF publicado para esa fecha.", 404)
}

async function desdeMindicador(fecha: string): Promise<number | null> {
  const [y, m, d] = fecha.split("-")
  const res = await fetch(`https://mindicador.cl/api/uf/${d}-${m}-${y}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { serie?: { valor?: unknown }[] }
  // Serie vacía = la fecha no tiene UF publicada (no es una falla del servicio).
  if (!data.serie || data.serie.length === 0) return null
  const valor = data.serie[0]?.valor
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) throw new Error("Respuesta inesperada de mindicador.cl")
  return valor
}

async function desdeGaelCloud(): Promise<number> {
  const res = await fetch("https://api.gael.cloud/general/public/monedas", {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as { Codigo?: string; Valor?: string }[]
  const raw = Array.isArray(data) ? data.find(i => i.Codigo === "UF")?.Valor : null
  const valor = typeof raw === "string" ? parseFloat(raw.replace(/\./g, "").replace(",", ".")) : NaN
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Respuesta inesperada de gael.cloud")
  return valor
}

async function guardarEnCache(fecha: string, valor: number): Promise<void> {
  const { error } = await supabaseAdmin.from("uf_valores").upsert({ fecha, valor }, { onConflict: "fecha" })
  if (error) console.error("[uf] error guardando la UF en caché:", error)
}

export async function obtenerUf(fecha: string): Promise<{ valor: number; origen: "cache" | "mindicador" | "gael" }> {
  validarFecha(fecha)

  const { data: cached, error: cacheErr } = await supabaseAdmin
    .from("uf_valores").select("valor").eq("fecha", fecha).maybeSingle()
  if (cacheErr) console.error("[uf] error leyendo la caché de UF:", cacheErr)
  if (cached?.valor != null) return { valor: Number(cached.valor), origen: "cache" }

  let lastErr: unknown = null
  for (let intento = 0; intento < 2; intento++) {
    try {
      const valor = await desdeMindicador(fecha)
      if (valor === null) throw new UfError("No hay valor de UF publicado para esa fecha.", 404)
      await guardarEnCache(fecha, valor)
      return { valor, origen: "mindicador" }
    } catch (err) {
      if (err instanceof UfError) throw err
      lastErr = err
      if (intento === 0) await new Promise(r => setTimeout(r, 1500))
    }
  }
  console.error("[uf] error obteniendo la UF de mindicador.cl:", lastErr)

  if (fecha === hoyChile()) {
    try {
      const valor = await desdeGaelCloud()
      await guardarEnCache(fecha, valor)
      return { valor, origen: "gael" }
    } catch (err) {
      console.error("[uf] error obteniendo la UF de gael.cloud:", err)
    }
  }

  throw new UfError("No se pudo obtener la UF automáticamente.", 502)
}
