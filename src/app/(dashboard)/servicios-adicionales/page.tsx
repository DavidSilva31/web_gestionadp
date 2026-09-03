"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Wrench, Search, FileText, Clock, CheckCircle2, Loader2, RefreshCw, Download, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Report, ReportEstado } from "@/types/database"
import { downloadReportPDF } from "@/lib/download-report-pdf"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"

type Tab = "todos" | ReportEstado

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
}

// El report se marca con el check "Servicio Adicional" de Sección 3
// (sec3_servicio_adicional) — este helper solo junta las Observaciones de
// Sección 2 y/o 3 para mostrar una descripción del servicio en la tabla.
function servicioTexto(r: ReportRow) {
  return [r.sec2_observaciones, r.sec3_observaciones].filter(t => t?.trim()).join(" · ")
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "todos",                 label: "Todos",             icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: "borrador",              label: "Ingresados",        icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "pendiente_operaciones", label: "Pend. operaciones", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "pendiente_despacho",    label: "Pend. despacho",    icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "despachado",            label: "Despachados",       icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
]

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
  const [activeTab,    setActiveTab]    = useState<Tab>("todos")
  const [search,       setSearch]       = useState("")
  const [pdfLoading,   setPdfLoading]   = useState<string | null>(null)
  const [previewReport, setPreviewReport] = useState<Report | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [actionError,  setActionError]  = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from("reports")
      .select("id, numero, estado, cliente, fecha, patente, conductor, sec2_observaciones, sec3_observaciones")
      .eq("sec3_servicio_adicional", true)
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
    if (activeTab !== "todos" && r.estado !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return r.patente.toLowerCase().includes(q) ||
             r.cliente.toLowerCase().includes(q) ||
             r.conductor.toLowerCase().includes(q) ||
             servicioTexto(r).toLowerCase().includes(q) ||
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
