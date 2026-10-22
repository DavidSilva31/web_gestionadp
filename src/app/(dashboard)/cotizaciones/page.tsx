"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Copy, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"

type FilaCotizacion = {
  id: string
  numero: number
  fecha: string
  emisor: string
  valor_uf: number
  total: number
  atencion: string | null
  clientes_cotizacion: { nombre: string } | null
}

type Campo = "numero" | "fecha" | "emisor" | "cliente" | "atencion" | "valor_uf" | "total"

const EMISORES = ["Altos del Puerto", "Incomex", "Mar Azul"]

const fmtCL = (n: number, dec = 0) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })

export default function CotizacionesPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<FilaCotizacion[]>([])   // solo la página actual
  const [total, setTotal] = useState(0)                      // coincidencias en toda la base
  const [loading, setLoading] = useState(true)               // primera carga
  const [buscando, setBuscando] = useState(false)            // recarga por filtro/orden/página
  const [error, setError] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)
  const [aEliminar, setAEliminar] = useState<FilaCotizacion | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    // Las líneas y observaciones de la cotización se borran en cascada.
    const { error } = await createClient().from("cotizaciones").delete().eq("id", aEliminar.id)
    setEliminando(false)
    if (error) { setErrorEliminar(error.message); return }
    setFilas(prev => prev.filter(f => f.id !== aEliminar.id))
    setTotal(t => Math.max(0, t - 1))
    setAEliminar(null)
  }

  const [texto, setTexto] = useState("")
  const [textoBusqueda, setTextoBusqueda] = useState("")   // texto ya "asentado" (con retardo) que se envía al servidor
  const [emisorFiltro, setEmisorFiltro] = useState("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [orden, setOrden] = useState<{ campo: Campo; dir: "asc" | "desc" }>({ campo: "numero", dir: "desc" })
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 25

  async function duplicar(id: string) {
    setError(null)
    setDuplicando(id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [cot, li, ob] = await Promise.all([
      supabase.from("cotizaciones").select("*").eq("id", id).single(),
      supabase.from("cotizacion_lineas").select("*").eq("cotizacion_id", id).order("orden"),
      supabase.from("cotizacion_observaciones").select("observacion_id").eq("cotizacion_id", id),
    ])
    if (cot.error || !cot.data) { setError(cot.error?.message ?? "No se pudo duplicar"); setDuplicando(null); return }
    const c = cot.data
    const { data: nueva, error: eCot } = await supabase.from("cotizaciones").insert({
      emisor: c.emisor, fecha: new Date().toISOString().slice(0, 10), cliente_id: c.cliente_id,
      atencion: c.atencion, ciudad: c.ciudad, direccion: c.direccion, valor_uf: c.valor_uf,
      neto: c.neto, iva: c.iva, total: c.total, observaciones_extra: c.observaciones_extra,
      created_by: user?.id ?? null, updated_by: user?.id ?? null,
    }).select("id").single()
    if (eCot || !nueva) { setError(eCot?.message ?? "No se pudo duplicar"); setDuplicando(null); return }
    if ((li.data ?? []).length > 0) {
      const { error: eLin } = await supabase.from("cotizacion_lineas").insert(
        (li.data ?? []).map(l => ({ cotizacion_id: nueva.id, item_id: l.item_id, cantidad: l.cantidad, descripcion: l.descripcion, valor_uf: l.valor_uf, descuento_pct: l.descuento_pct, orden: l.orden }))
      )
      if (eLin) { setError(eLin.message); setDuplicando(null); return }
    }
    if ((ob.data ?? []).length > 0) {
      const { error: eObs } = await supabase.from("cotizacion_observaciones").insert(
        (ob.data ?? []).map(o => ({ cotizacion_id: nueva.id, observacion_id: o.observacion_id }))
      )
      if (eObs) { setError(eObs.message); setDuplicando(null); return }
    }
    router.push(`/cotizaciones/${nueva.id}`)
  }

  // El texto se envía al servidor con un pequeño retardo (no una consulta por tecla).
  useEffect(() => {
    const t = setTimeout(() => { setTextoBusqueda(texto); setPagina(1) }, 300)
    return () => clearTimeout(t)
  }, [texto])

  // Búsqueda, filtros, orden y página se resuelven en el servidor y solo se trae la página
  // que se ve (25 filas). Antes se descargaban las 1.547 cotizaciones (2 pedidos de 1.000,
  // uno tras otro) y se filtraban/ordenaban en el navegador en cada visita.
  const solicitud = useRef(0)
  useEffect(() => {
    const mia = ++solicitud.current
    setBuscando(true)
    ;(async () => {
      const supabase = createClient()
      let filtrada = supabase
        .from("cotizaciones")
        .select("id, numero, fecha, emisor, valor_uf, total, atencion, clientes_cotizacion(nombre)", { count: "exact" })
      if (emisorFiltro) filtrada = filtrada.eq("emisor", emisorFiltro)
      if (desde) filtrada = filtrada.gte("fecha", desde)
      if (hasta) filtrada = filtrada.lte("fecha", hasta)
      // Se buscan N° (exacto), atención, emisor y nombre de cliente. Los caracteres que
      // rompen la sintaxis del filtro se reemplazan por espacio.
      const t = textoBusqueda.trim().replace(/[,()%*\\"]/g, " ").trim()
      if (t) {
        const { data: cli } = await supabase.from("clientes_cotizacion").select("id").ilike("nombre", `%${t}%`).limit(300)
        const ids = (cli ?? []).map(c => c.id as string)
        const partes = [`atencion.ilike.%${t}%`, `emisor.ilike.%${t}%`]
        if (/^\d+$/.test(t)) partes.push(`numero.eq.${t}`)
        if (ids.length) partes.push(`cliente_id.in.(${ids.join(",")})`)
        filtrada = filtrada.or(partes.join(","))
      }
      let ordenada = filtrada.order(orden.campo === "cliente" ? "clientes_cotizacion(nombre)" : orden.campo, { ascending: orden.dir === "asc" })
      if (orden.campo !== "numero") ordenada = ordenada.order("numero", { ascending: false })
      const { data, error, count } = await ordenada.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
      if (mia !== solicitud.current) return   // ya se pidió algo más nuevo: esta respuesta se descarta
      if (error) {
        setError(error.message)
      } else {
        setError(null)
        setFilas((data ?? []) as unknown as FilaCotizacion[])
        setTotal(count ?? 0)
      }
      setLoading(false)
      setBuscando(false)
    })()
  }, [textoBusqueda, emisorFiltro, desde, hasta, orden, pagina])

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)

  function ordenarPor(campo: Campo) {
    setOrden(o => (o.campo === campo ? { campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }))
    setPagina(1)
  }

  function Cabecera({ campo, children, className = "" }: { campo: Campo; children: React.ReactNode; className?: string }) {
    const activo = orden.campo === campo
    const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <th className={`px-3 py-2 font-medium ${className}`}>
        <button type="button" onClick={() => ordenarPor(campo)} className="inline-flex items-center gap-1 hover:underline">
          {children}
          <Icono className={`h-3 w-3 ${activo ? "opacity-100" : "opacity-40"}`} />
        </button>
      </th>
    )
  }

  const hayFiltros = texto || emisorFiltro || desde || hasta

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Cotizaciones" subtitle="Cotizaciones emitidas desde el sistema">
        <Button onClick={() => router.push("/cotizaciones/nueva")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva cotización
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por N°, cliente, atención…"
              className="h-9 pl-8" />
          </div>
          <select value={emisorFiltro} onChange={e => { setEmisorFiltro(e.target.value); setPagina(1) }}
            className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los emisores</option>
            {EMISORES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <Input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPagina(1) }} className="h-9 w-40" />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Hasta</span>
            <Input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPagina(1) }} className="h-9 w-40" />
          </div>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={() => { setTexto(""); setTextoBusqueda(""); setEmisorFiltro(""); setDesde(""); setHasta(""); setPagina(1) }}>
              Limpiar filtros
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {buscando && !loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {total.toLocaleString("es-CL")} {hayFiltros ? "coincidencias" : "cotizaciones"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las cotizaciones: {error}</p>
        ) : total === 0 && !hayFiltros && !buscando ? (
          <p className="text-sm text-muted-foreground">Aún no hay cotizaciones. Crea la primera con "Nueva cotización".</p>
        ) : filas.length === 0 && !buscando ? (
          <p className="text-sm text-muted-foreground">Ninguna cotización coincide con los filtros.</p>
        ) : (
          <div className={`rounded-lg border overflow-x-auto transition-opacity ${buscando ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white text-left">
                <tr>
                  <Cabecera campo="numero">N°</Cabecera>
                  <Cabecera campo="fecha">Fecha</Cabecera>
                  <Cabecera campo="emisor">Emisor</Cabecera>
                  <Cabecera campo="cliente">Cliente</Cabecera>
                  <Cabecera campo="atencion">Atención</Cabecera>
                  <Cabecera campo="valor_uf" className="text-right">Valor UF</Cabecera>
                  <Cabecera campo="total" className="text-right">Total ($)</Cabecera>
                  <th className="px-3 py-2 w-36"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.id}
                    onClick={() => router.push(`/cotizaciones/${f.id}`)}
                    className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{f.numero}</td>
                    <td className="px-3 py-2">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{f.emisor}</td>
                    <td className="px-3 py-2">{f.clientes_cotizacion?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{f.atencion ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtCL(f.valor_uf, 2)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtCL(f.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" disabled={duplicando !== null}
                        onClick={e => { e.stopPropagation(); duplicar(f.id) }}
                        className="mr-3 inline-flex items-center gap-1 text-xs text-[#1a3a5c] hover:underline disabled:opacity-50">
                        {duplicando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        Duplicar
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); setErrorEliminar(null); setAEliminar(f) }}
                        className="text-muted-foreground hover:text-destructive align-middle" aria-label={`Eliminar cotización ${f.numero}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > POR_PAGINA && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, total)} de {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={paginaActual <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <span className="text-muted-foreground">Página {paginaActual} de {totalPaginas}</span>
              <Button variant="outline" size="sm" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
        {error && !loading && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <AlertDialog open={!!aEliminar} onOpenChange={o => { if (!o && !eliminando) { setAEliminar(null); setErrorEliminar(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cotización</AlertDialogTitle>
            <AlertDialogDescription>
              {errorEliminar ?? `¿Eliminar la cotización N° ${aEliminar?.numero ?? ""} de ${aEliminar?.clientes_cotizacion?.nombre ?? "este cliente"}? Se borran también sus líneas y observaciones. No se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            {!errorEliminar && <AlertDialogAction disabled={eliminando} onClick={e => { e.preventDefault(); confirmarEliminar() }}>{eliminando ? "Eliminando…" : "Eliminar"}</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
