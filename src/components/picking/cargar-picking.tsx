"use client"

import { useState } from "react"
import { ListChecks, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase"
import { lineaABodegaje, type LineaPicking } from "@/lib/picking"
import { tarifaCubreClase, type TarifaOption } from "@/components/reports/report-form-widgets"
import type { BodegajeItemFormData } from "@/components/reports/report-form-types"

type PickingPendiente = { id: string; numero: number; fecha: string; referencia: string | null; picking_lineas: { count: number }[] }

// Botón del Bodegaje de un report: trae los productos de un picking pendiente del cliente, para no cargarlos
// uno por uno. Solo precarga; el stock se descuenta al despachar el report, como siempre.
export function CargarPicking({ clienteId, tarifasCliente, uti, onCargar }: {
  clienteId: string
  tarifasCliente: TarifaOption[]
  uti: boolean
  onCargar: (items: Partial<BodegajeItemFormData>[], picking: { id: string; numero: number }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [lista, setLista] = useState<PickingPendiente[] | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function abrir() {
    setAbierto(true); setError(null); setLista(null)
    const { data, error: e } = await createClient().from("pickings")
      .select("id, numero, fecha, referencia, picking_lineas(count)")
      .eq("cliente_id", clienteId).eq("estado", "pendiente").order("numero", { ascending: false })
    if (e) setError(e.message)
    setLista((data ?? []) as unknown as PickingPendiente[])
  }

  async function elegir(p: PickingPendiente) {
    setTrabajando(p.id); setError(null)
    const { data, error: e } = await createClient().from("picking_lineas").select("*").eq("picking_id", p.id).order("orden")
    if (e || !data) { setError(e?.message ?? "No se pudieron leer las líneas"); setTrabajando(null); return }
    const tarifaId = (clase: string | null) => tarifasCliente.find(t => tarifaCubreClase(t.clase_imo, clase))?.id ?? ""
    onCargar(
      data.map(l => lineaABodegaje({
        inventario_item_id: l.inventario_item_id, producto: l.producto, codigo: l.codigo, clase_imo: l.clase_imo, nu: l.nu, bodega: l.bodega,
        numero_pallet: l.numero_pallet, rack: l.rack, lote: l.lote,
        peso_neto: l.peso_neto != null ? Number(l.peso_neto) : null,
        posiciones: l.posiciones != null ? Number(l.posiciones) : null,
        unidades: l.unidades != null ? Number(l.unidades) : null,
      } as LineaPicking, uti, tarifaId)),
      { id: p.id, numero: p.numero },
    )
    setTrabajando(null); setAbierto(false)
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={abrir} className="h-7 gap-1.5 text-xs">
        <ListChecks className="h-3.5 w-3.5" /> Cargar picking
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cargar un picking</DialogTitle></DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {lista === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando pickings…</div>
          ) : lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente no tiene pickings pendientes. Créalos en el módulo Picking.</p>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-auto">
              {lista.map(p => (
                <li key={p.id}>
                  <button type="button" disabled={trabajando !== null} onClick={() => elegir(p)}
                    className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted/50 disabled:opacity-60 flex items-center justify-between gap-3">
                    <span>
                      <span className="font-semibold">Picking N° {p.numero}</span>
                      <span className="text-muted-foreground text-xs"> · {new Date(p.fecha + "T00:00:00").toLocaleDateString("es-CL")}{p.referencia ? ` · ${p.referencia}` : ""}</span>
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {trabajando === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${p.picking_lineas?.[0]?.count ?? 0} líneas`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Los productos se agregan al Bodegaje; si ya había productos, se mantienen. El stock no cambia hasta que el report se despache.</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
