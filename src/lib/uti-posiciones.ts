// UTI Chile: tabla "Posiciones" de su Excel de inventario (hoja POSICIONES), en el Resumen de Inventario.
//   POSICIONES = INVENTARIO INICIAL − DESPACHO + INGRESO, por clase.
// El inventario inicial es lo cargado al partir (ingresos sin report); lo que se mueve después por
// reports son los ingresos y despachos. Cada pallet cuenta UNA posición, en la clase más cara que contiene
// (ya viene así en movimientos.posiciones; ver migration_uti_posiciones_clase_mas_cara.sql).
export const TEMPORADA_UTI = "2025-2026"

// Clases que siempre se muestran, en el orden de la hoja; las demás aparecen solo si tienen movimiento.
const CLASES_FIJAS = ["8", "5.1", "NORMAL", "3"]
const ORDEN_EXTRA = ["2.1", "2.2", "4.1", "4.2", "4.3", "6.1", "9"]

export type FilaPosiciones = { clase: string; posiciones: number; inicial: number; despacho: number; ingreso: number }

// "8" → "8", "5.1 " → "5.1", "N/A" / vacío → "NORMAL".
export function claseUti(imo: string | null | undefined): string {
  return (String(imo ?? "").trim().match(/^\d+(\.\d+)?/)?.[0]) ?? "NORMAL"
}

export function posicionesPorClase(
  movs: { tipo: string; imo: string | null; posiciones: number | null; report_id: string | null }[],
): FilaPosiciones[] {
  const porClase = new Map<string, FilaPosiciones>()
  const fila = (c: string) => {
    let f = porClase.get(c)
    if (!f) { f = { clase: c, posiciones: 0, inicial: 0, despacho: 0, ingreso: 0 }; porClase.set(c, f) }
    return f
  }
  for (const c of CLASES_FIJAS) fila(c)
  for (const m of movs) {
    const pos = Number(m.posiciones ?? 0)
    if (!pos) continue
    const f = fila(claseUti(m.imo))
    if (m.tipo === "despacho") f.despacho += pos
    else if (m.report_id) f.ingreso += pos
    else f.inicial += pos
  }
  const orden = (c: string) => { const i = [...CLASES_FIJAS, ...ORDEN_EXTRA].indexOf(c); return i === -1 ? 99 : i }
  return [...porClase.values()]
    .map(f => ({ ...f, posiciones: f.inicial - f.despacho + f.ingreso }))
    .sort((a, b) => orden(a.clase) - orden(b.clase) || a.clase.localeCompare(b.clase, undefined, { numeric: true }))
}
