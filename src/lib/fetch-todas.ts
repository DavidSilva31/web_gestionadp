// PostgREST devuelve como máximo 1.000 filas por consulta (límite de Supabase) y lo hace en
// silencio: una lista con más filas queda cortada sin error. Esta ayuda pide páginas de 1.000
// hasta agotar las filas. Con menos de 1.000 filas (lo normal) es una sola consulta, igual que antes.
// `pagina` arma la consulta pedida para el rango [desde, hasta] (con su orden, estable).
const LOTE = 1000

export async function fetchTodas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = []
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await pagina(desde, desde + LOTE - 1)
    if (error) return { data: filas, error }
    filas.push(...(data ?? []))
    if ((data?.length ?? 0) < LOTE) return { data: filas, error: null }
  }
}
