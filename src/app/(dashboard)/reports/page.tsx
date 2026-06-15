"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Search, FileText, Clock, CheckCircle2, Filter, Loader2, RefreshCw, Download, Sheet } from "lucide-react"
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
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "todos",               label: "Todos",          icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "pendiente_despacho",  label: "Pend. despacho", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "despachado",          label: "Despachados",    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  { key: "borrador",            label: "Borradores",     icon: <Filter className="h-3.5 w-3.5" /> },
]

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:           { label: "Borrador",       className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pendiente_despacho: { label: "Pend. despacho", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  despachado:         { label: "Despachado",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
}

function seccionesTag(r: ReportRow) {
  const tags = []
  if (r.sec1_activa) tags.push("Dep. Contenedores")
  if (r.sec2_activa) tags.push("Consolidado/Otros")
  if (r.sec3_activa) tags.push("Bodegaje")
  return tags
}

export default function ReportsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [reports,     setReports]     = useState<ReportRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<Tab>("todos")
  const [search,      setSearch]      = useState("")
  const [pdfLoading,  setPdfLoading]  = useState<string | null>(null)
  const [xlsxLoading, setXlsxLoading] = useState(false)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("reports")
      .select("id, numero, estado, cliente, fecha, patente, conductor, sec1_activa, sec2_activa, sec3_activa")
      .order("numero", { ascending: false })

    if (!error && data) setReports(data as ReportRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  async function handleDownloadPDF(id: string) {
    setPdfLoading(id)
    const supabase = createClient()
    const { data } = await supabase.from("reports").select("*").eq("id", id).single()
    if (data) await downloadReportPDF(data as Report)
    setPdfLoading(null)
  }

  async function handleExportExcel() {
    setXlsxLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("reports")
      .select("*")
      .order("numero", { ascending: true })
    if (data && data.length > 0) exportReportsToExcel(data as Report[])
    setXlsxLoading(false)
  }

  const filtered = reports.filter(r => {
    if (activeTab !== "todos" && r.estado !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return r.patente.toLowerCase().includes(q) ||
             r.cliente.toLowerCase().includes(q) ||
             r.conductor.toLowerCase().includes(q) ||
             String(r.numero).includes(q)
    }
    return true
  })

  const counts = {
    todos:              reports.length,
    pendiente_despacho: reports.filter(r => r.estado === "pendiente_despacho").length,
    despachado:         reports.filter(r => r.estado === "despachado").length,
    borrador:           reports.filter(r => r.estado === "borrador").length,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Reports de Servicio" subtitle="Gestión de reportes de almacenamiento y despacho">
        <Button variant="ghost" size="sm" onClick={fetchReports} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={xlsxLoading || reports.length === 0}
          className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-900/20">
          {xlsxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
          Exportar Excel
        </Button>
        <Link href="/reports/nuevo">
          <Button size="sm" className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
            <Plus className="h-3.5 w-3.5" />
            Nuevo report
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      <div className="flex gap-3 px-6 pt-4 pb-3 flex-shrink-0">
        {[
          { icon: <FileText className="h-4 w-4 text-[oklch(0.35_0.12_240)]" />, bg: "bg-[oklch(0.35_0.12_240)]/10", count: counts.todos,              label: "Total reports"   },
          { icon: <Clock className="h-4 w-4 text-amber-600" />,                 bg: "bg-amber-50",                   count: counts.pendiente_despacho, label: "Pend. despacho" },
          { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,        bg: "bg-emerald-50",                 count: counts.despachado,         label: "Despachados"    },
        ].map(s => (
          <div key={s.label} className="flex-1 bg-card rounded-lg border p-3 flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", s.bg)}>{s.icon}</div>
            <div>
              <p className="text-lg font-bold text-foreground leading-none">{loading ? "—" : s.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 pb-3 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5 flex-shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                activeTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon}
              {tab.label}
              <span className={cn(
                "ml-0.5 px-1.5 rounded-full text-[10px] font-semibold",
                activeTab === tab.key ? "bg-[oklch(0.35_0.12_240)] text-white" : "bg-muted-foreground/20 text-muted-foreground"
              )}>
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar por patente, cliente, conductor o N°..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm table-fixed min-w-[680px]">
                <colgroup>
                  <col style={{ width: "5%" }}  />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "9%" }}  />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "4%" }}  />
                </colgroup>
                <thead className="sticky top-0 bg-muted/60 border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Report</th>
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
                      <td className="px-4 py-4 font-mono font-semibold text-[oklch(0.35_0.12_240)]">#{r.numero}</td>
                      <td className="px-4 py-4 font-medium text-foreground overflow-hidden">
                        <span className="block truncate">{r.cliente}</span>
                      </td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        <span className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">{r.patente}</span>
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground overflow-hidden">
                        <span className="block truncate">{r.conductor}</span>
                      </td>
                      <td className="px-4 py-4 text-center overflow-hidden">
                        <div className="flex gap-1 flex-wrap justify-center">
                          {seccionesTag(r).map(t => (
                            <span key={t} className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground">{r.fecha}</td>
                      <td className="px-4 py-4 text-center">
                        <Badge className={cn("text-xs font-semibold border-0", ESTADO_STYLE[r.estado].className)}>
                          {ESTADO_STYLE[r.estado].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end">
                          <Button
                            variant="ghost" size="icon"
                            className="h-11 w-11 text-muted-foreground hover:text-foreground"
                            disabled={pdfLoading === r.id}
                            onClick={e => { e.stopPropagation(); handleDownloadPDF(r.id) }}
                          >
                            {pdfLoading === r.id
                              ? <Loader2 className="h-10 w-10 animate-spin" />
                              : <Download className="h-10 w-10" />
                            }
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
  )
}
