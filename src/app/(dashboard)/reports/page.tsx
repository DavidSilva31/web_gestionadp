"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Search, FileText, Clock, CheckCircle2, Filter, Loader2, RefreshCw, Download, Sheet, Truck, X, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Report, ReportEstado } from "@/types/database"
import { downloadReportPDF } from "@/lib/download-report-pdf"
import { exportReportsToExcel } from "@/lib/export-reports-excel"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import { syncPesoTon } from "@/lib/inventario"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"
import { EstadoSemaforo } from "@/components/reports/report-estado-semaforo"

type Tab = "todos" | ReportEstado

interface ReportRow {
  id:          string
  numero:      number
  estado:      ReportEstado
  cliente:     string
  fecha:       string
  patente:     string
  conductor:   string
  sec1_activa: boolean
  sec2_activa: boolean
  sec3_activa: boolean
  sec3_tipo:               string | null
  sec3_numero_pallets:     number | null
  sec3_inventario_item_id: string | null
  sec3_producto:           string | null
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "todos",                  label: "Todos",             icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "borrador",               label: "Ingresados",        icon: <Filter className="h-3.5 w-3.5" /> },
  { key: "pendiente_operaciones",  label: "Pend. operaciones", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "pendiente_despacho",     label: "Pend. despacho",    icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "despachado",             label: "Despachados",       icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
]

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:              { label: "Ingresado",         className: "badge-neutral" },
  pendiente_operaciones: { label: "Pend. operaciones", className: "badge-info" },
  pendiente_despacho:    { label: "Pend. despacho",    className: "badge-warning" },
  despachado:            { label: "Despachado",        className: "badge-success" },
}

function seccionesTag(r: ReportRow) {
  const tags = []
  if (r.sec1_activa) tags.push("Dep. Contenedores")
  if (r.sec2_activa) tags.push("Consolidado/Otros")
  if (r.sec3_activa) tags.push("Bodegaje")
  return tags
}

