"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Wrench, Search, Loader2, RefreshCw, Download, Eye, ChevronDown, ChevronUp, AlertCircle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Report, ReportEstado, ServicioCliente } from "@/types/database"
import { downloadReportPDF } from "@/lib/download-report-pdf"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"

function fmtTarifa(s: ServicioCliente) {
  if (s.moneda === "CLP") return s.tarifa_clp != null ? `$${s.tarifa_clp.toLocaleString("es-CL")} / ${s.unidad}` : "sin tarifa"
  return s.tarifa_uf != null ? `${s.tarifa_uf.toFixed(4)} UF / ${s.unidad}` : "sin tarifa"
}

// Catálogo del cliente para que quien revisa el texto libre de Observaciones
// (lo que el operador tipeó a mano) pueda buscar, marcar uno o más servicios
// del catálogo que correspondan (un mismo texto puede juntar varios
// servicios distintos) y guardarlos en el report (servicios_ids) — el mismo
// campo que ya usa la sección "Servicios asociados" al crear el report.
// reports.cliente es texto libre — mismo lookup por nombre que usa el resto
// del módulo de reports para resolver el cliente real.
function CatalogoCliente({ reportId, clienteNombre, initialSelectedIds, onSaved }: {
  reportId: string
  clienteNombre: string
  initialSelectedIds: string[]
  onSaved: (ids: string[]) => void
}) {
  const [servicios, setServicios] = useState<ServicioCliente[] | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [q,         setQ]         = useState("")
  const [selected,  setSelected]  = useState<string[]>(initialSelectedIds)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  useEffect(() => {
    // clienteNombre no cambia mientras este componente está montado — se
    // crea de nuevo por cada fila que se expande — así que los estados
    // iniciales de arriba ya cubren el primer render, sin setState síncrono acá.
    let cancelled = false
    const supabase = createClient()
    supabase.from("clientes").select("id").eq("nombre", clienteNombre).maybeSingle()
      .then(({ data: cliente, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        if (!cliente) { setServicios([]); setLoading(false); return }
        supabase.from("servicios_cliente").select("*")
          // Los de categoría "transporte" se buscan desde el módulo
          // Transporte Incomex, no acá.
          .eq("cliente_id", cliente.id).eq("activo", true).eq("categoria", "otro")
          .order("orden").order("nombre")
          .then(({ data, error: err2 }) => {
            if (cancelled) return
            if (err2) { setError(err2.message); setLoading(false); return }
            setServicios((data ?? []) as ServicioCliente[])
            setLoading(false)
          })
      })
    return () => { cancelled = true }
  }, [clienteNombre])

  const filtered = useMemo(() => {
    if (!servicios) return []
    const term = q.trim().toLowerCase()
    if (!term) return servicios
    return servicios.filter(s => s.nombre.toLowerCase().includes(term) || (s.descripcion?.toLowerCase().includes(term) ?? false))
  }, [servicios, q])

  function toggle(id: string) {
    setSaved(false)
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleGuardar() {
    setSaving(true)
    setSaveError(null)
    const { error: err } = await createClient().from("reports").update({ servicios_ids: selected }).eq("id", reportId)
    setSaving(false)
    if (err) { setSaveError(err.message); return }
    setSaved(true)
    onSaved(selected)
  }

  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...initialSelectedIds].sort())

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" /> Catálogo de {clienteNombre}
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando catálogo...
        </div>
      ) : error ? (
        <p className="text-[11px] text-destructive flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> No se pudo cargar el catálogo: {error}</p>
      ) : servicios && servicios.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Este cliente no tiene servicios en catálogo todavía — agrégalos en el módulo Servicios.</p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder="Buscar servicio en el catálogo..."
              className="h-7 pl-7 text-[11px]"
            />
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-border/30">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">Ningún servicio del catálogo coincide con la búsqueda.</p>
            ) : filtered.map(s => (
              <label key={s.id} className="flex items-center gap-2 py-1.5 cursor-pointer">
                <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-[11px] text-foreground/90 truncate flex-1">{s.nombre}</span>
                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{fmtTarifa(s)}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[10px] text-muted-foreground">
              {selected.length} servicio{selected.length !== 1 ? "s" : ""} marcado{selected.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              {saveError && <span className="text-[10px] text-destructive">{saveError}</span>}
              {saved && !dirty && <span className="text-[10px] text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> Guardado</span>}
              <Button size="sm" onClick={handleGuardar} disabled={saving || !dirty} className="h-6 text-[10px] px-2 gap-1">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Guardar selección
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface ReportRow {
  id:      string
  numero:  number
  estado:  ReportEstado
  cliente: string
  fecha:   string
  patente: string
  conductor: string
  sec2_observaciones: string | null
  sec3_observaciones: string | null
  servicios_ids: string[]
}

// El report se marca con el check "Servicio Adicional" de Sección 3
// (sec3_servicio_adicional) — este helper solo junta las Observaciones de
// Sección 2 y/o 3 para mostrar una descripción del servicio en la tabla.
function servicioTexto(r: ReportRow) {
  return [r.sec2_observaciones, r.sec3_observaciones].filter(t => t?.trim()).join(" · ")
}

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:              { label: "Ingresado",         className: "badge-neutral" },
  pendiente_operaciones: { label: "Pend. operaciones", className: "badge-info" },
  pendiente_despacho:    { label: "Pend. despacho",    className: "badge-warning" },
  despachado:            { label: "Despachado",        className: "badge-success" },
}

export default function ServiciosAdicionalesPage() {
  const router = useRouter()
  const [reports,      setReports]      = useState<ReportRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState("")
  const [pdfLoading,   setPdfLoading]   = useState<string | null>(null)
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [actionError,  setActionError]  = useState<string | null>(null)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from("reports")
      .select("id, numero, estado, cliente, fecha, patente, conductor, sec2_observaciones, sec3_observaciones, servicios_ids")
      .eq("sec3_servicio_adicional", true)
      // Recién debe verse acá cuando el vehículo ya salió — antes de
      // despachar, el operador todavía puede seguir editando Observaciones.
      .eq("estado", "despachado")
      .order("numero", { ascending: false })

    if (err) { setFetchError(err.message); setLoading(false); return }
    setReports((data as ReportRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  async function handleDownloadPDF(id: string) {
    setPdfLoading(id)
    setActionError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
      if (error) throw error
      if (data) await downloadReportPDF(data as Report)
    } catch (err) {
      console.error("[servicios-adicionales] error descargando PDF:", err)
      setActionError("No se pudo descargar el PDF. Intenta de nuevo.")
    } finally {
      setPdfLoading(null)
    }
  }

  async function handlePreviewPDF(id: string) {
    setPdfLoading(id)
    setActionError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
      if (error) throw error
      if (data) setPreviewReport(data as Report)
    } catch (err) {
      console.error("[servicios-adicionales] error generando vista previa:", err)
      setActionError("No se pudo generar la vista previa. Intenta de nuevo.")
    } finally {
      setPdfLoading(null)
    }
  }

  const filtered = useMemo(() => reports.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      return r.patente.toLowerCase().includes(q) ||
             r.cliente.toLowerCase().includes(q) ||
             r.conductor.toLowerCase().includes(q) ||
             servicioTexto(r).toLowerCase().includes(q) ||
             String(r.numero).includes(q)
    }
    return true
  }), [reports, search])

  return (
    <>
    {previewReport && (
      <ReportPreviewModal
        report={previewReport}
        onClose={() => setPreviewReport(null)}
        onDownload={() => downloadReportPDF(previewReport)}
      />
    )}

    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Servicios Adicionales" subtitle="Reports con servicios adicionales registrados">
        <Button variant="ghost" size="sm" onClick={fetchReports} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </PageHeader>

      {fetchError && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          Error al cargar reports: {fetchError}
        </div>
      )}

      {actionError && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          {actionError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pt-4 pb-3 flex-shrink-0">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar patente, cliente, servicio, N°..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-full" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm table-fixed min-w-[760px]">
                <colgroup>
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "8%" }}  />
                  <col style={{ width: "31%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "8%" }}  />
                </colgroup>
                <thead className="sticky top-0 bg-muted/60 border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs whitespace-nowrap">Report</th>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Cliente</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Patente</th>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Servicio</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Fecha</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <React.Fragment key={r.id}>
                    <tr
                      onClick={() => router.push(`/reports/${r.id}`)}
                      className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer", i % 2 !== 0 && "bg-muted/10", expandedId === r.id && "border-b-0")}
                    >
                      <td className="px-4 py-4 font-mono font-semibold text-primary">#{r.numero}</td>
                      <td className="px-4 py-4 font-medium text-foreground overflow-hidden">
                        <span className="block truncate">{r.cliente}</span>
                      </td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">{r.patente}</span>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground overflow-hidden">
                        <span className="block truncate" title={servicioTexto(r)}>{servicioTexto(r)}</span>
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground">{r.fecha}</td>
                      <td className="px-4 py-4 text-center">
                        <Badge className={cn("text-xs font-semibold border-0", ESTADO_STYLE[r.estado].className)}>
                          {ESTADO_STYLE[r.estado].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={e => { e.stopPropagation(); setExpandedId(id => id === r.id ? null : r.id) }}
                            title="Buscar en el catálogo del cliente"
                          >
                            {expandedId === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            disabled={pdfLoading === r.id}
                            onClick={e => { e.stopPropagation(); handlePreviewPDF(r.id) }}
                            title="Vista previa"
                          >
                            {pdfLoading === r.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Eye className="h-4 w-4" />
                            }
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            disabled={pdfLoading === r.id}
                            onClick={e => { e.stopPropagation(); handleDownloadPDF(r.id) }}
                            title="Descargar PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr className={cn("border-b last:border-0", i % 2 !== 0 && "bg-muted/10")}>
                        <td colSpan={7} className="px-4 pb-3" onClick={e => e.stopPropagation()}>
                          <CatalogoCliente
                            reportId={r.id}
                            clienteNombre={r.cliente}
                            initialSelectedIds={r.servicios_ids}
                            onSaved={ids => setReports(prev => prev.map(x => x.id === r.id ? { ...x, servicios_ids: ids } : x))}
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        Sin reports con servicios adicionales
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
