"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2, FileText, Trash2, Search, ClipboardPaste } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/layout/page-header"
import { ConfirmarDialogo } from "@/components/confirmar-dialogo"
import { VisorArchivo } from "@/components/visor-archivo"
import { ClienteCombobox } from "@/components/reports/report-form-widgets"
import { createClient } from "@/lib/supabase"
import { fetchTodas } from "@/lib/fetch-todas"
import { cn } from "@/lib/utils"
import { detalleConRack, resolveEffectiveClienteId } from "@/lib/inventario"
import {
  claveLinea, lineasDisponibles, marcarPorLista, estadoPickingClase, ETIQUETA_ESTADO_PICKING,
  type LineaDisponible, type EstadoPicking,
} from "@/lib/picking"

type Cantidad = { pos: string; und: string }
type Reporte = { numero: number } | null

const hoy = () => new Date().toISOString().slice(0, 10)
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v))
const fmt = (n: number | null) => (n == null ? "" : n.toLocaleString("es-CL", { maximumFractionDigits: 2 }))

export default function PickingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const esNuevo = params.id === "nuevo"

  const [pickingId, setPickingId] = useState<string | null>(esNuevo ? null : params.id)
  const [numero, setNumero] = useState<number | null>(null)
  const [estado, setEstado] = useState<EstadoPicking>("pendiente")
  const [reporte, setReporte] = useState<Reporte>(null)
  const [cargando, setCargando] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clienteTexto, setClienteTexto] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [fecha, setFecha] = useState(hoy())
  const [referencia, setReferencia] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const uti = detalleConRack(clienteTexto)
  const [disponibles, setDisponibles] = useState<LineaDisponible[]>([])
  const [cargandoStock, setCargandoStock] = useState(false)
  // Líneas guardadas del picking que ya no tienen stock (se muestran igual para poder quitarlas).
  const [guardadasSinStock, setGuardadasSinStock] = useState<LineaDisponible[]>([])
  const [elegidas, setElegidas] = useState<Map<string, Cantidad>>(new Map())
  const [busqueda, setBusqueda] = useState("")
  const [pegado, setPegado] = useState("")
  const [mostrarPegar, setMostrarPegar] = useState(false)
  const [resultadoPegado, setResultadoPegado] = useState<string | null>(null)

  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const [visor, setVisor] = useState<string | null>(null)

  const editable = estado === "pendiente"

  // Picking existente: cabecera y líneas guardadas.
  useEffect(() => {
    if (esNuevo) return
    ;(async () => {
      const supabase = createClient()
      const { data: p, error: e } = await supabase.from("pickings")
        .select("numero, cliente_id, fecha, referencia, observaciones, estado, reports(numero), clientes(nombre)").eq("id", params.id).single()
      if (e || !p) { setError(e?.message ?? "Picking no encontrado"); setCargando(false); return }
      const { data: li, error: eLin } = await supabase.from("picking_lineas").select("*").eq("picking_id", params.id).order("orden")
      if (eLin) setError(eLin.message)
      setNumero(p.numero); setEstado(p.estado as EstadoPicking); setFecha(p.fecha)
      setReferencia(p.referencia ?? ""); setObservaciones(p.observaciones ?? "")
      setReporte((p.reports as unknown as Reporte) ?? null)
      const nombre = (p.clientes as unknown as { nombre: string } | null)?.nombre ?? ""
      setClienteTexto(nombre); setClienteId(p.cliente_id)
      const utiCliente = detalleConRack(nombre)
      const guardadas = new Map<string, Cantidad>()
      const sinStock: LineaDisponible[] = []
      for (const l of li ?? []) {
        const key = claveLinea(l.inventario_item_id ?? l.producto, l.numero_pallet, l.lote, l.peso_neto != null ? Number(l.peso_neto) : null, utiCliente)
        guardadas.set(key, { pos: l.posiciones != null ? String(l.posiciones) : "", und: l.unidades != null ? String(l.unidades) : "" })
        sinStock.push({
          key, itemId: l.inventario_item_id ?? "", producto: l.producto, codigo: l.codigo, claseImo: l.clase_imo, nu: l.nu,
          bodega: l.bodega, pallet: l.numero_pallet, rack: l.rack, lote: l.lote, peso: l.peso_neto != null ? Number(l.peso_neto) : null,
          posiciones: 0, unidades: 0,
        })
      }
      setElegidas(guardadas)
      setGuardadasSinStock(sinStock)
      setCargando(false)
    })()
  }, [esNuevo, params.id])

  // Stock del cliente (producto + lote, y pallet/rack en UTI) para elegir qué pickear.
  useEffect(() => {
    if (!clienteId) { setDisponibles([]); return }
    let vivo = true
    setCargandoStock(true)
    ;(async () => {
      const supabase = createClient()
      const efectivo = await resolveEffectiveClienteId(supabase, clienteId)
      const [it, mv] = await Promise.all([
        supabase.from("inventario_items").select("id, descripcion, codigo, clase_imo, nu").eq("cliente_id", efectivo).eq("activo", true),
        fetchTodas<{
          inventario_item_id: string | null; carga: string | null; tipo: string; posiciones: number | null; unidades: number | null
          lote: string | null; numero_pallet: string | null; rack: string | null; peso_envase: number | null; bodega: string | null; fecha: string
        }>((d, h) => supabase.from("movimientos")
          .select("inventario_item_id, carga, tipo, posiciones, unidades, lote, numero_pallet, rack, peso_envase, bodega, fecha")
          .eq("cliente_id", efectivo).eq("oculto", false).order("fecha").order("numero").range(d, h)),
      ])
      if (!vivo) return
      if (it.error || mv.error) setError(`No se pudo cargar el stock: ${(it.error ?? mv.error)!.message}`)
      else setDisponibles(lineasDisponibles(mv.data, it.data ?? [], detalleConRack(clienteTexto)))
      setCargandoStock(false)
    })()
    return () => { vivo = false }
    // clienteTexto solo decide si es UTI; el stock se vuelve a pedir al cambiar de cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // Disponibles + líneas guardadas que ya no tienen stock.
  const filas = useMemo(() => {
    const claves = new Set(disponibles.map(l => l.key))
    return [...disponibles, ...guardadasSinStock.filter(l => !claves.has(l.key) && elegidas.has(l.key))]
  }, [disponibles, guardadasSinStock, elegidas])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(l => [l.producto, l.codigo, l.lote, l.pallet, l.rack, l.bodega].some(v => v?.toLowerCase().includes(q)))
  }, [filas, busqueda])

  const elegidasFilas = filas.filter(l => elegidas.has(l.key))
  const totales = elegidasFilas.reduce((a, l) => {
    const c = elegidas.get(l.key)!
    return { pos: a.pos + (num(c.pos) ?? 0), und: a.und + (num(c.und) ?? 0) }
  }, { pos: 0, und: 0 })

  function alternar(l: LineaDisponible, on: boolean) {
    setElegidas(prev => {
      const n = new Map(prev)
      if (on) n.set(l.key, { pos: String(l.posiciones), und: String(l.unidades) })
      else n.delete(l.key)
      return n
    })
  }
  function cambiarCantidad(key: string, campo: keyof Cantidad, v: string) {
    setElegidas(prev => new Map(prev).set(key, { ...prev.get(key)!, [campo]: v }))
  }
  function marcarVisibles(on: boolean) {
    setElegidas(prev => {
      const n = new Map(prev)
      for (const l of visibles) {
        if (on && !n.has(l.key)) n.set(l.key, { pos: String(l.posiciones), und: String(l.unidades) })
        if (!on) n.delete(l.key)
      }
      return n
    })
  }
  function aplicarLista() {
    const { keys, noEncontrados } = marcarPorLista(pegado, disponibles)
    setElegidas(prev => {
      const n = new Map(prev)
      for (const l of disponibles) if (keys.includes(l.key) && !n.has(l.key)) n.set(l.key, { pos: String(l.posiciones), und: String(l.unidades) })
      return n
    })
    setResultadoPegado(`${keys.length} línea${keys.length === 1 ? "" : "s"} marcada${keys.length === 1 ? "" : "s"}` +
      (noEncontrados.length ? ` · No se encontró: ${noEncontrados.join(", ")}` : ""))
  }

  async function guardar(abrirPdf = false): Promise<string | null> {
    setError(null)
    if (!clienteId) { setError("Selecciona un cliente de la lista."); return null }
    if (elegidasFilas.length === 0) { setError("Marca al menos una línea para el picking."); return null }
    for (const l of elegidasFilas) {
      const c = elegidas.get(l.key)!
      const und = num(c.und), pos = num(c.pos)
      if (!und && !pos) { setError(`Indica la cantidad de "${l.producto}".`); return null }
      if (l.unidades > 0 && (und ?? 0) > l.unidades) { setError(`"${l.producto}": las unidades superan lo disponible (${fmt(l.unidades)}).`); return null }
      if (!uti && l.posiciones > 0 && (pos ?? 0) > l.posiciones) { setError(`"${l.producto}": las posiciones superan lo disponible (${l.posiciones}).`); return null }
    }
    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cabecera = { cliente_id: clienteId, fecha, referencia: referencia.trim() || null, observaciones: observaciones.trim() || null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }
    let id = pickingId
    if (id) {
      const { error: e } = await supabase.from("pickings").update(cabecera).eq("id", id)
      if (e) { setError(e.message); setGuardando(false); return null }
    } else {
      const { data, error: e } = await supabase.from("pickings").insert({ ...cabecera, created_by: user?.id ?? null }).select("id, numero").single()
      if (e || !data) { setError(e?.message ?? "No se pudo crear el picking"); setGuardando(false); return null }
      id = data.id; setPickingId(data.id); setNumero(data.numero)
    }
    const { error: eDel } = await supabase.from("picking_lineas").delete().eq("picking_id", id)
    if (eDel) { setError(eDel.message); setGuardando(false); return null }
    const { error: eIns } = await supabase.from("picking_lineas").insert(elegidasFilas.map((l, i) => {
      const c = elegidas.get(l.key)!
      return {
        picking_id: id, inventario_item_id: l.itemId || null, producto: l.producto, codigo: l.codigo, clase_imo: l.claseImo, nu: l.nu,
        bodega: l.bodega, numero_pallet: l.pallet, rack: l.rack, lote: l.lote, peso_neto: l.peso,
        posiciones: uti ? null : num(c.pos), unidades: num(c.und), orden: i,
      }
    }))
    if (eIns) { setError(eIns.message); setGuardando(false); return null }
    setGuardando(false)
    // Al crear, la página pasa a /<id> y se vuelve a montar: ?pdf=1 hace que reabra el visor del PDF.
    if (esNuevo) router.replace(`/picking/${id}${abrirPdf ? "?pdf=1" : ""}`)
    return id
  }

  // Ver PDF guarda primero: el PDF sale del servidor desde lo guardado y lleva el nombre del picking.
  async function verPdf() {
    const id = await guardar(true)
    if (!id || esNuevo) return   // nuevo: la página se remonta en su ruta y abre el PDF sola
    setVisor(`/api/picking/${id}/pdf`)
  }

  // Tras crear desde "Ver PDF" la página se remonta en /picking/<id>?pdf=1 y abre el visor sola.
  useEffect(() => {
    if (cargando || esNuevo || typeof window === "undefined") return
    if (new URLSearchParams(window.location.search).get("pdf") === "1") {
      window.history.replaceState(null, "", window.location.pathname)
      setVisor(`/api/picking/${params.id}/pdf`)
    }
  }, [cargando, esNuevo, params.id])

  async function eliminar() {
    if (!pickingId) return
    setEliminando(true)
    const { error: e } = await createClient().from("pickings").delete().eq("id", pickingId)
    if (e) { setErrorEliminar(e.message); setEliminando(false); return }
    router.replace("/picking")
  }

  if (cargando) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={numero != null ? `Picking N° ${numero}` : "Nuevo picking"}
        subtitle={clienteTexto || "Elige el cliente y marca lo que va a retirar"}>
        <Button variant="outline" onClick={() => router.push("/picking")} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Volver</Button>
        {pickingId && editable && (
          <Button variant="outline" onClick={() => { setErrorEliminar(null); setConfirmarBorrado(true) }} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        )}
        <Button variant="outline" onClick={verPdf} disabled={guardando || (!editable && !pickingId)} className="gap-1.5">
          <FileText className="h-4 w-4" /> Ver PDF
        </Button>
        {editable && (
          <Button onClick={() => guardar()} disabled={guardando} className="gap-1.5">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        )}
      </PageHeader>

      {visor && (
        <VisorArchivo url={visor} titulo={`Picking N° ${numero ?? ""}`} subtitulo={clienteTexto} tipo="pdf" onClose={() => setVisor(null)} />
      )}
      <ConfirmarDialogo
        abierto={confirmarBorrado} titulo="Eliminar picking" confirmar="Eliminar" ocupado={eliminando} error={errorEliminar}
        descripcion={`¿Eliminar el picking N° ${numero ?? ""}? Se borran sus líneas. No afecta al stock ni a ningún report.`}
        onConfirmar={eliminar} onCancelar={() => setConfirmarBorrado(false)} />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!editable && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", estadoPickingClase(estado))}>{ETIQUETA_ESTADO_PICKING[estado]}</span>
            {reporte ? `Cargado en el Report #${reporte.numero}.` : ""} Ya no se puede editar; solo ver el PDF.
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <ClienteCombobox value={clienteTexto} onChange={setClienteTexto}
              onChangeId={id => { setClienteId(id); setElegidas(new Map()); setGuardadasSinStock([]); setResultadoPegado(null) }}
              readOnly={!editable || !!pickingId} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9" disabled={!editable} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referencia (solicitud, orden o listado del cliente)</Label>
            <Input value={referencia} onChange={e => setReferencia(e.target.value)} className="h-9" disabled={!editable} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Observaciones</Label>
            <Input value={observaciones} onChange={e => setObservaciones(e.target.value)} className="h-9" disabled={!editable} />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Productos a retirar <span className="font-normal text-muted-foreground">
                ({elegidasFilas.length} línea{elegidasFilas.length === 1 ? "" : "s"}
                {!uti && ` · ${fmt(totales.pos)} pos.`} · {fmt(totales.und)} und.)
              </span>
            </h3>
            {editable && clienteId && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder={uti ? "Buscar SKU, pallet, lote…" : "Buscar producto, SKU, lote…"} className="h-9 pl-8" />
                </div>
                <Button size="sm" variant="outline" onClick={() => setMostrarPegar(v => !v)} className="gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" /> Pegar lista</Button>
                <Button size="sm" variant="outline" onClick={() => marcarVisibles(true)}>Marcar visibles</Button>
                <Button size="sm" variant="ghost" onClick={() => marcarVisibles(false)}>Desmarcar</Button>
              </div>
            )}
          </div>

          {editable && mostrarPegar && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs">Pega los {uti ? "SKU, N° de pallet o lotes" : "SKU o lotes"} que envió el cliente (uno por línea o separados por coma). Un SKU marca todas las líneas de ese producto.</Label>
              <textarea value={pegado} onChange={e => setPegado(e.target.value)} rows={4}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm font-mono" />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={aplicarLista} disabled={!pegado.trim()}>Marcar</Button>
                {resultadoPegado && <span className="text-xs text-muted-foreground">{resultadoPegado}</span>}
              </div>
            </div>
          )}

          {!clienteId ? (
            <p className="text-sm text-muted-foreground">Selecciona un cliente para ver su stock.</p>
          ) : cargandoStock ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando stock…</div>
          ) : filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente no tiene stock disponible.</p>
          ) : (
            <div className="rounded-lg border overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#1a3a5c] text-white text-left text-xs">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Producto</th>
                    <th className="px-3 py-2 font-medium">Lote</th>
                    {uti ? (<><th className="px-3 py-2 font-medium">Pallet</th><th className="px-3 py-2 font-medium">Rack</th></>) : <th className="px-3 py-2 font-medium text-right">Peso</th>}
                    <th className="px-3 py-2 font-medium">Bodega</th>
                    {!uti && <th className="px-3 py-2 font-medium text-right">Disp. pos.</th>}
                    <th className="px-3 py-2 font-medium text-right">Disp. und.</th>
                    {!uti && <th className="px-3 py-2 font-medium text-right w-24">Pos. a retirar</th>}
                    <th className="px-3 py-2 font-medium text-right w-28">Und. a retirar</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(l => {
                    const c = elegidas.get(l.key)
                    return (
                      <tr key={l.key} className={cn("border-t", c && "bg-sky-50/60 dark:bg-sky-950/20")}>
                        <td className="px-3 py-1.5"><Checkbox checked={!!c} disabled={!editable} onCheckedChange={v => alternar(l, v === true)} aria-label="Incluir en el picking" /></td>
                        <td className="px-3 py-1.5 tabular-nums">{l.codigo ?? "—"}</td>
                        <td className="px-3 py-1.5 font-medium">{l.producto}</td>
                        <td className="px-3 py-1.5">{l.lote ?? "—"}</td>
                        {uti ? (<><td className="px-3 py-1.5">{l.pallet ?? "—"}</td><td className="px-3 py-1.5">{l.rack ?? "—"}</td></>) : <td className="px-3 py-1.5 text-right tabular-nums">{fmt(l.peso) || "—"}</td>}
                        <td className="px-3 py-1.5">{l.bodega ?? "—"}</td>
                        {!uti && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{l.posiciones}</td>}
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(l.unidades)}</td>
                        {!uti && <td className="px-3 py-1.5"><Input type="number" min={0} value={c?.pos ?? ""} disabled={!c || !editable} onChange={e => cambiarCantidad(l.key, "pos", e.target.value)} className="h-8 text-right tabular-nums" /></td>}
                        <td className="px-3 py-1.5"><Input type="number" min={0} value={c?.und ?? ""} disabled={!c || !editable} onChange={e => cambiarCantidad(l.key, "und", e.target.value)} className="h-8 text-right tabular-nums" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
