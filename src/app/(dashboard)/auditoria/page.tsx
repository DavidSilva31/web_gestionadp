"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Search, RefreshCw, Loader2, History, FilePen, FileCheck2, Truck, FileText, Trash2, ExternalLink, ScanLine, PackagePlus, PackageMinus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { accionLabel } from "@/lib/audit"
import { cn } from "@/lib/utils"
import type { AuditLog, AuditAccion } from "@/lib/audit"

const ACCION_FILTERS: { value: AuditAccion | "all"; label: string }[] = [
  { value: "all",                       label: "Todos"           },
  { value: "report.crear_borrador",     label: "Creados"         },
  { value: "report.actualizar",         label: "Actualizados"    },
  { value: "report.enviar_despacho",    label: "A despacho"      },
  { value: "report.despachar",          label: "Despachados"     },
  { value: "report.eliminar",           label: "Eliminados"      },
  { value: "inventario.ingreso",        label: "Ing. inventario" },
  { value: "inventario.despacho",       label: "Des. inventario" },
]

const ACCION_STYLE: Record<string, { icon: React.ReactNode; pill: string }> = {
  "report.crear_borrador":     { icon: <FileText    className="h-3.5 w-3.5" />, pill: "bg-gray-100   text-gray-600   dark:bg-gray-800    dark:text-gray-400"   },
  "report.actualizar":         { icon: <FilePen     className="h-3.5 w-3.5" />, pill: "bg-blue-100   text-blue-700   dark:bg-blue-900/30  dark:text-blue-400"   },
  "report.enviar_despacho":    { icon: <FileCheck2  className="h-3.5 w-3.5" />, pill: "bg-amber-100  text-amber-700  dark:bg-amber-900/30 dark:text-amber-400"  },
  "report.confirmar_despacho": { icon: <Truck       className="h-3.5 w-3.5" />, pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "report.despachar":          { icon: <ScanLine    className="h-3.5 w-3.5" />, pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  "report.eliminar":           { icon: <Trash2      className="h-3.5 w-3.5" />, pill: "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400"    },
  "inventario.ingreso":        { icon: <PackagePlus  className="h-3.5 w-3.5" />, pill: "bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-400"    },
  "inventario.despacho":       { icon: <PackageMinus className="h-3.5 w-3.5" />, pill: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
}

const PAGE_SIZE = 50

export default function AuditoriaPage() {
  const [logs,        setLogs]        = useState<AuditLog[]>([])
  const [loading,     setLoading]     = useState(true)
  const [total,       setTotal]       = useState(0)
  const [search,      setSearch]      = useState("")
  const [accionFilter, setAccionFilter] = useState<AuditAccion | "all">("all")

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .in("tabla", ["reports", "inventario_items"])
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)

    if (accionFilter !== "all") query = query.eq("accion", accionFilter)
    if (search.trim())          query = query.ilike("descripcion", `%${search.trim()}%`)

    const { data, count } = await query
    if (data) setLogs(data as AuditLog[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [accionFilter, search])

  useEffect(() => {
    const t = setTimeout(fetchLogs, search ? 400 : 0)
    return () => clearTimeout(t)
  }, [fetchLogs, search])

  const reportIdFromLog = (log: AuditLog) => log.registro_id

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Auditoría" subtitle="Registro de actividad en reports e inventario">
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-4 flex-shrink-0 overflow-x-auto">
        {/* Chips de acción */}
        <div className="flex gap-1.5 bg-muted rounded-lg p-0.5 flex-shrink-0">
          {ACCION_FILTERS.map(f => (
            <button key={f.value} onClick={() => setAccionFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                accionFilter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, patente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-64"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">

          {/* Contador */}
          <div className="px-5 py-2.5 border-b bg-muted/20 flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              {loading ? "Cargando..." : `${total} evento${total !== 1 ? "s" : ""} registrado${total !== 1 ? "s" : ""}${total > PAGE_SIZE ? ` (mostrando ${PAGE_SIZE})` : ""}`}
            </p>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <History className="h-10 w-10 opacity-20" />
              <p className="text-sm">No hay eventos registrados</p>
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm table-fixed min-w-[640px]">
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "36%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "8%" }}  />
                </colgroup>
                <thead className="sticky top-0 bg-muted border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha y hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acción</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descripción</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuario</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const style = ACCION_STYLE[log.accion]
                    return (
                      <tr key={log.id} className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("es-CL", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                            style?.pill ?? "bg-muted text-muted-foreground"
                          )}>
                            {style?.icon}
                            {accionLabel(log.accion)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-foreground overflow-hidden">
                          <span className="truncate block">{log.descripcion ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground overflow-hidden">
                          <span className="truncate block">{log.usuario_nombre ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {log.tabla === "reports" ? (
                            <Link href={`/reports/${reportIdFromLog(log)}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[oklch(0.35_0.12_240)]">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
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
    </div>
  )
}
