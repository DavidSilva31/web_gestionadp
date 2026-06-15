"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ArrowDownCircle, ArrowUpCircle, RefreshCw, Plus, Search,
  Loader2, CheckCircle2, Pencil, Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type {
  Movimiento, MovimientoInsert, MovimientoTipo, MovimientoServicio,
  Cliente, InventarioItem, InventarioArea,
} from "@/types/database"

// ── Constantes ─────────────────────────────────────────────────────────────────
const SERVICIOS: MovimientoServicio[] = ["Almacenaje", "Transporte", "Porteo", "Logística"]
const AREAS: InventarioArea[] = ["Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General"]

const SERVICIO_BADGE: Record<string, string> = {
  Almacenaje: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  Transporte: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  Porteo:     "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400",
  Logística:  "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400",
}

const AREA_COLOR: Record<string, string> = {
  "Bodega IMO":      "bg-blue-50 text-blue-700",
  "Zona Isotanques": "bg-purple-50 text-purple-700",
  "Zona RESPEL":     "bg-orange-50 text-orange-700",
  "Bodega General":  "bg-teal-50 text-teal-700",
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
  const [loadingItems,  setLoadingItems]  = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [search,        setSearch]        = useState("")
  const [filtroTipo,    setFiltroTipo]    = useState<"todos" | MovimientoTipo>("todos")
  const [error,         setError]         = useState<string | null>(null)
  const [dialog,        setDialog]        = useState<null | MovimientoTipo | Movimiento>(null)
  const [form,          setForm]          = useState<MovimientoInsert>(EMPTY_FORM("ingreso"))

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMovimientos = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("movimientos")
      .select("*")
      .order("fecha", { ascending: false })
    if (data) setMovimientos(data as Movimiento[])
    setLoading(false)
  }, [])

  const fetchClientes = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("activo", true)
      .order("nombre")
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
    const { data } = await supabase
      .from("inventario_items")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("numero")
    setClienteItems((data as InventarioItem[]) ?? [])
    setLoadingItems(false)
  }, [])

  // ── Acciones ───────────────────────────────────────────────────────────────
  function openNew(tipo: MovimientoTipo) {
    setForm(EMPTY_FORM(tipo))
    setClienteItems([])
    setError(null)
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
      fecha:              m.fecha.slice(0, 16),
      report_id:          m.report_id,
      created_by:         m.created_by,
    })
    if (m.cliente_id) fetchItemsParaCliente(m.cliente_id)
    else setClienteItems([])
    setError(null)
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
    const supabase = createClient()
    await supabase.from("movimientos").update({ estado: "completado" }).eq("id", m.id)
    fetchMovimientos()
  }

  async function handleSave() {
    if (!form.carga.trim()) { setError("La descripción de carga es obligatoria"); return }
    setSaving(true); setError(null)

    const payload: MovimientoInsert = {
      ...form,
      carga:         form.carga.trim(),
      operador:      form.operador?.trim() || null,
      observaciones: form.observaciones?.trim() || null,
      fecha:         new Date(form.fecha as string).toISOString(),
    }

    try {
      const supabase = createClient()
      if (dialog === "ingreso" || dialog === "despacho") {
        const { error: err } = await supabase.from("movimientos").insert(payload)
        if (err) { setError(err.message); setSaving(false); return }
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
  const filtered = movimientos.filter(m => {
    if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (m.cliente_nombre ?? "").toLowerCase().includes(q) ||
      m.carga.toLowerCase().includes(q) ||
      movCodigo(m.numero).toLowerCase().includes(q) ||
      m.servicio.toLowerCase().includes(q)
    )
  })

  const isNewDialog = dialog === "ingreso" || dialog === "despacho"
  const isEditDialog = dialog !== null && !isNewDialog
  const dialogTipo = isNewDialog ? (dialog as MovimientoTipo) : (isEditDialog ? (dialog as Movimiento).tipo : "ingreso")

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <Button size="sm" onClick={() => openNew("ingreso")}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <ArrowDownCircle className="h-3.5 w-3.5" /> Nuevo ingreso
          </Button>
          <Button size="sm" onClick={() => openNew("despacho")}
            className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white">
            <ArrowUpCircle className="h-3.5 w-3.5" /> Nuevo despacho
          </Button>
        </PageHeader>

        {/* Filtros y búsqueda */}
        <div className="px-6 pt-4 pb-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
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
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, carga o código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs w-64 bg-background"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
          <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "3%" }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-muted/60 border-b z-10">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Movimiento</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Servicio</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Carga</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Área</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
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
                              m.tipo === "ingreso" ? "bg-emerald-50" : "bg-amber-50"
                            )}>
                              {m.tipo === "ingreso"
                                ? <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />
                                : <ArrowUpCircle className="h-3.5 w-3.5 text-amber-600" />
                              }
                            </div>
                            <div>
                              <p className={cn(
                                "text-xs font-semibold",
                                m.tipo === "ingreso" ? "text-emerald-700" : "text-amber-700"
                              )}>
                                {m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1)}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {movCodigo(m.numero)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn(
                            "text-[10px] px-1.5 py-0 border-0 font-medium",
                            SERVICIO_BADGE[m.servicio] ?? "bg-muted text-muted-foreground"
                          )}>
                            {m.servicio}
                          </Badge>
                          {m.report_id && (
                            <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                              <Link2 className="h-2.5 w-2.5" /> Report
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium truncate">{m.cliente_nombre ?? "—"}</p>
                          {m.operador && (
                            <p className="text-[10px] text-muted-foreground">{m.operador}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs truncate">{m.carga}</p>
                          {m.unidades && (
                            <p className="text-[10px] text-muted-foreground">{m.unidades} unid.</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {m.area ? (
                            <Badge className={cn(
                              "text-[10px] px-1.5 py-0 border-0 font-medium",
                              AREA_COLOR[m.area] ?? "bg-muted text-muted-foreground"
                            )}>
                              {m.area}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatFecha(m.fecha)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.estado === "completado" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Completado
                            </span>
                          ) : (
                            <button
                              onClick={() => marcarCompletado(m)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors dark:bg-amber-900/30 dark:text-amber-400"
                            >
                              En proceso
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => openEdit(m)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && !loading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
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
        <DialogContent className="max-w-lg">
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
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-500 hover:bg-amber-600"
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
    </>
  )
}
