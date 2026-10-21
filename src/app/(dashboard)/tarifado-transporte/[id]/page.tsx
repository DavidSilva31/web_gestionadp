"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Plus, Trash2, Save, Download, ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { ClienteCombobox } from "@/components/reports/report-form-widgets"
import { TarifadoPreviewModal } from "@/components/tarifado-transporte/tarifado-preview-modal"
import { EMISORES, type Emisor } from "@/lib/cotizacion-pdf-build"
import { TRAMOS_DIESEL, construirTarifadoPDFData, numeroTarifado } from "@/lib/tarifado-transporte-pdf-build"
import type { TarifadoPDFData } from "@/components/tarifado-transporte/tarifado-pdf"

type Cliente = { id: string; nombre: string; rut: string | null }
type Obs = { id: string; texto: string }
type TarifaRow = { trayecto: string; capacidad: string; uf_pre_alza: number | null; valores_uf: number[] }

// Una fila del catálogo (o una tarifa manual) con su casilla de "incluir en el tarifado".
type Linea = {
  key: string
  incluir: boolean
  trayecto: string
  capacidad: string
  preAlza: string
  valores: string[]
}

const nuevaLinea = (incluir: boolean, t?: Partial<TarifaRow>): Linea => ({
  key: crypto.randomUUID(),
  incluir,
  trayecto: t?.trayecto ?? "",
  capacidad: t?.capacidad ?? "",
  preAlza: t?.uf_pre_alza != null ? String(t.uf_pre_alza) : "",
  valores: TRAMOS_DIESEL.map((_, i) => (t?.valores_uf?.[i] != null ? String(t.valores_uf[i]) : "")),
})

const clave = (t: { trayecto: string; capacidad: string }) => `${t.trayecto.trim()}|${t.capacidad.trim()}`
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v))