export default function ReportsPage() {
  const { user, profile } = useAuth()
  const router = useRouter()
  const [reports,     setReports]     = useState<ReportRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<Tab>("todos")
  const [search,      setSearch]      = useState("")
  const [pdfLoading,   setPdfLoading]   = useState<string | null>(null)
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [xlsxLoading,  setXlsxLoading]  = useState(false)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [actionError,  setActionError]  = useState<string | null>(null)

  // Estado del modal de despacho
  const [dispatchFor,    setDispatchFor]    = useState<ReportRow | null>(null)
  const [dispatchNombre, setDispatchNombre] = useState("")
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchError,  setDispatchError]  = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from("reports")
      .select("id, numero, estado, cliente, fecha, patente, conductor, sec1_activa, sec2_activa, sec3_activa, sec3_tipo, sec3_numero_pallets, sec3_inventario_item_id, sec3_producto")
      .order("numero", { ascending: false })
      .limit(500)

    if (err) { setFetchError(err.message); setLoading(false); return }
    if (data) setReports(data as ReportRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  function closeDispatchModal() {
    setDispatchFor(null)
    setDispatchNombre("")
    setDispatchError(null)
  }

  async function handleDownloadPDF(id: string) {
    setPdfLoading(id)
    setActionError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
      if (error) throw error
      if (data) await downloadReportPDF(data as Report)
    } catch (err) {
      console.error("[reports] error descargando PDF:", err)
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
      console.error("[reports] error generando vista previa:", err)
      setActionError("No se pudo generar la vista previa. Intenta de nuevo.")
    } finally {
      setPdfLoading(null)
    }
  }

  async function handleExportExcel() {
    if (filtered.length === 0) return
    setXlsxLoading(true)
    setActionError(null)
    try {
      const supabase = createClient()
      const ids = filtered.map(r => r.id)
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .in("id", ids)
        .order("numero", { ascending: true })
      if (error) throw error
      if (data && data.length > 0) await exportReportsToExcel(data as Report[])
    } catch (err) {
      console.error("[reports] error exportando Excel:", err)
      setActionError("No se pudo exportar a Excel. Intenta de nuevo.")
    } finally {
      setXlsxLoading(false)
    }
  }

  async function handleDispatch() {
    if (!dispatchFor || !dispatchNombre.trim()) return
    setDispatchError(null)
    setDispatchLoading(true)

    try {
      const supabase = createClient()
      const now = new Date().toISOString()
      const { error: updateErr } = await supabase
        .from("reports")
        .update({
          estado:                "despachado",
          nombre_despachador:    dispatchNombre,
          fecha_despacho:        now,
          dispatched_by:         user?.id ?? null,
        })
        .eq("id", dispatchFor.id)

      if (updateErr) {
        setDispatchError("Error al despachar: " + updateErr.message)
        return
      }

      await logAudit({
        tabla:          "reports",
        registro_id:    dispatchFor.id,
        accion:         "report.despachar",
        descripcion:    `Vehículo despachado — ${dispatchFor.cliente} (${dispatchFor.patente})`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? dispatchNombre,
      })
      // El stock recién se mueve acá (trigger reports_sync_inventario en la
      // transición a 'despachado') — el log de auditoría de stock va en el
      // mismo momento, no al crear/editar el report.
      if (dispatchFor.sec3_activa && dispatchFor.sec3_inventario_item_id && dispatchFor.sec3_tipo) {
        const delta     = Number(dispatchFor.sec3_numero_pallets) || 0
        const invAccion = dispatchFor.sec3_tipo === "ingreso" ? "inventario.ingreso" : "inventario.despacho"
        const invDesc   = `Stock ${dispatchFor.sec3_tipo === "ingreso" ? "+" : "-"}${delta} · ${dispatchFor.sec3_producto ?? ""}`
        await logAudit({
          tabla:          "inventario_items",
          registro_id:    dispatchFor.sec3_inventario_item_id,
          accion:         invAccion,
          descripcion:    `${invDesc} via Report #${dispatchFor.numero}`,
          usuario_id:     user?.id,
          usuario_nombre: profile?.nombre ?? dispatchNombre,
        })
        await syncPesoTon(supabase, dispatchFor.sec3_inventario_item_id)
      }

      closeDispatchModal()
      fetchReports()
    } catch (err) {
      console.error("[reports] error inesperado en despacho:", err)
      setDispatchError("Error inesperado al despachar. Intenta de nuevo.")
    } finally {
      setDispatchLoading(false)
    }
  }

  const filtered = useMemo(() => reports.filter(r => {
    if (activeTab !== "todos" && r.estado !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return r.patente.toLowerCase().includes(q) ||
             r.cliente.toLowerCase().includes(q) ||
             r.conductor.toLowerCase().includes(q) ||
             String(r.numero).includes(q)
    }
    return true
  }), [reports, activeTab, search])

  const counts = useMemo(() => ({
    todos:                 reports.length,
    pendiente_operaciones: reports.filter(r => r.estado === "pendiente_operaciones").length,
    pendiente_despacho:    reports.filter(r => r.estado === "pendiente_despacho").length,
    despachado:            reports.filter(r => r.estado === "despachado").length,
    borrador:              reports.filter(r => r.estado === "borrador").length,
  }), [reports])

  return (
    <>
    {/* Modal vista previa PDF */}
    {previewReport && (
      <ReportPreviewModal
        report={previewReport}
        onClose={() => setPreviewReport(null)}
        onDownload={() => downloadReportPDF(previewReport)}
      />
    )}

    {/* Modal despacho */}
    {dispatchFor && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Despachar Report #{dispatchFor.numero}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{dispatchFor.cliente} · {dispatchFor.patente}</p>
            </div>
            <button onClick={closeDispatchModal} className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Nombre despachador */}
          <div>
            <label className="block text-xs font-medium text-foreground/80 mb-1.5">
              Nombre del despachador <span className="text-red-500">*</span>
            </label>
            <Input
              value={dispatchNombre}
              onChange={e => setDispatchNombre(e.target.value)}
              placeholder="Tu nombre completo"
              className="h-8 text-xs"
            />
          </div>

          {dispatchError && <p className="text-xs text-red-500">{dispatchError}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={closeDispatchModal} disabled={dispatchLoading}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1 h-9 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
              onClick={handleDispatch}
              disabled={!dispatchNombre.trim() || dispatchLoading}
            >
              {dispatchLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Procesando...</>
                : <><CheckCircle2 className="h-3.5 w-3.5" />Confirmar despacho</>
              }
            </Button>
          </div>
        </div>
      </div>
    )}

    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Reports de Servicio" subtitle="Gestión de reportes de almacenamiento y despacho">
        <Button variant="ghost" size="sm" onClick={fetchReports} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={xlsxLoading || filtered.length === 0}
          className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20">
          {xlsxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
          Exportar Excel
        </Button>
        <Link href="/reports/nuevo">
          <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/85 text-primary-foreground">
            <Plus className="h-3.5 w-3.5" />
            Nuevo report
          </Button>
        </Link>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 px-4 sm:px-6 pt-4 pb-3 flex-shrink-0">
        {[
          { icon: <FileText className="h-4 w-4 text-primary" />, bg: "bg-primary/10", count: counts.todos,              label: "Total"          },
          { icon: <Clock className="h-4 w-4 text-amber-600" />,                 bg: "bg-amber-50 dark:bg-amber-900/20", count: counts.pendiente_despacho, label: "Pendientes" },
          { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,        bg: "bg-emerald-50 dark:bg-emerald-900/20", count: counts.despachado,  label: "Despachados"    },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-lg border p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3">
            <div className={cn("h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center flex-shrink-0", s.bg)}>{s.icon}</div>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-foreground leading-none">{loading ? "—" : s.count}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-3 flex-shrink-0">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5 flex-shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                activeTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={cn(
                "ml-0.5 px-1.5 rounded-full text-[10px] font-semibold",
                activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
              )}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar patente, cliente, N°..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-full" />
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
              <table className="w-full text-sm table-fixed min-w-[720px]">
                <colgroup>
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "9%" }}  />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead className="sticky top-0 bg-muted/60 border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs whitespace-nowrap">Report</th>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Cliente</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Patente</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Conductor</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Secciones</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Fecha</th>
                    <th className="text-center px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/reports/${r.id}`)}
                      className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer", i % 2 !== 0 && "bg-muted/10")}
                    >
                      <td className="px-4 py-4 font-mono font-semibold text-primary">#{r.numero}</td>
                      <td className="px-4 py-4 font-medium text-foreground overflow-hidden">
                        <span className="block truncate">{r.cliente}</span>
                      </td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        {r.patente
                          ? <span className="inline-block max-w-full font-mono bg-muted px-2 py-0.5 rounded text-foreground truncate align-middle">{r.patente}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground overflow-hidden">
                        <span className="block truncate">{r.conductor}</span>
                      </td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        <div className="flex gap-1 flex-wrap justify-center">
                          {seccionesTag(r).map(t => (
                            <span key={t} className="bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)] px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground text-xs whitespace-nowrap overflow-hidden">{r.fecha}</td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        <div className="inline-flex items-center gap-1.5">
                          <EstadoSemaforo estado={r.estado} />
                          <Badge className={cn("text-xs font-semibold border-0", ESTADO_STYLE[r.estado].className)}>
                            {ESTADO_STYLE[r.estado].label}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-0.5">
                          {r.estado === "pendiente_despacho" && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                              title="Despachar"
                              onClick={e => {
                                e.stopPropagation()
                                setDispatchFor(r)
                                setDispatchNombre("")
                                setDispatchError(null)
                              }}
                            >
                              <Truck className="h-4 w-4" />
                            </Button>
                          )}
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
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        No se encontraron reports
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
