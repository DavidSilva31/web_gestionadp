// Caché en memoria (del navegador) para consultas de catálogos que casi no cambian:
// lista de clientes, conductores, empresas de transporte, productos de un cliente,
// tarifas, servicios. Cada consulta a Supabase cuesta ~300 ms de ida y vuelta desde
// Chile, y varias pantallas pedían lo mismo una y otra vez (y varias veces dentro de
// la misma pantalla, p. ej. un selector de producto por cada producto del report).
//
// - Una misma consulta pedida a la vez o dentro del TTL se hace una sola vez
//   (se comparte la promesa, así que también deduplica peticiones simultáneas).
// - Las consultas que fallan no se guardan.
// - Quien modifica un catálogo debe llamar a invalidarCache("prefijo") para que el
//   siguiente pedido traiga datos frescos.
// - Se vacía al cerrar sesión / cambiar de usuario (ver auth-context), porque los
//   datos pueden depender de los permisos de cada cuenta.
type Entrada = { at: number; promesa: Promise<unknown> }
const cache = new Map<string, Entrada>()

const TTL_POR_DEFECTO = 2 * 60 * 1000

export function consultaCacheada<T extends { error?: unknown }>(
  clave: string,
  consulta: () => PromiseLike<T>,
  ttlMs = TTL_POR_DEFECTO,
): Promise<T> {
  const previa = cache.get(clave)
  if (previa && Date.now() - previa.at < ttlMs) return previa.promesa as Promise<T>
  const promesa = Promise.resolve(consulta()).then(
    res => { if (res.error) cache.delete(clave); return res },
    err => { cache.delete(clave); throw err },
  )
  cache.set(clave, { at: Date.now(), promesa })
  return promesa
}

// Deja un resultado ya conocido en la caché (p. ej. cuando una lista ya trajo el dato
// que otra pantalla iba a pedir por separado).
export function sembrarCache<T>(clave: string, valor: T): void {
  cache.set(clave, { at: Date.now(), promesa: Promise.resolve(valor) })
}

// Borra las entradas cuya clave empiece con el prefijo (sin prefijo, todas).
export function invalidarCache(prefijo = ""): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefijo)) cache.delete(k)
}
