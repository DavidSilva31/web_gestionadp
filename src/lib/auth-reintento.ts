import type { SupabaseClient } from "@supabase/supabase-js"

// Un error de red / timeout / 5xx al verificar la sesión NO significa que la sesión sea
// inválida: no hay que mandar al usuario al login por un tropiezo momentáneo de la conexión.
function esErrorDeRed(error: { name?: string; status?: number; message?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true
  if (typeof error.status === "number" && error.status >= 500) return true
  return error.status === undefined && /fetch|network|timeout|ECONN|ENOTFOUND/i.test(error.message ?? "")
}

// Verifica la sesión con getClaims(): valida la firma del JWT en local con la clave pública del
// proyecto (JWKS, ES256, queda en caché), sin el viaje a Auth que hace getUser() (~250 ms en cada
// navegación). Si el token venció, getClaims lo renueva con el refresh token. Límite: una sesión
// revocada (cierre de sesión en otro equipo) sigue valiendo hasta que venza el token (≤1 h);
// el perfil desactivado SÍ se detecta al instante (se consulta en cada request). Las rutas /api
// que modifican datos siguen usando getUser().
// Con hasta 2 reintentos cuando el fallo es de red. Devuelve:
//  - user: { id } o null si la sesión es inválida/ausente
//  - errorDeRed: true si no se pudo verificar por un problema de conexión (la sesión puede ser válida)
export async function getUserConReintento(
  supabase: SupabaseClient,
  contexto: string,
): Promise<{ user: { id: string } | null; errorDeRed: boolean }> {
  for (let intento = 0; intento < 3; intento++) {
    try {
      const { data, error } = await supabase.auth.getClaims()
      if (!error && data?.claims?.sub) return { user: { id: data.claims.sub }, errorDeRed: false }
      // Sin claims válidos (sesión ausente, o el JWT no se pudo verificar en local): se confirma
      // con getUser() antes de dar por perdida la sesión, para no sacar a nadie por un falso negativo.
      const res = await supabase.auth.getUser()
      if (!res.error) return { user: res.data.user ? { id: res.data.user.id } : null, errorDeRed: false }
      const error2 = res.error
      console.error(`[${contexto}] error verificando sesión (intento ${intento + 1}):`, error2.name, error2.status, error2.message)
      if (!esErrorDeRed(error2)) return { user: null, errorDeRed: false }
    } catch (err) {
      // getClaims puede lanzar (ej. refresh token inválido o fetch caído).
      const e = err as { name?: string; status?: number; message?: string }
      console.error(`[${contexto}] excepción verificando sesión (intento ${intento + 1}):`, e?.name, e?.status, e?.message)
      if (!esErrorDeRed(e ?? {})) return { user: null, errorDeRed: false }
    }
    if (intento < 2) await new Promise(r => setTimeout(r, 400))
  }
  return { user: null, errorDeRed: true }
}
