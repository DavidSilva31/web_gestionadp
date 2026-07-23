"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  ArrowDownCircle, ArrowUpCircle, RefreshCw, Plus, Search,
  Loader2, CheckCircle2, Pencil, Link2, Clock, Download, ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { exportToExcel } from "@/lib/excel"
import { cn } from "@/lib/utils"
import type {
  Movimiento, MovimientoInsert, MovimientoTipo, MovimientoServicio,
  Cliente, InventarioItem, InventarioArea, TipoEnvase,
} from "@/types/database"

// ── Constantes ─────────────────────────────────────────────────────────────────
const SERVICIOS: MovimientoServicio[] = ["Almacenaje", "Transporte", "Porteo", "Logística"]
const AREAS: InventarioArea[] = ["Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General"]
const TIPOS_ENVASE: TipoEnvase[] = ["Tambor", "Bidón", "IBC", "Saco", "Caja", "Pallet", "Granel", "Otro"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const SERVICIO_BADGE: Record<string, string> = {
  Almacenaje: "bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]",
  Transporte: "bg-[var(--color-adp-celeste-light)] text-[var(--color-adp-blue-mid)]",
  Porteo:     "bg-[var(--color-status-neutral-bg)] text-[var(--color-status-neutral-text)]",
  Logística:  "bg-[var(--color-status-success-bg)] text-[var(--color-status-success-text)]",
}

const AREA_COLOR: Record<string, string> = {
  "Bodega IMO":      "bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]",
  "Zona Isotanques": "bg-[var(--color-adp-celeste-light)] text-[var(--color-adp-blue-mid)]",
  "Zona RESPEL":     "bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning-text)]",
  "Bodega General":  "bg-[var(--color-status-neutral-bg)] text-[var(--color-status-neutral-text)]",
}

const movCodigo = (n: number) => `MOV-${String(n).padStart(3, "0")}`
const invCodigo = (n: number) => `ALM-${String(n).padStart(3, "0")}`

function formatFecha(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

const EMPTY_FORM = (tipo: MovimientoTipo): MovimientoInsert => ({
  tipo,
  servicio:           "Almacenaje",
  cliente_id:         null,
  cliente_nombre:     null,
  carga:              "",
  area:               null,
  inventario_item_id: null,
  unidades:           null,
  operador:           "",
  estado:             "en_proceso",
  observaciones:      null,
  codigo:             null,
  imo:                null,
  un:                 null,
  cas:                null,
  lote:               null,
  fecha_elaboracion:  null,
  fecha_vencimiento:  null,
  peso_envase:        null,
  tipo_envase:        null,
  posiciones:         null,
  fecha:              new Date().toISOString().slice(0, 16),
  report_id:          null,
  created_by:         null,
})

// ── Component ──────────────────────────────────────────────────────────────────
export default function MovimientosPage() {
  const [movimientos,   setMovimientos]   = useState<Movimiento[]>([])
  const [clientes,      setClientes]      = useState<Cliente[]>([])
  const [clienteItems,  setClienteItems]  = useState<InventarioItem[]>([])
  const [loading,       setLoading]       = useState(true)
  const currentYear = new Date().getFullYear()
  const [yearFilter,    setYearFilter]    = useState(currentYear)
  const [monthFilter,   setMonthFilter]   = useState<number | "todos">("todos")
  const [loadingItems,  setLoadingItems]  = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [search,        setSearch]        = useState("")
  const [filtroTipo,    setFiltroTipo]    = useState<"todos" | MovimientoTipo>("todos")
  const [error,         setError]         = useState<string | null>(null)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [dialog,        setDialog]        = useState<null | MovimientoTipo | Movimiento>(null)
  const [form,          setForm]          = useState<MovimientoInsert>(EMPTY_FORM("ingreso"))
  const [exportPreview, setExportPreview] = useState<{ rows: Record<string, string | number>[]; filename: string } | null>(null)
  const [exportError,   setExportError]   = useState<string | null>(null)
  const [manifiestoOpen, setManifiestoOpen] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMovimientos = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from("movimientos")
      .select("*")
      .gte("fecha", `${yearFilter}-01-01`)
      .lt("fecha",  `${yearFilter + 1}-01-01`)
      .order("fecha", { ascending: false })
    if (err) { setFetchError(err.message); setLoading(false); return }
    if (data) setMovimientos(data as Movimiento[])
    setLoading(false)
  }, [yearFilter])

  const fetchClientes = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
    if (error) console.error("[movimientos] error obteniendo clientes:", error)
    if (data) setClientes(data as Cliente[])
  }, [])

  useEffect(() => {
    fetchMovimientos()
    fetchClientes()
  }, [fetchMovimientos, fetchClientes])

  // Cargar ítems de inventario cuando cambia el cliente en el form
  const fetchItemsParaCliente = useCallback(async (clienteId: string) => {
    setLoadingItems(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("inventario_items")
      .select("id, numero, descripcion, stock_actual, area")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("numero")
    if (error) {
      console.error("[movimientos] error obteniendo ítems del cliente:", error)
      setError("No se pudieron cargar los ítems de inventario del cliente.")
    }
    setClienteItems((data as InventarioItem[]) ?? [])
    setLoadingItems(false)
  }, [])

  // ── Acciones ───────────────────────────────────────────────────────────────
  function openNew(tipo: MovimientoTipo) {
    setForm(EMPTY_FORM(tipo))
    setClienteItems([])
    setError(null)
    setManifiestoOpen(false)
    setDialog(tipo)
  }

  function openEdit(m: Movimiento) {
    setForm({
      tipo:               m.tipo,
      servicio:           m.servicio,
      cliente_id:         m.cliente_id,
      cliente_nombre:     m.cliente_nombre,
      carga:              m.carga,
      area:               m.area,
      inventario_item_id: m.inventario_item_id,
      unidades:           m.unidades,
      operador:           m.operador ?? "",
      estado:             m.estado,
      observaciones:      m.observaciones,
      codigo:             m.codigo,
      imo:                m.imo,
      un:                 m.un,
      cas:                m.cas,
      lote:               m.lote,
      fecha_elaboracion:  m.fecha_elaboracion,
      fecha_vencimiento:  m.fecha_vencimiento,
      peso_envase:        m.peso_envase,
      tipo_envase:        m.tipo_envase,
      posiciones:         m.posiciones,
      fecha:              m.fecha.slice(0, 16),
      report_id:          m.report_id,
      created_by:         m.created_by,
    })
    if (m.cliente_id) fetchItemsParaCliente(m.cliente_id)
    else setClienteItems([])
    setError(null)
    setManifiestoOpen(!!(m.codigo || m.imo || m.un || m.cas || m.lote || m.fecha_elaboracion || m.fecha_vencimiento || m.peso_envase || m.tipo_envase || m.posiciones))
    setDialog(m)
  }

  function handleClienteChange(clienteId: string) {
    const c = clientes.find(x => x.id === clienteId)
    setForm(p => ({
      ...p,
      cliente_id:         clienteId || null,
      cliente_nombre:     c?.nombre ?? null,
      inventario_item_id: null,
    }))
    if (clienteId) fetchItemsParaCliente(clienteId)
    else setClienteItems([])
  }

  async function marcarCompletado(m: Movimiento) {
    setActionError(null)
    const supabase = createClient()
    const { error } = await supabase.from("movimientos").update({ estado: "completado" }).eq("id", m.id)
    if (error) { setActionError("Error al actualizar estado: " + error.message); return }
    fetchMovimientos()
  }

  async function handleSave() {
    if (!form.carga.trim()) { setError("La descripción de carga es obligatoria"); return }
    setSaving(true); setError(null)

    const payload: MovimientoInsert = {
      ...form,
      carga:              form.carga.trim(),
      operador:           form.operador?.trim() || null,
      observaciones:      form.observaciones?.trim() || null,
      codigo:             form.codigo?.trim() || null,
      imo:                form.imo?.trim() || null,
      un:                 form.un?.trim() || null,
      cas:                form.cas?.trim() || null,
      lote:               form.lote?.trim() || null,
      fecha_elaboracion:  form.fecha_elaboracion || null,
      fecha_vencimiento:  form.fecha_vencimiento || null,
      fecha:              new Date(form.fecha as string).toISOString(),
    }

    try {
      const supabase = createClient()
      if (dialog === "ingreso" || dialog === "despacho") {
        const { data: inserted, error: err } = await supabase
          .from("movimientos").insert(payload).select("id").single()
        if (err) { setError(err.message); setSaving(false); return }

        if (payload.inventario_item_id && payload.unidades && payload.unidades > 0) {
          const signedDelta = payload.tipo === "ingreso" ? payload.unidades : -payload.unidades
          const { error: rpcErr } = await supabase.rpc("update_stock", {
            item_id: payload.inventario_item_id,
            delta:   signedDelta,
          })
          if (rpcErr) {
            await supabase.from("movimientos").delete().eq("id", inserted!.id)
            setError("Error al actualizar stock. El movimiento no fue registrado.")
            setSaving(false)
            return
          }
        }
      } else if (dialog && typeof dialog === "object") {
        const { error: err } = await supabase.from("movimientos").update(payload).eq("id", dialog.id)
        if (err) { setError(err.message); setSaving(false); return }
      }
      setSaving(false)
      setDialog(null)
      fetchMovimientos()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
      setSaving(false)
    }
  }

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => movimientos.filter(m => {
    if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false
    if (monthFilter !== "todos" && new Date(m.fecha).getMonth() !== monthFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (m.cliente_nombre ?? "").toLowerCase().includes(q) ||
      m.carga.toLowerCase().includes(q) ||
      movCodigo(m.numero).toLowerCase().includes(q) ||
      m.servicio.toLowerCase().includes(q)
    )
  }), [movimientos, filtroTipo, monthFilter, search])

  const isNewDialog = dialog === "ingreso" || dialog === "despacho"
  const isEditDialog = dialog !== null && !isNewDialog
  const dialogTipo = isNewDialog ? (dialog as MovimientoTipo) : (isEditDialog ? (dialog as Movimiento).tipo : "ingreso")

  // ── Render ─────────────────────────────────────────────────────────────────
  const statsIngresos  = useMemo(() => movimientos.filter(m => m.tipo === "ingreso").length,    [movimientos])
  const statsDespachos = useMemo(() => movimientos.filter(m => m.tipo === "despacho").length,   [movimientos])
  const statsEnProceso = useMemo(() => movimientos.filter(m => m.estado === "en_proceso").length, [movimientos])

  function buildExportRows() {
    if (filtered.length === 0) return null
    const rows = filtered.map(m => ({
      "Código":        movCodigo(m.numero),
      "Tipo":          m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
      "Servicio":      m.servicio,
      "Cliente":       m.cliente_nombre ?? "—",
      "Carga":         m.carga,
      "Área":          m.area ?? "—",
      "Unidades":      m.unidades ?? "—",
      "Operador":      m.operador ?? "—",
      "Estado":        m.estado === "completado" ? "Completado" : "En proceso",
      "Fecha":         formatFecha(m.fecha),
      "Observaciones": m.observaciones ?? "",
    }))
    const today = new Date().toLocaleDateString("es-CL").replace(/\//g, "-")
    const mesLabel = monthFilter === "todos" ? "" : `_${MESES[monthFilter]}`
    return { rows, filename: `Movimientos${mesLabel}_${yearFilter}_${today}` }
  }

  function openExportPreview() {
    const built = buildExportRows()
    if (built) setExportPreview(built)
  }

  function handleDownloadExport() {
    if (!exportPreview) return
    setExportError(null)
    try {
      exportToExcel(exportPreview.rows, exportPreview.filename, "Movimientos")
      setExportPreview(null)
    } catch (err) {
      console.error("[movimientos] error exportando Excel:", err)
      setExportError("No se pudo generar el archivo Excel.")
    }
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          title="Movimientos"
          subtitle={`${movimientos.length} registros · Almacenaje, Transporte, Porteo y Logística`}
        >
          <Button variant="ghost" size="sm" onClick={fetchMovimientos} disabled={loading}
            className="h-10 w-10 p-0 text-muted-foreground">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm"
            onClick={openExportPreview}
            disabled={loading || filtered.length === 0}
            className="gap-1.5 text-xs h-9">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
          <Button size="sm" onClick={() => openNew("ingreso")}
            className="gap-1.5 bg-[var(--color-status-success-text)] hover:opacity-90 text-white">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nuevo ingreso</span>
          </Button>
          <Button size="sm" onClick={() => openNew("despacho")}
            className="gap-1.5 bg-[var(--color-status-warning-text)] hover:opacity-90 text-white">
            <ArrowUpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nuevo despacho</span>
          </Button>
        </PageHeader>

        {fetchError && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            Error al cargar movimientos: {fetchError}
          </div>
        )}

        {actionError && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {actionError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 pt-4 pb-3 flex-shrink-0">
          {[
            { label: "Total registros", count: movimientos.length, Icon: RefreshCw,       ibg: "bg-[var(--color-status-info-bg)]",         icl: "text-[var(--color-status-info-text)]"    },
            { label: "Ingresos",        count: statsIngresos,      Icon: ArrowDownCircle, ibg: "bg-[var(--color-status-success-bg)]",      icl: "text-[var(--color-status-success-text)]" },
            { label: "Despachos",       count: statsDespachos,     Icon: ArrowUpCircle,   ibg: "bg-[var(--color-status-warning-bg)]",      icl: "text-[var(--color-status-warning-text)]" },
            { label: "En proceso",      count: statsEnProceso,     Icon: Clock,           ibg: "bg-[var(--color-adp-celeste-light)]",      icl: "text-[var(--color-adp-blue-mid)]"        },
          ].map(s => (
            <div key={s.label} className="flex-1 bg-card rounded-lg border p-3 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", s.ibg)}>
                <s.Icon className={cn("h-4 w-4", s.icl)} />
              </div>
              <div>
                <p className="text-base font-bold text-foreground leading-none tabular-nums">{loading ? "—" : s.count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros y búsqueda */}
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
            {(["todos", "ingreso", "despacho"] as const).map(f => (
              <button key={f} onClick={() => setFiltroTipo(f)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize",
                  filtroTipo === f
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value === "todos" ? "todos" : Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="todos">Todos los meses</option>
            {MESES.map((mes, i) => (
              <option key={mes} value={i}>{mes}</option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={e => setYearFilter(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[140px] sm:max-w-xs ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, carga..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-full bg-background"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 pb-4">
          <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 border-b z-10">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Movimiento</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicio</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente / Carga</th>
                      <th className="hidden xl:table-cell text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Área</th>
                      <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m, idx) => (
                      <tr key={m.id}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/30 transition-colors group",
                          idx % 2 !== 0 && "bg-muted/10"
                        )}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0",
                              m.tipo === "ingreso"
                                ? "bg-[var(--color-status-success-bg)]"
                                : "bg-[var(--color-status-warning-bg)]"
                            )}>
                              {m.tipo === "ingreso"
                                ? <ArrowDownCircle className="h-3.5 w-3.5 text-[var(--color-status-success-text)]" />
                                : <ArrowUpCircle   className="h-3.5 w-3.5 text-[var(--color-status-warning-text)]" />
                              }
                            </div>
                            <div>
                              <p className={cn(
                                "text-xs font-semibold",
                                m.tipo === "ingreso"
                                  ? "text-[var(--color-status-success-text)]"
                                  : "text-[var(--color-status-warning-text)]"
                              )}>
                                {m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1)}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">{movCodigo(m.numero)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3">
                          <Badge className={cn("text-[10px] px-1.5 py-0 border-0 font-medium", SERVICIO_BADGE[m.servicio] ?? "bg-muted text-muted-foreground")}>
                            {m.servicio}
                          </Badge>
                          {m.report_id && (
                            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                              <Link2 className="h-2.5 w-2.5" /> Report
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[140px] sm:max-w-none">
                          <p className="text-xs font-medium truncate">{m.cliente_nombre ?? "—"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {m.carga}{m.unidades ? ` · ${m.unidades} ud.` : ""}
                          </p>
                        </td>
                        <td className="hidden xl:table-cell px-4 py-3">
                          {m.area ? (
                            <Badge className={cn("text-[10px] px-1.5 py-0 border-0 font-medium", AREA_COLOR[m.area] ?? "bg-muted text-muted-foreground")}>
                              {m.area}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatFecha(m.fecha)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.estado === "completado" ? (
                            <span className="badge-success inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Completado</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => marcarCompletado(m)}
                              className="badge-warning inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                              title="Clic para marcar como completado"
                            >
                              <Clock className="h-3 w-3" />
                              <span className="hidden sm:inline">En proceso</span>
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(m)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && !loading && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                          {search || filtroTipo !== "todos"
                            ? "No se encontraron movimientos con ese filtro"
                            : "No hay movimientos registrados"}
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

      {/* ── Dialog: nuevo / editar movimiento ── */}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogTipo === "ingreso"
                ? <><ArrowDownCircle className="h-4 w-4 text-emerald-600" /> Registrar ingreso</>
                : <><ArrowUpCircle className="h-4 w-4 text-amber-600" /> Registrar despacho</>
              }
              {isEditDialog && <span className="text-muted-foreground font-normal text-sm ml-1">— Editar</span>}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-1">

            {/* Servicio */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Servicio *</Label>
              <select
                value={form.servicio}
                onChange={e => setForm(p => ({ ...p, servicio: e.target.value as MovimientoServicio, inventario_item_id: null, area: null }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Estado */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</Label>
              <select
                value={form.estado}
                onChange={e => setForm(p => ({ ...p, estado: e.target.value as "en_proceso" | "completado" }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="en_proceso">En proceso</option>
                <option value="completado">Completado</option>
              </select>
            </div>

            {/* Cliente */}
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</Label>
              <select
                value={form.cliente_id ?? ""}
                onChange={e => handleClienteChange(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sin cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Carga */}
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descripción de carga *</Label>
              <Input
                value={form.carga}
                onChange={e => setForm(p => ({ ...p, carga: e.target.value }))}
                placeholder="Ej: Contenedor 20' Clase IMO 3 — Metanol"
                className="h-9"
              />
            </div>

            {/* Ítem de inventario (solo Almacenaje) */}
            {form.servicio === "Almacenaje" && (
              <>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Ítem de inventario
                    <span className="text-muted-foreground font-normal ml-1 normal-case">(actualiza stock)</span>
                  </Label>
                  <select
                    value={form.inventario_item_id ?? ""}
                    onChange={e => {
                      const item = clienteItems.find(i => i.id === e.target.value)
                      setForm(p => ({
                        ...p,
                        inventario_item_id: e.target.value || null,
                        area: item?.area ?? p.area,
                      }))
                    }}
                    disabled={!form.cliente_id || loadingItems}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="">
                      {!form.cliente_id ? "Selecciona un cliente primero" :
                       loadingItems ? "Cargando ítems..." :
                       clienteItems.length === 0 ? "Sin ítems en inventario" : "Sin vincular a ítem"}
                    </option>
                    {clienteItems.map(i => (
                      <option key={i.id} value={i.id}>
                        {invCodigo(i.numero)} — {i.descripcion} (stock: {i.stock_actual})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Área</Label>
                  <select
                    value={form.area ?? ""}
                    onChange={e => setForm(p => ({ ...p, area: (e.target.value as InventarioArea) || null }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Sin área</option>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unidades</Label>
                  <Input
                    type="number" min={1}
                    value={form.unidades ?? ""}
                    onChange={e => setForm(p => ({ ...p, unidades: parseInt(e.target.value) || null }))}
                    placeholder="0"
                    className="h-9"
                  />
                </div>

                {/* Datos de manifiesto / lote — colapsable, no siempre aplica */}
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => setManifiestoOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", manifiestoOpen && "rotate-180")} />
                    Datos de lote y envase
                    <span className="text-muted-foreground/60 font-normal normal-case">(opcional)</span>
                  </button>
                </div>

                {manifiestoOpen && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Código</Label>
                      <Input
                        value={form.codigo ?? ""}
                        onChange={e => setForm(p => ({ ...p, codigo: e.target.value || null }))}
                        placeholder="Ej: PROD-0231"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Clase IMO</Label>
                      <Input
                        value={form.imo ?? ""}
                        onChange={e => setForm(p => ({ ...p, imo: e.target.value || null }))}
                        placeholder="Ej: 2.2"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">N° UN</Label>
                      <Input
                        value={form.un ?? ""}
                        onChange={e => setForm(p => ({ ...p, un: e.target.value || null }))}
                        placeholder="Ej: 1977"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">N° CAS</Label>
                      <Input
                        value={form.cas ?? ""}
                        onChange={e => setForm(p => ({ ...p, cas: e.target.value || null }))}
                        placeholder="Ej: 7727-37-9"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lote</Label>
                      <Input
                        value={form.lote ?? ""}
                        onChange={e => setForm(p => ({ ...p, lote: e.target.value || null }))}
                        placeholder="N° de lote"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de envase</Label>
                      <select
                        value={form.tipo_envase ?? ""}
                        onChange={e => setForm(p => ({ ...p, tipo_envase: (e.target.value as TipoEnvase) || null }))}
                        className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Sin especificar</option>
                        {TIPOS_ENVASE.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha elaboración</Label>
                      <Input
                        type="date"
                        value={form.fecha_elaboracion ?? ""}
                        onChange={e => setForm(p => ({ ...p, fecha_elaboracion: e.target.value || null }))}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha vencimiento</Label>
                      <Input
                        type="date"
                        value={form.fecha_vencimiento ?? ""}
                        onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value || null }))}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Peso envase (kg)</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={form.peso_envase ?? ""}
                        onChange={e => setForm(p => ({ ...p, peso_envase: e.target.value ? parseFloat(e.target.value) : null }))}
                        placeholder="0"
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Posiciones</Label>
                      <Input
                        type="number" min={0}
                        value={form.posiciones ?? ""}
                        onChange={e => setForm(p => ({ ...p, posiciones: e.target.value ? parseInt(e.target.value) : null }))}
                        placeholder="0"
                        className="h-9"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Operador */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operador</Label>
              <Input
                value={form.operador ?? ""}
                onChange={e => setForm(p => ({ ...p, operador: e.target.value }))}
                placeholder="Nombre del operador"
                className="h-9"
              />
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={(form.fecha as string).slice(0, 16)}
                onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                className="h-9 text-xs"
              />
            </div>

            {/* Observaciones */}
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observaciones</Label>
              <textarea
                value={form.observaciones ?? ""}
                onChange={e => setForm(p => ({ ...p, observaciones: e.target.value || null }))}
                placeholder="Notas adicionales..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={saving || !form.carga.trim()}
              onClick={handleSave}
              className={cn(
                "gap-1.5 text-white",
                dialogTipo === "ingreso"
                  ? "bg-[var(--color-status-success-text)] hover:opacity-90"
                  : "bg-[var(--color-status-warning-text)] hover:opacity-90"
              )}
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />
              }
              {isEditDialog ? "Guardar cambios" :
               dialogTipo === "ingreso" ? "Registrar ingreso" : "Registrar despacho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vista previa del Excel antes de descargar ── */}
      <Dialog open={exportPreview !== null} onOpenChange={open => { if (!open) { setExportPreview(null); setExportError(null) } }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Vista previa del Excel — {exportPreview?.rows.length} movimiento{exportPreview?.rows.length !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>
          {exportError && (
            <p className="text-xs text-destructive">{exportError}</p>
          )}

          <div className="flex-1 overflow-auto border rounded-lg">
            {exportPreview && (
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {Object.keys(exportPreview.rows[0] ?? {}).map(col => (
                      <th key={col} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportPreview.rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2 whitespace-nowrap">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportPreview(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleDownloadExport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Descargar Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