export default function TarifadoFormPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const esNuevo = params.id === "nuevo"

  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfDatos, setPdfDatos] = useState<TarifadoPDFData | null>(null)
  const [numero, setNumero] = useState<number | null>(null)
  const [tarId, setTarId] = useState<string | null>(esNuevo ? null : params.id)

  const [catClientes, setCatClientes] = useState<Cliente[]>([])
  const [catObs, setCatObs] = useState<Obs[]>([])

  const [emisor, setEmisor] = useState<Emisor>("Altos del Puerto")
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [vigenciaDesde, setVigenciaDesde] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [clienteTexto, setClienteTexto] = useState("")
  const [atencion, setAtencion] = useState("")
  const [ciudad, setCiudad] = useState("")
  const [direccion, setDireccion] = useState("")
  const [rut, setRut] = useState("")
  const [lineas, setLineas] = useState<Linea[]>([])
  const [obsSel, setObsSel] = useState<Set<string>>(new Set())
  const [obsExtra, setObsExtra] = useState("")
  const [editandoObsId, setEditandoObsId] = useState<string | null>(null)
  const [editandoTexto, setEditandoTexto] = useState("")
  const [agregandoObs, setAgregandoObs] = useState(false)
  const [nuevaObs, setNuevaObs] = useState("")

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const [cl, cat, ob] = await Promise.all([
        supabase.from("clientes_cotizacion").select("id, nombre, rut").order("nombre"),
        supabase.from("tarifado_catalogo").select("trayecto, capacidad, uf_pre_alza, valores_uf").eq("activo", true).order("orden"),
        supabase.from("tarifado_obs_catalogo").select("id, texto").eq("activo", true).order("orden"),
      ])
      const clientes = (cl.data ?? []) as Cliente[]
      const catalogo = ((cat.data ?? []) as TarifaRow[]).map(t => ({ ...t, valores_uf: (t.valores_uf ?? []).map(Number) }))
      setCatClientes(clientes)
      const observaciones = (ob.data ?? []) as Obs[]
      setCatObs(observaciones)

      if (esNuevo) {
        setLineas(catalogo.map(t => nuevaLinea(true, t)))
        setObsSel(new Set(observaciones.map(o => o.id)))
      } else {
        const { data: t, error: e } = await supabase.from("tarifados").select("*").eq("id", params.id).single()
        if (e || !t) { setError(e?.message ?? "Tarifado no encontrado"); setCargando(false); return }
        const [li, ov] = await Promise.all([
          supabase.from("tarifado_lineas").select("trayecto, capacidad, uf_pre_alza, valores_uf").eq("tarifado_id", params.id).order("orden"),
          supabase.from("tarifado_observaciones").select("observacion_id").eq("tarifado_id", params.id),
        ])
        const guardadas = ((li.data ?? []) as TarifaRow[]).map(l => ({ ...l, valores_uf: (l.valores_uf ?? []).map(Number) }))
        const guardadasPorClave = new Set(guardadas.map(clave))
        // Primero las guardadas (marcadas), luego el resto del catálogo sin marcar.
        setLineas([
          ...guardadas.map(l => nuevaLinea(true, l)),
          ...catalogo.filter(c => !guardadasPorClave.has(clave(c))).map(c => nuevaLinea(false, c)),
        ])
        const cliente = clientes.find(x => x.id === t.cliente_id)
        setNumero(t.numero)
        setEmisor(t.emisor as Emisor)
        setFecha(t.fecha)
        setVigenciaDesde(t.vigencia_desde ?? "")
        setClienteId(t.cliente_id)
        setClienteTexto(cliente?.nombre ?? "")
        setRut(cliente?.rut ?? "")
        setAtencion(t.atencion ?? "")
        setCiudad(t.ciudad ?? "")
        setDireccion(t.direccion ?? "")
        setObsExtra(t.observaciones_extra ?? "")
        setObsSel(new Set((ov.data ?? []).map(o => o.observacion_id)))
      }
      setCargando(false)
    })()
  }, [esNuevo, params.id])

  const cliente = useMemo(() => catClientes.find(c => c.id === clienteId) ?? null, [catClientes, clienteId])

  useEffect(() => {
    if (!esNuevo || !cliente) return
    setRut(cliente.rut ?? "")
  }, [cliente, esNuevo])

  const incluidas = lineas.filter(l => l.incluir && l.trayecto.trim() !== "")

  function actualizarLinea(key: string, cambios: Partial<Linea>) {
    setLineas(ls => ls.map(l => (l.key === key ? { ...l, ...cambios } : l)))
  }

  function actualizarValor(key: string, i: number, v: string) {
    setLineas(ls => ls.map(l => (l.key === key ? { ...l, valores: l.valores.map((x, j) => (j === i ? v : x)) } : l)))
  }

  // Editar o agregar cambia el catálogo (vale para todos los tarifados), igual que en Cotizaciones.
  async function guardarEdicionObs(id: string) {
    const texto = editandoTexto.trim()
    if (!texto) { setError("La observación no puede quedar vacía."); return }
    const { error: e } = await createClient().from("tarifado_obs_catalogo").update({ texto }).eq("id", id)
    if (e) { setError(e.message); return }
    setCatObs(prev => prev.map(o => (o.id === id ? { ...o, texto } : o)))
    setEditandoObsId(null)
    setError(null)
  }

  async function crearObs() {
    const texto = nuevaObs.trim()
    if (!texto) { setError("Escribe el texto de la observación."); return }
    const { data, error: e } = await createClient().from("tarifado_obs_catalogo")
      .insert({ texto, orden: catObs.length }).select("id, texto").single()
    if (e || !data) { setError(e?.message ?? "No se pudo crear la observación"); return }
    setCatObs(prev => [...prev, data as Obs])
    setObsSel(prev => new Set(prev).add(data.id))
    setAgregandoObs(false)
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
    if (incluidas.length === 0) { setError("Selecciona al menos una tarifa."); return null }

    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const cabecera = {
      emisor, fecha, vigencia_desde: vigenciaDesde || null, cliente_id: clienteId, atencion: atencion || null,
      ciudad: ciudad || null, direccion: direccion || null, observaciones_extra: obsExtra.trim() || null,
      updated_by: user?.id ?? null,
    }

    let id = tarId
    if (id) {
      const { error: e } = await supabase.from("tarifados").update(cabecera).eq("id", id)
      if (e) { setError(e.message); setGuardando(false); return null }
    } else {
      const { data, error: e } = await supabase.from("tarifados")
        .insert({ ...cabecera, created_by: user?.id ?? null }).select("id, numero").single()
      if (e || !data) { setError(e?.message ?? "No se pudo crear"); setGuardando(false); return null }
      id = data.id
      setTarId(data.id)
      setNumero(data.numero)
    }

    const { error: eDel } = await supabase.from("tarifado_lineas").delete().eq("tarifado_id", id)
    if (eDel) { setError(eDel.message); setGuardando(false); return null }
    const { error: eLin } = await supabase.from("tarifado_lineas").insert(
      incluidas.map((l, i) => ({
        tarifado_id: id, trayecto: l.trayecto.trim(), capacidad: l.capacidad.trim(), uf_pre_alza: num(l.preAlza),
        valores_uf: l.valores.map(v => num(v) ?? 0), orden: i,
      }))
    )
    if (eLin) { setError(eLin.message); setGuardando(false); return null }

    const { error: eDelObs } = await supabase.from("tarifado_observaciones").delete().eq("tarifado_id", id)
    if (eDelObs) { setError(eDelObs.message); setGuardando(false); return null }
    if (obsSel.size > 0) {
      const { error: eObs } = await supabase.from("tarifado_observaciones").insert(
        [...obsSel].map(oid => ({ tarifado_id: id, observacion_id: oid }))
      )
      if (eObs) { setError(eObs.message); setGuardando(false); return null }
    }

    setGuardando(false)
    if (esNuevo) router.replace(`/tarifado-transporte/${id}`)
    return id
  }

  function abrirPDF() {
    if (!cliente) { setError("Selecciona un cliente antes de ver el PDF."); return }
    if (incluidas.length === 0) { setError("Selecciona al menos una tarifa."); return }
    setError(null)
    setPdfDatos(construirTarifadoPDFData({
      numero: numero ?? 0,
      fecha,
      vigenciaDesde: vigenciaDesde || null,
      emisor,
      cliente: { nombre: cliente.nombre, rut: rut || null },
      atencion: atencion || null,
      ciudad: ciudad || null,
      direccion: direccion || null,
      lineas: incluidas.map(l => ({
        trayecto: l.trayecto.trim(),
        capacidad: l.capacidad.trim(),
        ufPreAlza: num(l.preAlza),
        valoresUF: l.valores.map(v => num(v) ?? 0),
      })),
      observaciones: [...catObs.filter(o => obsSel.has(o.id)).map(o => o.texto), ...(obsExtra.trim() ? [obsExtra.trim()] : [])],
    }))
  }

  if (cargando) {
    return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
  }

  const titulo = numero != null ? `Tarifado N° ${numeroTarifado(numero, fecha)}` : "Nuevo tarifado"
  const todasMarcadas = lineas.length > 0 && lineas.every(l => l.incluir)

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={titulo} subtitle={cliente ? cliente.nombre : "Completa los datos y elige las tarifas"}>
        <Button variant="outline" onClick={() => router.push("/tarifado-transporte")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <Button variant="outline" onClick={abrirPDF} className="gap-1.5">
          <Download className="h-4 w-4" /> Ver PDF
        </Button>
        <Button onClick={guardar} disabled={guardando} className="gap-1.5">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
      </PageHeader>

      {pdfDatos && <TarifadoPreviewModal data={pdfDatos} onClose={() => setPdfDatos(null)} />}

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
            <Label className="text-xs">Tarifas rigen a contar del</Label>
            <Input type="date" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} className="h-9" />
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
            <h3 className="text-sm font-semibold">
              Tarifas a enviar <span className="font-normal text-muted-foreground">({incluidas.length} seleccionadas)</span>
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={todasMarcadas} onCheckedChange={v => setLineas(ls => ls.map(l => ({ ...l, incluir: v === true })))} />
                Todas
              </label>
              <Button size="sm" variant="outline" onClick={() => setLineas(ls => [...ls, nuevaLinea(true)])} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Tarifa manual
              </Button>
            </div>
          </div>
          <div className="rounded-xl border shadow-sm overflow-auto max-h-[70vh]">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#1a3a5c] text-white">
                  <th className="w-11 sticky left-0 z-30 bg-[#1a3a5c] border-b border-white/15"></th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide min-w-[28rem] sticky left-11 z-30 bg-[#1a3a5c] border-b border-r border-white/15">Trayecto</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide min-w-24 border-b border-r border-white/15">Capacidad</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide min-w-28 leading-tight border-b border-r border-white/15">
                    Pre-alza<span className="block text-[10px] font-normal normal-case tracking-normal text-white/70">UF/viaje</span>
                  </th>
                  {TRAMOS_DIESEL.map(t => (
                    <th key={t} className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums min-w-28 leading-tight border-b border-r border-white/15 last:border-r-0">
                      {t}<span className="block text-[10px] font-normal text-white/70">CLP · UF/viaje</span>
                    </th>
                  ))}
                  <th className="w-11 border-b border-white/15"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const fondo = i % 2 === 1 ? "bg-slate-50 dark:bg-slate-900" : "bg-background"
                  const celda = `border-b border-r border-border/70 p-0 ${fondo}`
                  const campo = "block w-full h-10 bg-transparent px-3 text-xs outline-none focus:bg-[#3f9fd1]/10 focus:ring-2 focus:ring-inset focus:ring-[#3f9fd1]"
                  const campoNum = `${campo} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`
                  return (
                    <tr key={l.key} className={`group ${l.incluir ? "" : "opacity-50"}`}>
                      <td className={`${celda} sticky left-0 z-10`}>
                        <div className="flex h-10 items-center justify-center">
                          <Checkbox checked={l.incluir} onCheckedChange={v => actualizarLinea(l.key, { incluir: v === true })} aria-label="Incluir en el tarifado" />
                        </div>
                      </td>
                      <td className={`${celda} sticky left-11 z-10`}>
                        <input value={l.trayecto} onChange={e => actualizarLinea(l.key, { trayecto: e.target.value })} className={`${campo} font-medium`} title={l.trayecto} aria-label="Trayecto" />
                      </td>
                      <td className={celda}>
                        <input value={l.capacidad} onChange={e => actualizarLinea(l.key, { capacidad: e.target.value })} className={campo} aria-label="Capacidad" />
                      </td>
                      <td className={celda}>
                        <input type="number" step="0.01" value={l.preAlza} onChange={e => actualizarLinea(l.key, { preAlza: e.target.value })} className={`${campoNum} text-muted-foreground`} aria-label="Pre-alza" />
                      </td>
                      {l.valores.map((v, j) => (
                        <td key={j} className={celda}>
                          <input type="number" step="0.01" value={v} onChange={e => actualizarValor(l.key, j, e.target.value)} className={campoNum} aria-label={`Tramo ${TRAMOS_DIESEL[j]}`} />
                        </td>
                      ))}
                      <td className={`${celda} !border-r-0 text-center`}>
                        <button type="button" onClick={() => setLineas(ls => ls.filter(x => x.key !== l.key))}
                          className="text-muted-foreground opacity-40 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition-opacity" aria-label="Quitar tarifa">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Valores en UF por viaje. Los cambios aquí aplican solo a este tarifado, no al catálogo.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Observaciones</h3>
          {catObs.map(o => (
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
          {agregandoObs ? (
            <div className="space-y-1.5 pl-6">
              <textarea value={nuevaObs} onChange={e => setNuevaObs(e.target.value)} rows={2} placeholder="Texto de la nueva observación"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={crearObs} className="h-7 text-xs">Agregar</Button>
                <Button size="sm" variant="outline" onClick={() => { setAgregandoObs(false); setNuevaObs("") }} className="h-7 text-xs">Cancelar</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAgregandoObs(true)}
              className="pl-6 text-xs text-[#3f9fd1] hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Agregar observación
            </button>
          )}
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
