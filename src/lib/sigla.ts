// Sigla de contenedor / código de isotanque: siempre "XXXXXX-X" — cualquier cantidad de
// caracteres y un guion antes del último (letra o número). Se arma sola mientras se escribe:
// el guion aparece al teclear el 2.º carácter y se va corriendo con cada carácter nuevo.
export function formatearSigla(raw: string): string {
  const limpio = raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return limpio.length < 2 ? limpio : `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

// Un valor tecleado con el formateo siempre cumple el formato salvo que tenga un solo carácter.
// (Los reports antiguos guardados sin guion no se tocan: esto solo se evalúa al escribir.)
export const siglaIncompleta = (v: string | null | undefined) => !!v && v.trim().length < 2

export const MSG_SIGLA = "La sigla del contenedor / código del isotanque debe tener el formato XXXXXX-X (al menos 2 caracteres)."
