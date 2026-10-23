"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Search, FileCheck2, FileWarning, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { TIPOS_EQUIPO, ESTADOS_EQUIPO, estadoEquipoClase } from "@/lib/equipos"

type Asignacion = { encargado_nombre: string; encargado_cargo: string | null; fecha_entrega: string; fecha_devolucion: string | null; acta_path: string | null }
type Fila = {
  id: string
  tipo: string
  marca: string
  modelo: string
  numero_serie: string | null
  estado: string
  equipo_asignaciones: Asignacion[]
}

const PESTANAS = [
  { valor: "", etiqueta: "Todos" },
  { valor: TIPOS_EQUIPO[0], etiqueta: "Notebooks y PCs" },
  { valor: TIPOS_EQUIPO[1], etiqueta: "Tablets" },
]

const vigente = (f: Fila) => f.equipo_asignaciones.find(a => a.fecha_devolucion === null) ?? null
const sinActa = (f: Fila) => { const a = vigente(f); return !!a && !a.acta_path }

export default function EquiposPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [tipo, setTipo] = useState("")
  const [estado, setEstado] = useState("")
  const [soloSinActa, setSoloSinActa] = useState(false)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    (async () => {
      const { data, error } = await createClient().from("equipos")
        .select("id, tipo, marca, modelo, numero_serie, estado, equipo_asignaciones(encargado_nombre, encargado_cargo, fecha_entrega, fecha_devolucion, acta_path)")
        .order("created_at", { ascending: false })
      if (error) setError(error.message)
      else setFilas((data ?? []) as unknown as Fila[])
      setLoading(false)
    })()
  }, [])

  // El resumen sigue a la pestaña elegida (todos, solo notebooks o solo tablets).
  const delTipo = useMemo(() => filas.filter(f => !tipo || f.tipo === tipo), [filas, tipo])
  const resumen = useMemo(() => ({
    total: delTipo.length,
    asignados: delTipo.filter(f => f.estado === "Asignado").length,
    disponibles: delTipo.filter(f => f.estado === "Disponible").length,
    reparacion: delTipo.filter(f => f.estado === "En reparación").length,
    sinActa: delTipo.filter(sinActa).length,
  }), [delTipo])

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return delTipo.filter(f =>
      (!estado || f.estado === estado) &&
      (!soloSinActa || sinActa(f)) &&
      (!t || [f.marca, f.modelo, f.numero_serie, vigente(f)?.encargado_nombre].some(v => v?.toLowerCase().includes(t))))
  }, [delTipo, texto, estado, soloSinActa])

  async function exportar() {
    setExportando(true)
    setError(null)
    try {
      const res = await fetch("/api/equipos/export")
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setError(json?.error ?? "No se pudo generar el archivo Excel.")
        return
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = `Equipos_ADP_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExportando(false)
    }
  }

  const tarjetas = [
    { etiqueta: "Equipos", valor: resumen.total, clase: "" },
    { etiqueta: "Asignados", valor: resumen.asignados, clase: "text-sky-700 dark:text-sky-400" },
    { etiqueta: "Disponibles", valor: resumen.disponibles, clase: "text-emerald-700 dark:text-emerald-400" },
    { etiqueta: "En reparación", valor: resumen.reparacion, clase: "text-amber-700 dark:text-amber-400" },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Equipos" subtitle="Notebooks, PCs y tablets entregados al personal">
        <Button variant="outline" onClick={exportar} disabled={exportando || loading} className="gap-1.5">
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Excel
        </Button>
        <Button onClick={() => router.push("/equipos/nuevo")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo equipo
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex gap-1 border-b">
          {PESTANAS.map(p => {
            const activa = tipo === p.valor
            const cantidad = filas.filter(f => !p.valor || f.tipo === p.valor).length
            return (
              <button key={p.etiqueta} type="button" onClick={() => setTipo(p.valor)}
                className={cn("px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
                  activa ? "border-[#1a3a5c] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {p.etiqueta} <span className="ml-1 text-xs text-muted-foreground">{cantidad}</span>
              </button>
            )
          })}
        </div>

        {!loading && !error && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {tarjetas.map(t => (
              <div key={t.etiqueta} className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{t.etiqueta}</p>
                <p className={cn("text-2xl font-semibold tabular-nums", t.clase)}>{t.valor}</p>
              </div>
            ))}
            <button type="button" onClick={() => setSoloSinActa(v => !v)} aria-pressed={soloSinActa}
              className={cn("rounded-lg border px-4 py-3 text-left transition-colors",
                resumen.sinActa > 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : "bg-card",
                soloSinActa && "ring-2 ring-amber-400")}>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {resumen.sinActa > 0 && <FileWarning className="h-3.5 w-3.5 text-amber-600" />} Sin acta firmada
              </p>
              <p className={cn("text-2xl font-semibold tabular-nums", resumen.sinActa > 0 && "text-amber-700 dark:text-amber-400")}>{resumen.sinActa}</p>
              <p className="text-[11px] text-muted-foreground">{soloSinActa ? "Mostrando solo estos" : resumen.sinActa > 0 ? "Clic para filtrar" : "Todo al día"}</p>
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por equipo, serie o encargado…" className="h-9 pl-8" />
          </div>
          <select value={estado} onChange={e => setEstado(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los estados</option>
            {ESTADOS_EQUIPO.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          {(texto || estado || soloSinActa) && (
            <Button variant="ghost" size="sm" onClick={() => { setTexto(""); setEstado(""); setSoloSinActa(false) }}>Limpiar filtros</Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay equipos. Registra el primero con &quot;Nuevo equipo&quot;.</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún equipo coincide con los filtros.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white text-left">
                <tr>
                  {!tipo && <th className="px-3 py-2 font-medium">Tipo</th>}
                  <th className="px-3 py-2 font-medium">Equipo</th>
                  <th className="px-3 py-2 font-medium">N° serie</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Encargado</th>
                  <th className="px-3 py-2 font-medium">Entregado</th>
                  <th className="px-3 py-2 font-medium">Acta</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => {
                  const a = vigente(f)
                  return (
                    <tr key={f.id} onClick={() => router.push(`/equipos/${f.id}`)}
                      className={cn("cursor-pointer hover:bg-muted/50", i % 2 === 1 && "bg-muted/20")}>
                      {!tipo && <td className="px-3 py-2">{f.tipo}</td>}
                      <td className="px-3 py-2 font-medium">{f.marca} {f.modelo}</td>
                      <td className="px-3 py-2 tabular-nums">{f.numero_serie || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estadoEquipoClase(f.estado)}`}>{f.estado}</span>
                      </td>
                      <td className="px-3 py-2">
                        {a ? <>{a.encargado_nombre}{a.encargado_cargo && <span className="text-muted-foreground"> · {a.encargado_cargo}</span>}</> : "—"}
                      </td>
                      <td className="px-3 py-2">{a ? new Date(a.fecha_entrega + "T00:00:00").toLocaleDateString("es-CL") : "—"}</td>
                      <td className="px-3 py-2">
                        {a ? (a.acta_path
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><FileCheck2 className="h-4 w-4" /> Cargada</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"><FileWarning className="h-3.5 w-3.5" /> Falta</span>) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
