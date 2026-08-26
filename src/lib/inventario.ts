import type { SupabaseClient } from "@supabase/supabase-js"

// Recalcula peso_ton = peso_unitario_ton * stock_actual tras un cambio de
// stock (movimiento o despacho de report). Sin esto, la ocupación en
// /instalaciones y el dashboard quedan mostrando el peso viejo aunque el
// stock real ya cambió — peso_unitario_ton es el ancla fija por ítem
// (peso_ton inicial / stock_actual inicial), stock_actual es lo único que
// se mueve con cada movimiento.
export async function syncPesoTon(supabase: SupabaseClient, itemId: string) {
  const { data, error } = await supabase
    .from("inventario_items")
    .select("peso_unitario_ton, stock_actual")
    .eq("id", itemId)
    .single()
  if (error) { console.error("[syncPesoTon] error leyendo ítem:", itemId, error); return }
  if (!data || data.peso_unitario_ton == null) return

  const nuevoPeso = Math.round(data.peso_unitario_ton * data.stock_actual * 1000) / 1000
  const { error: updateError } = await supabase.from("inventario_items").update({ peso_ton: nuevoPeso }).eq("id", itemId)
  if (updateError) console.error("[syncPesoTon] error actualizando peso_ton:", itemId, updateError)
}

// Resuelve a qué cliente pertenece REALMENTE el inventario que hay que
// mostrar/usar — si el cliente comparte pool de stock con otro
// (clientes.stock_compartido_con), devuelve el dueño real; si no, se
// devuelve a sí mismo. Único punto de esta regla — reusar acá siempre que
// se filtre inventario_items por cliente_id.
export async function resolveEffectiveClienteId(supabase: SupabaseClient, clienteId: string): Promise<string> {
  const { data, error } = await supabase
    .from("clientes")
    .select("stock_compartido_con")
    .eq("id", clienteId)
    .single()
  if (error) { console.error("[resolveEffectiveClienteId] error:", clienteId, error); return clienteId }
  return data?.stock_compartido_con ?? clienteId
}
