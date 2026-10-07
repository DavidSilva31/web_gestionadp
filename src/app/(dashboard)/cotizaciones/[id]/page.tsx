"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Plus, Trash2, Save, Download, ArrowLeft, Loader2, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { ClienteCombobox } from "@/components/reports/report-form-widgets"
import { CotizacionPreviewModal } from "@/components/cotizaciones/cotizacion-preview-modal"
import { EMISORES, EMISOR_DATOS, FIRMA, IVA, type Emisor } from "@/lib/cotizacion-pdf-build"
import type { CotizacionPDFData } from "@/components/cotizaciones/cotizacion-pdf"

type Cliente = { id: string; nombre: string; rut: string | null }
type ItemCat = { id: string; nombre: string; valor_unitario: number | null; categoria: string }
type ObsTipo = { id: string; nombre: string }
type Obs = { id: string; texto: string; tipo_id: string }

type Linea = {
  key: string
  item_id: string | null
  cantidad: number
  descripcion: string
  valor_uf: number
  descuento_pct: number
}

const fmtCL = (n: number, dec = 0) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const nuevaLinea = (): Linea => ({ key: crypto.randomUUID(), item_id: null, cantidad: 1, descripcion: "", valor_uf: 0, descuento_pct: 0 })

export default function CotizacionFormPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const esNueva = params.id === "nueva"

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfDatos, setPdfDatos] = useState<CotizacionPDFData | null>(null)
  const [numero, setNumero] = useState<number | null>(null)
  const [cotId, setCotId] = useState<string | null>(esNueva ? null : params.id)

  const [catClientes, setCatClientes] = useState<Cliente[]>([])
  const [catItems, setCatItems] = useState<ItemCat[]>([])
  const [catTipos, setCatTipos] = useState<ObsTipo[]>([])
  const [catObs, setCatObs] = useState<Obs[]>([])

  const [emisor, setEmisor] = useState<Emisor>("Altos del Puerto")
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [clienteId, setClienteId] = useState("")
  const [clienteTexto, setClienteTexto] = useState("")
  const [atencion, setAtencion] = useState("")
  const [ciudad, setCiudad] = useState("")
  const [direccion, setDireccion] = useState("")
  const [rut, setRut] = useState("")
  const [valorUF, setValorUF] = useState(0)
  const [ufLoading, setUfLoading] = useState(false)
  const [ufError, setUfError] = useState<string | null>(null)
  const [ufRetry, setUfRetry] = useState(0)
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()])
  const [obsSel, setObsSel] = useState<Set<string>>(new Set())
  const [obsExtra, setObsExtra] = useState("")
  const [editandoObsId, setEditandoObsId] = useState<string | null>(null)
  const [editandoTexto, setEditandoTexto] = useState("")
  const [nuevaObsTipo, setNuevaObsTipo] = useState<string | null>(null)
  const [nuevaObs, setNuevaObs] = useState("")

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const [cl, it, tp, ob] = await Promise.all([
        supabase.from("clientes_cotizacion").select("id, nombre, rut").order("nombre"),
        supabase.from("items_cotizacion").select("id, nombre, valor_unitario, items_cotizacion_categorias(nombre)").eq("activo", true).order("nombre"),
        supabase.from("observacion_tipos").select("id, nombre").order("nombre"),
        supabase.from("observaciones_cotizacion").select("id, texto, tipo_id").eq("activo", true),
      ])
      setCatClientes((cl.data ?? []) as Cliente[])
      setCatItems(((it.data ?? []) as unknown as { id: string; nombre: string; valor_unitario: number | null; items_cotizacion_categorias: { nombre: string } | null }[])
        .map(i => ({ id: i.id, nombre: i.nombre, valor_unitario: i.valor_unitario, categoria: i.items_cotizacion_categorias?.nombre ?? "" })))
      setCatTipos((tp.data ?? []) as ObsTipo[])
      setCatObs((ob.data ?? []) as Obs[])

      if (!esNueva) {
        const { data: c, error: e } = await supabase.from("cotizaciones").select("*").eq("id", params.id).single()
        if (e || !c) { setError(e?.message ?? "Cotización no encontrada"); setCargando(false); return }
        const [li, ov] = await Promise.all([
          supabase.from("cotizacion_lineas").select("*").eq("cotizacion_id", params.id).order("orden"),
          supabase.from("cotizacion_observaciones").select("observacion_id").eq("cotizacion_id", params.id),
        ])
        setNumero(c.numero)
        setEmisor(c.emisor as Emisor)
        setFecha(c.fecha)
        setClienteId(c.cliente_id)
        setClienteTexto(((cl.data ?? []) as Cliente[]).find(x => x.id === c.cliente_id)?.nombre ?? "")
        setAtencion(c.atencion ?? "")
        setCiudad(c.ciudad ?? "")
        setDireccion(c.direccion ?? "")
        setValorUF(Number(c.valor_uf))
        setObsExtra(c.observaciones_extra ?? "")
        setLineas((li.data ?? []).length
          ? (li.data ?? []).map(l => ({ key: l.id, item_id: l.item_id, cantidad: Number(l.cantidad), descripcion: l.descripcion, valor_uf: Number(l.valor_uf), descuento_pct: Number(l.descuento_pct) }))
          : [nuevaLinea()])
        setObsSel(new Set((ov.data ?? []).map(o => o.observacion_id)))
      }
      setCargando(false)
    })()
  }, [esNueva, params.id])

  useEffect(() => {
    if (!esNueva) return
    let cancelled = false
    const controller = new AbortController()
    setUfLoading(true)
    setUfError(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/uf?fecha=${encodeURIComponent(fecha)}`, { signal: controller.signal })
        const data = await res.json().catch(() => ({})) as { valor?: number; error?: string }
        if (cancelled) return
        if (!res.ok || typeof data.valor !== "number") {
          setUfError(data.error ?? "No se pudo obtener la UF. Ingrésala manualmente o reintenta.")
          return
        }
        setValorUF(data.valor)
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return
        setUfError("No se pudo obtener la UF. Ingrésala manualmente o reintenta.")
      } finally {
        if (!cancelled) setUfLoading(false)
      }
    })()
    return () => { cancelled = true; controller.abort() }
  }, [esNueva, fecha, ufRetry])

  const cliente = useMemo(() => catClientes.find(c => c.id === clienteId) ?? null, [catClientes, clienteId])

  useEffect(() => {
    if (!esNueva || !cliente) return
    setRut(cliente.rut ?? "")
  }, [cliente, esNueva])

  const calc = useMemo(() => {
    const netoLineas = lineas.map(l => l.cantidad * l.valor_uf * valorUF * (1 - l.descuento_pct / 100))
    const neto = Math.round(netoLineas.reduce((s, n) => s + n, 0))
    const iva = Math.round(neto * IVA)
    return { netoLineas, neto, iva, total: neto + iva }
  }, [lineas, valorUF])

  function actualizarLinea(key: string, cambios: Partial<Linea>) {
    setLineas(ls => ls.map(l => (l.key === key ? { ...l, ...cambios } : l)))
  }

  async function guardarEdicionObs(id: string) {
    const texto = editandoTexto.trim()
    if (!texto) { setError("La observación no puede quedar vacía."); return }
    const supabase = createClient()
    const { error: e } = await supabase.from("observaciones_cotizacion").update({ texto }).eq("id", id)
    if (e) { setError(e.message); return }
    setCatObs(prev => prev.map(o => (o.id === id ? { ...o, texto } : o)))
    setEditandoObsId(null)
    setError(null)
  }

  async function crearObs(tipoId: string) {
    const texto = nuevaObs.trim()
    if (!texto) { setError("Escribe el texto de la observación."); return }
    const supabase = createClient()
    const { data, error: e } = await supabase.from("observaciones_cotizacion")
      .insert({ tipo_id: tipoId, texto }).select("id, texto, tipo_id").single()
    if (e || !data) { setError(e?.message ?? "No se pudo crear la observación"); return }
    setCatObs(prev => [...prev, data as Obs])
    setObsSel(prev => new Set(prev).add(data.id))
    setNuevaObsTipo(null)
    setNuevaObs("")
    setError(null)
  }

  function toggleObs(id: string, on: boolean) {
    setObsSel(prev => {
      const n = new Set(prev)
      if (on) n.add(id); else n.delete(id)
      return n
    })
  }

  async function guardar(): Promise<string | null> {
    setError(null)
    if (!clienteId) { setError("Selecciona un cliente."); return null }
    if (valorUF <= 0) { setError("Ingresa el valor UF."); return null }
    const lineasValidas = lineas.filter(l => l.descripcion.trim() !== "")
    if (lineasValidas.length === 0) { setError("Agrega al menos una línea con descripción."); return null }

    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cabecera = {
      emisor, fecha, cliente_id: clienteId, atencion: atencion || null, ciudad: ciudad || null,
      direccion: direccion || null, valor_uf: valorUF, neto: calc.neto, iva: calc.iva, total: calc.total,
      observaciones_extra: obsExtra.trim() || null, updated_by: user?.id ?? null,
    }

    let id = cotId
    if (id) {
      const { error: e } = await supabase.from("cotizaciones").update(cabecera).eq("id", id)
      if (e) { setError(e.message); setGuardando(false); return null }
    } else {
      const { data, error: e } = await supabase.from("cotizaciones")
        .insert({ ...cabecera, created_by: user?.id ?? null }).select("id, numero").single()
      if (e || !data) { setError(e?.message ?? "No se pudo crear"); setGuardando(false); return null }
      id = data.id
      setCotId(data.id)
      setNumero(data.numero)
    }

    const { error: eDel } = await supabase.from("cotizacion_lineas").delete().eq("cotizacion_id", id)
    if (eDel) { setError(eDel.message); setGuardando(false); return null }
    const { error: eLin } = await supabase.from("cotizacion_lineas").insert(
      lineasValidas.map((l, i) => ({
        cotizacion_id: id, item_id: l.item_id, cantidad: l.cantidad, descripcion: l.descripcion.trim(),
        valor_uf: l.valor_uf, descuento_pct: l.descuento_pct, orden: i,
      }))
    )
    if (eLin) { setError(eLin.message); setGuardando(false); return null }

    const { error: eDelObs } = await supabase.from("cotizacion_observaciones").delete().eq("cotizacion_id", id)
    if (eDelObs) { setError(eDelObs.message); setGuardando(false); return null }
    if (obsSel.size > 0) {
      const { error: eObs } = await supabase.from("cotizacion_observaciones").insert(
        [...obsSel].map(oid => ({ cotizacion_id: id, observacion_id: oid }))
      )
      if (eObs) { setError(eObs.message); setGuardando(false); return null }
    }

    setGuardando(false)
    if (esNueva) router.replace(`/cotizaciones/${id}`)
    return id
  }

  function construirPDF(): CotizacionPDFData | null {
    if (!cliente) return null
    const obsPorTipo = [...obsSel]
      .map(id => catObs.find(o => o.id === id))
      .filter((o): o is Obs => !!o)
      .map(o => ({ tipo: catTipos.find(t => t.id === o.tipo_id)?.nombre ?? "", texto: o.texto }))
    return {
      numero: numero ?? 0,
      fecha: new Date(fecha + "T00:00:00").toLocaleDateString("es-CL"),
      emisor: { nombre: emisor, ...EMISOR_DATOS[emisor] },
      cliente: { razonSocial: cliente.nombre, rut: rut || null, ciudad: ciudad || null, direccion: direccion || null },
      atencion: atencion || null,
      valorUF,
      lineas: lineas.filter(l => l.descripcion.trim() !== "").map((l, i) => ({
        cantidad: l.cantidad,
        descripcion: l.descripcion,
        valorUF: l.valor_uf,
        valorPesos: Math.round(calc.netoLineas[i] ?? 0),
      })),
      neto: calc.neto,
      iva: calc.iva,
      total: calc.total,
      observaciones: obsPorTipo,
      observacionesExtra: obsExtra.trim() || null,
      firma: FIRMA,
    }
  }

  async function duplicar() {
    setError(null)
    const lineasValidas = lineas.filter(l => l.descripcion.trim() !== "")
    if (!clienteId || lineasValidas.length === 0) { setError("La cotización necesita cliente y al menos una línea para duplicarla."); return }
    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: nueva, error: eCot } = await supabase.from("cotizaciones").insert({
      emisor, fecha: new Date().toISOString().slice(0, 10), cliente_id: clienteId, atencion: atencion || null,
      ciudad: ciudad || null, direccion: direccion || null, valor_uf: valorUF, neto: calc.neto, iva: calc.iva,
      total: calc.total, observaciones_extra: obsExtra.trim() || null, created_by: user?.id ?? null, updated_by: user?.id ?? null,
    }).select("id").single()
    if (eCot || !nueva) { setError(eCot?.message ?? "No se pudo duplicar"); setGuardando(false); return }

    const { error: eLin } = await supabase.from("cotizacion_lineas").insert(
      lineasValidas.map((l, i) => ({
        cotizacion_id: nueva.id, item_id: l.item_id, cantidad: l.cantidad, descripcion: l.descripcion.trim(),
        valor_uf: l.valor_uf, descuento_pct: l.descuento_pct, orden: i,
      }))
    )
    if (eLin) { setError(eLin.message); setGuardando(false); return }

    if (obsSel.size > 0) {
      const { error: eObs } = await supabase.from("cotizacion_observaciones").insert(
        [...obsSel].map(oid => ({ cotizacion_id: nueva.id, observacion_id: oid }))
      )
      if (eObs) { setError(eObs.message); setGuardando(false); return }
    }

    setGuardando(false)
    router.push(`/cotizaciones/${nueva.id}`)
  }

  function abrirPDF() {
    const datos = construirPDF()
    if (!datos) { setError("Selecciona un cliente antes de ver el PDF."); return }
    setPdfDatos(datos)
  }

  if (cargando) {
    return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
  }

  const tituloNumero = numero != null ? `Cotización N° ${numero}` : "Nueva cotización"

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={tituloNumero} subtitle={cliente ? cliente.nombre : "Completa los datos y las líneas"}>
        <Button variant="outline" onClick={() => router.push("/cotizaciones")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        {!esNueva && (
          <Button variant="outline" onClick={duplicar} disabled={guardando} className="gap-1.5">
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
        )}
        <Button variant="outline" onClick={abrirPDF} className="gap-1.5">
          <Download className="h-4 w-4" /> Ver PDF
        </Button>
        <Button onClick={guardar} disabled={guardando} className="gap-1.5">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
      </PageHeader>

      {pdfDatos && (
        <CotizacionPreviewModal data={pdfDatos} cotizacionId={cotId} onClose={() => setPdfDatos(null)} />
      )}

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Emisor</Label>
            <select value={emisor} onChange={e => setEmisor(e.target.value as Emisor)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {EMISORES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <ClienteCombobox value={clienteTexto} onChange={setClienteTexto} onChangeId={setClienteId} tabla="clientes_cotizacion" permitirEliminar />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor UF</Label>
            <Input type="number" step="0.01" value={valorUF || ""} onChange={e => { setValorUF(Number(e.target.value)); setUfError(null) }}
              placeholder={ufLoading ? "Obteniendo UF…" : ""} className="h-9" />
            {ufError && (
              <p className="text-xs text-destructive flex items-center gap-2">
                {ufError}
                <button type="button" onClick={() => setUfRetry(t => t + 1)} className="underline">Reintentar</button>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Atención</Label>
            <Input value={atencion} onChange={e => setAtencion(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">RUT</Label>
            <Input value={rut} onChange={e => setRut(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ciudad</Label>
            <Input value={ciudad} onChange={e => setCiudad(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dirección</Label>
            <Input value={direccion} onChange={e => setDireccion(e.target.value)} className="h-9" />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Ítems</h3>
            <Button size="sm" variant="outline" onClick={() => setLineas(ls => [...ls, nuevaLinea()])} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Añadir línea
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Descripción</th>
                  <th className="px-2 py-2 text-right font-medium w-20">Cant.</th>
                  <th className="px-2 py-2 text-right font-medium w-24">UF unit.</th>
                  <th className="px-2 py-2 text-right font-medium w-28">Valor unit. ($)</th>
                  <th className="px-2 py-2 text-right font-medium w-20">Desc. %</th>
                  <th className="px-2 py-2 text-right font-medium w-28">Neto ($)</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.key} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                    <td className="px-2 py-1.5">
                      <Input value={l.descripcion} onChange={e => actualizarLinea(l.key, { descripcion: e.target.value })} className="h-8 text-xs" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.01" value={l.cantidad} onChange={e => actualizarLinea(l.key, { cantidad: Number(e.target.value) })} className="h-8 text-xs text-right" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.001" value={l.valor_uf} onChange={e => actualizarLinea(l.key, { valor_uf: Number(e.target.value) })} className="h-8 text-xs text-right" />
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtCL(Math.round(l.valor_uf * valorUF))}</td>
                    <td className="px-2 py-1.5">
                      <Input type="number" step="0.01" value={l.descuento_pct} onChange={e => actualizarLinea(l.key, { descuento_pct: Number(e.target.value) })} className="h-8 text-xs text-right" />
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{fmtCL(Math.round(calc.netoLineas[i] ?? 0))}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => setLineas(ls => ls.length > 1 ? ls.filter(x => x.key !== l.key) : ls)}
                        className="text-muted-foreground hover:text-destructive" aria-label="Eliminar línea">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Neto</span><span>$ {fmtCL(calc.neto)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IVA 19%</span><span>$ {fmtCL(calc.iva)}</span></div>
              <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>$ {fmtCL(calc.total)}</span></div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Observaciones</h3>
          {catTipos.map(t => (
            <div key={t.id} className="space-y-1.5">
              <p className="text-xs font-semibold text-[#3f9fd1] tracking-wide">{t.nombre}</p>
              {catObs.filter(o => o.tipo_id === t.id).map(o => (
                <div key={o.id} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={obsSel.has(o.id)} onCheckedChange={v => toggleObs(o.id, v === true)} className="mt-1 h-3.5 w-3.5" />
                  {editandoObsId === o.id ? (
                    <div className="flex-1 space-y-1.5">
                      <textarea value={editandoTexto} onChange={e => setEditandoTexto(e.target.value)} rows={2}
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => guardarEdicionObs(o.id)} className="h-7 text-xs">Guardar</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditandoObsId(null)} className="h-7 text-xs">Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1">{o.texto}</span>
                      <button type="button" onClick={() => { setEditandoObsId(o.id); setEditandoTexto(o.texto) }}
                        className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">Editar</button>
                    </>
                  )}
                </div>
              ))}
              {nuevaObsTipo === t.id ? (
                <div className="space-y-1.5 pl-6">
                  <textarea value={nuevaObs} onChange={e => setNuevaObs(e.target.value)} rows={2} placeholder="Texto de la nueva observación"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => crearObs(t.id)} className="h-7 text-xs">Agregar</Button>
                    <Button size="sm" variant="outline" onClick={() => { setNuevaObsTipo(null); setNuevaObs("") }} className="h-7 text-xs">Cancelar</Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setNuevaObsTipo(t.id); setNuevaObs("") }}
                  className="pl-6 text-xs text-[#3f9fd1] hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Agregar observación
                </button>
              )}
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs">Observaciones extras</Label>
            <textarea value={obsExtra} onChange={e => setObsExtra(e.target.value)} rows={3}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
          </div>
        </section>
      </div>
    </div>
  )
}
