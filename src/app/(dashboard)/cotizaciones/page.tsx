"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Copy, ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react"
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

const valorCampo = (f: FilaCotizacion, campo: Campo): string | number => {
  switch (campo) {
    case "numero": return f.numero
    case "fecha": return f.fecha
    case "emisor": return f.emisor
    case "cliente": return f.clientes_cotizacion?.nombre ?? ""
    case "atencion": return f.atencion ?? ""
    case "valor_uf": return f.valor_uf
    case "total": return f.total
  }
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<FilaCotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)

  const [texto, setTexto] = useState("")
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

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const bloque = 1000
      const todas: FilaCotizacion[] = []
      for (let desde = 0; ; desde += bloque) {
        const { data, error } = await supabase
          .from("cotizaciones")
          .select("id, numero, fecha, emisor, valor_uf, total, atencion, clientes_cotizacion(nombre)")
          .order("numero", { ascending: false })
          .range(desde, desde + bloque - 1)
        if (error) { setError(error.message); break }
        todas.push(...((data ?? []) as unknown as FilaCotizacion[]))
        if (!data || data.length < bloque) break
      }
      setFilas(todas)
      setLoading(false)
    })()
  }, [])

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase()
    const filtradas = filas.filter(f => {
      if (emisorFiltro && f.emisor !== emisorFiltro) return false
      if (desde && f.fecha < desde) return false
      if (hasta && f.fecha > hasta) return false
      if (q) {
        const blanco = [String(f.numero), f.clientes_cotizacion?.nombre ?? "", f.atencion ?? "", f.emisor].join(" ").toLowerCase()
        if (!blanco.includes(q)) return false
      }
      return true
    })
    const factor = orden.dir === "asc" ? 1 : -1
    return [...filtradas].sort((a, b) => {
      const va = valorCampo(a, orden.campo)
      const vb = valorCampo(b, orden.campo)
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor
      return String(va).localeCompare(String(vb), "es", { numeric: true }) * factor
    })
  }, [filas, texto, emisorFiltro, desde, hasta, orden])

  useEffect(() => { setPagina(1) }, [texto, emisorFiltro, desde, hasta, orden])

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginaFilas = visibles.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA)

  function ordenarPor(campo: Campo) {
    setOrden(o => (o.campo === campo ? { campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }))
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
          <select value={emisorFiltro} onChange={e => setEmisorFiltro(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los emisores</option>
            {EMISORES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Hasta</span>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="h-9 w-40" />
          </div>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={() => { setTexto(""); setEmisorFiltro(""); setDesde(""); setHasta("") }}>
              Limpiar filtros
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{visibles.length} de {filas.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las cotizaciones: {error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cotizaciones. Crea la primera con "Nueva cotización".</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna cotización coincide con los filtros.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
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
                  <th className="px-3 py-2 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {paginaFilas.map((f, i) => (
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
                    <td className="px-3 py-2 text-right">
                      <button type="button" disabled={duplicando !== null}
                        onClick={e => { e.stopPropagation(); duplicar(f.id) }}
                        className="inline-flex items-center gap-1 text-xs text-[#1a3a5c] hover:underline disabled:opacity-50">
                        {duplicando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        Duplicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibles.length > POR_PAGINA && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, visibles.length)} de {visibles.length}
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
    </div>
  )
}
