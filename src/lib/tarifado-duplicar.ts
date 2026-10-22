import { createClient } from "@/lib/supabase"

// Copia un tarifado guardado (cabecera, tarifas con sus resaltados y observaciones) con fecha de hoy y
// número nuevo. Devuelve el id del duplicado.
export async function duplicarTarifado(id: string): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [t, li, ob] = await Promise.all([
    supabase.from("tarifados").select("*").eq("id", id).single(),
    supabase.from("tarifado_lineas").select("*").eq("tarifado_id", id).order("orden"),
    supabase.from("tarifado_observaciones").select("observacion_id").eq("tarifado_id", id),
  ])
  if (t.error || !t.data) throw new Error(t.error?.message ?? "No se pudo leer el tarifado")
  if (li.error) throw new Error(li.error.message)
  if (ob.error) throw new Error(ob.error.message)
  const c = t.data
  const { data: nuevo, error: eCab } = await supabase.from("tarifados").insert({
    emisor: c.emisor, fecha: new Date().toISOString().slice(0, 10), vigencia_desde: c.vigencia_desde, cliente_id: c.cliente_id,
    atencion: c.atencion, ciudad: c.ciudad, direccion: c.direccion, observaciones_extra: c.observaciones_extra,
    created_by: user?.id ?? null, updated_by: user?.id ?? null,
  }).select("id").single()
  if (eCab || !nuevo) throw new Error(eCab?.message ?? "No se pudo duplicar")

  // Si algo falla a medio camino se borra el duplicado para no dejar un tarifado vacío.
  const deshacer = async (msg: string) => { await supabase.from("tarifados").delete().eq("id", nuevo.id); throw new Error(msg) }
  if ((li.data ?? []).length > 0) {
    const { error } = await supabase.from("tarifado_lineas").insert((li.data ?? []).map(l => ({
      tarifado_id: nuevo.id, trayecto: l.trayecto, capacidad: l.capacidad, uf_pre_alza: l.uf_pre_alza,
      valores_uf: l.valores_uf, resaltados: l.resaltados, orden: l.orden,
    })))
    if (error) await deshacer(error.message)
  }
  if ((ob.data ?? []).length > 0) {
    const { error } = await supabase.from("tarifado_observaciones").insert(
      (ob.data ?? []).map(o => ({ tarifado_id: nuevo.id, observacion_id: o.observacion_id })))
    if (error) await deshacer(error.message)
  }
  return nuevo.id
}
