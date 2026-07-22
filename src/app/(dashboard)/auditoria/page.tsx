"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Search, RefreshCw, Loader2, History, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { accionLabel, ACCION_STYLE } from "@/lib/audit"
import { cn } from "@/lib/utils"
import type { AuditLog, AuditAccion } from "@/lib/audit"

const ACCION_FILTERS: { value: AuditAccion | "all"; label: string }[] = [
  { value: "all",                       label: "Todos"           },
  { value: "report.crear_borrador",     label: "Reports"         },
  { value: "report.despachar",          label: "Despachos"       },
  { value: "inventario.ingreso",        label: "Movimientos"     },
  { value: "cliente.crear",             label: "Clientes"        },
  { value: "inventario.crear_item",     label: "Inventario"      },
  { value: "servicio.crear",            label: "Servicios/Tarifas" },
  { value: "admin.crear_usuario",       label: "Usuarios"        },
]

// Cada chip de filtro agrupa varias acciones relacionadas (ej. "Reports" incluye
// crear/actualizar/enviar/eliminar, pero no los despachos que tienen su propio chip).
const FILTER_GROUPS: Partial<Record<AuditAccion, AuditAccion[]>> = {
  "report.crear_borrador": ["report.crear_borrador", "report.actualizar", "report.enviar_despacho", "report.eliminar"],
  "report.despachar":      ["report.despachar", "report.confirmar_despacho"],
  "inventario.ingreso":    ["inventario.ingreso", "inventario.despacho"],
  "cliente.crear":         ["cliente.crear", "cliente.actualizar"],
  "inventario.crear_item": ["inventario.crear_item", "inventario.actualizar_item", "inventario.eliminar_item"],
  "servicio.crear":        ["servicio.crear", "servicio.actualizar", "servicio.eliminar", "tarifa.crear", "tarifa.actualizar"],
  "admin.crear_usuario":   ["admin.crear_usuario", "admin.eliminar_usuario", "admin.actualizar_usuario", "perfil.actualizar"],
}

const PAGE_SIZE = 50

export default function AuditoriaPage() {
  const [logs,         setLogs]         = useState<AuditLog[]>([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [search,       setSearch]       = useState("")
  const [accionFilter, setAccionFilter] = useState<AuditAccion | "all">("all")

  const fetchLogs = useCallback(async (currentPage: number) => {
    setLoading(true)
    const supabase = createClient()

    const from = currentPage * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .in("tabla", ["reports", "inventario_items", "profiles", "clientes", "tarifas_cliente", "servicios_cliente"])
      .order("created_at", { ascending: false })
      .range(from, to)

    if (accionFilter !== "all") {
      const group = FILTER_GROUPS[accionFilter]
      query = group ? query.in("accion", group) : query.eq("accion", accionFilter)
    }
    if (search.trim())          query = query.ilike("descripcion", `%${search.trim()}%`)

    const { data, count, error } = await query
    if (error) {
      setFetchError(error.message)
      setLogs([])
      setTotal(0)
      setLoading(false)
      return
    }
    setFetchError(null)
    if (data) setLogs(data as AuditLog[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [accionFilter, search])

  useEffect(() => {
    setPage(0)
  }, [accionFilter, search])

  useEffect(() => {
    const t = setTimeout(() => fetchLogs(page), search ? 400 : 0)
    return () => clearTimeout(t)
  }, [fetchLogs, page, search])

  const totalPages  = Math.ceil(total / PAGE_SIZE)
  const pageStart   = page * PAGE_SIZE + 1
  const pageEnd     = Math.min((page + 1) * PAGE_SIZE, total)

  const reportIdFromLog = (log: AuditLog) => log.registro_id

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Auditoría" subtitle="Registro de actividad en toda la plataforma">
        <Button variant="ghost" size="sm" onClick={() => fetchLogs(page)} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </PageHeader>

      {fetchError && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          Error al cargar logs: {fetchError}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3 px-6 pt-4 pb-4 flex-shrink-0">
        {/* Chips de acción — scroll horizontal propio, nunca empuja la búsqueda fuera de vista */}
        <div className="flex gap-1.5 bg-muted rounded-lg p-0.5 min-w-0 overflow-x-auto lg:flex-1">
          {ACCION_FILTERS.map(f => (
            <button key={f.value} onClick={() => setAccionFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0",
                accionFilter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="relative w-full lg:w-56 flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, patente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs w-full"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">

          {/* Contador y paginación */}
          <div className="px-5 py-2.5 border-b bg-muted/20 flex-shrink-0 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Cargando..."
                : total === 0
                ? "Sin eventos registrados"
                : `${pageStart}–${pageEnd} de ${total} evento${total !== 1 ? "s" : ""}`
              }
            </p>
            {total > PAGE_SIZE && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground px-1 tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || loading}
                  className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
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
            <>
            {/* Mobile/tablet — tarjetas apiladas, sin scroll horizontal */}
            <div className="lg:hidden overflow-y-auto flex-1 divide-y">
              {logs.map(log => {
                const style = ACCION_STYLE[log.accion]
                return (
                  <div key={log.id} className="px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0",
                        style?.pill ?? "bg-muted text-muted-foreground"
                      )}>
                        {style?.icon && <style.icon className="h-3.5 w-3.5" />}
                        {accionLabel(log.accion)}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0 text-right">
                        {new Date(log.created_at).toLocaleString("es-CL", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground break-words">{log.descripcion ?? "—"}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">{log.usuario_nombre ?? "—"}</span>
                      {log.tabla === "reports" && (
                        <Link href={`/reports/${reportIdFromLog(log)}`} className="inline-flex items-center gap-1 text-[11px] text-[oklch(0.35_0.12_240)] font-medium">
                          Ver report <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop — tabla completa, desde lg */}
            <div className="hidden lg:block overflow-auto flex-1">
              <table className="w-full text-sm table-fixed min-w-[640px]">
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
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
                        <td className="px-4 py-3.5 text-xs text-muted-foreground overflow-hidden">
                          {new Date(log.created_at).toLocaleString("es-CL", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </td>
                        <td className="px-4 py-3.5 overflow-hidden">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap max-w-full",
                            style?.pill ?? "bg-muted text-muted-foreground"
                          )}>
                            {style?.icon && <style.icon className="h-3.5 w-3.5" />}
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
            </>
          )}

          {/* Paginación inferior */}
          {total > PAGE_SIZE && !loading && (
            <div className="flex items-center justify-between px-5 py-2.5 border-t bg-muted/10 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-7 gap-1 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="h-7 gap-1 text-xs"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
