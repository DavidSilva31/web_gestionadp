import type { SupabaseClient, User } from "@supabase/supabase-js"

// Un error de red / timeout / 5xx al verificar la sesión NO significa que la sesión sea
// inválida: no hay que mandar al usuario al login por un tropiezo momentáneo de la conexión.
function esErrorDeRed(error: { name?: string; status?: number; message?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true
  if (typeof error.status === "number" && error.status >= 500) return true
  return error.status === undefined && /fetch|network|timeout|ECONN|ENOTFOUND/i.test(error.message ?? "")
}

// getUser() con hasta 2 reintentos cuando el fallo es de red. Devuelve:
//  - user: el usuario, o null si la sesión es inválida/ausente
//  - errorDeRed: true si no se pudo verificar por un problema de conexión (la sesión puede ser válida)
export async function getUserConReintento(
  supabase: SupabaseClient,
  contexto: string,
): Promise<{ user: User | null; errorDeRed: boolean }> {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (!error) return { user: data.user, errorDeRed: false }
      console.error(`[${contexto}] error verificando sesión (intento ${intento + 1}):`, error.name, error.status, error.message)
      if (!esErrorDeRed(error)) return { user: null, errorDeRed: false }
    } catch (err) {
      // getUser puede lanzar (ej. refresh token inválido o fetch caído).
      const e = err as { name?: string; status?: number; message?: string }
      console.error(`[${contexto}] excepción verificando sesión (intento ${intento + 1}):`, e?.name, e?.status, e?.message)
      if (!esErrorDeRed(e ?? {})) return { user: null, errorDeRed: false }
    }
    if (intento < 2) await new Promise(r => setTimeout(r, 400))
  }
  return { user: null, errorDeRed: true }
}
