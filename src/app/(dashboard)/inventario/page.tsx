"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Package, Plus, Search, RefreshCw, ChevronRight, ArrowLeft,
  Loader2, Pencil, Warehouse, Trash2, Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { exportToExcel } from "@/lib/excel"
import { cn } from "@/lib/utils"
import type {
  Cliente,
  InventarioItem,
  InventarioItemInsert,
  InventarioCategoria,
  InventarioArea,
} from "@/types/database"

const CATEGORIAS: InventarioCategoria[] = [
  "Contenedor IMO", "Isotanque", "Residuo peligroso", "Carga general",
]
const AREAS: InventarioArea[] = [
  "Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General",
]
const UNIDADES = ["unidad", "pallets", "contenedor", "isotanque", "kg", "ton"]

const AREA_COLOR: Record<string, string> = {
  "Bodega IMO":      "bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]",
  "Zona Isotanques": "bg-[var(--color-adp-celeste-light)] text-[var(--color-adp-blue-mid)]",
  "Zona RESPEL":     "bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning-text)]",
  "Bodega General":  "bg-[var(--color-status-neutral-bg)] text-[var(--color-status-neutral-text)]",
}

const ESTADO_BADGE: Record<string, string> = {
  Normal:  "badge-success",
  Bajo:    "badge-warning",
  Crítico: "badge-danger",
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",    "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",   "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
]

const codigo = (n: number) => `ALM-${String(n).padStart(3, "0")}`
const initials = (nombre: string) =>
  nombre.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()

function getEstado(item: InventarioItem): "Normal" | "Bajo" | "Crítico" {
  if (item.stock_actual === 0) return "Crítico"
  if (item.stock_minimo > 0 && item.stock_actual <= item.stock_minimo) return "Bajo"
  return "Normal"
}

function getClienteEstado(items: InventarioItem[]): "Normal" | "Bajo" | "Crítico" | null {
  if (!items.length) return null
  if (items.some(i => getEstado(i) === "Crítico")) return "Crítico"
  if (items.some(i => getEstado(i) === "Bajo")) return "Bajo"
  return "Normal"
}

const EMPTY_FORM: InventarioItemInsert = {
  cliente_id:    "",
  descripcion:   "",
  categoria:     "Carga general",
  area:          "Bodega General",
  clase_imo:     null,
  nu:            null,
  unidad:        "unidad",
  stock_actual:  0,
  stock_minimo:  0,
  observaciones: null,
  activo:        true,
  created_by:    null,
}

// ── Inner component (requiere useSearchParams → envuelto en Suspense) ──────────
function InventarioContent() {
  const searchParams = useSearchParams()
  const clienteParam = searchParams.get("cliente")

  const [clientes,     setClientes]     = useState<Cliente[]>([])
  const [clienteItems, setClienteItems] = useState<Record<string, InventarioItem[]>>({})
  const [selected,     setSelected]     = useState<Cliente | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [search,       setSearch]       = useState("")
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [dialog,       setDialog]       = useState<null | "new" | InventarioItem>(null)
  const [form,         setForm]         = useState<InventarioItemInsert>(EMPTY_FORM)
  const [deleting,     setDeleting]     = useState<InventarioItem | null>(null)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: cData }, { data: iData }] = await Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("inventario_items").select("*").eq("activo", true).order("numero"),
    ])
    const clientes = (cData ?? []) as Cliente[]
    if (clientes.length) setClientes(clientes)
    const grouped: Record<string, InventarioItem[]> = {}
    for (const c of clientes) grouped[c.id] = []
    for (const item of (iData ?? []) as InventarioItem[]) {
      if (grouped[item.cliente_id]) grouped[item.cliente_id].push(item)
      else grouped[item.cliente_id] = [item]
    }
    setClienteItems(grouped)
    setLoading(false)
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  const fetchItemsForCliente = useCallback(async (clienteId: string) => {
    setLoadingItems(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("inventario_items")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("numero")
    if (data) {
      setClienteItems(prev => ({ ...prev, [clienteId]: data as InventarioItem[] }))
    }
    setLoadingItems(false)
  }, [])

  // Preseleccionar cliente desde URL param (?cliente=uuid)
  useEffect(() => {
    if (clienteParam && clientes.length > 0 && !selected) {
      const found = clientes.find(c => c.id === clienteParam)
      if (found) {
        setSelected(found)
        fetchItemsForCliente(found.id)
      }
    }
  }, [clienteParam, clientes, selected, fetchItemsForCliente])

  function selectCliente(c: Cliente) {
    setSelected(c)
    if (!clienteItems[c.id]) {
      fetchItemsForCliente(c.id)
    }
  }

  function openNew() {
    if (!selected) return
    setForm({ ...EMPTY_FORM, cliente_id: selected.id })
    setError(null)
    setDialog("new")
  }

  function openEdit(item: InventarioItem) {
    setForm({
      cliente_id:    item.cliente_id,
      descripcion:   item.descripcion,
      categoria:     item.categoria,
      area:          item.area,
      clase_imo:     item.clase_imo,
      nu:            item.nu,
      unidad:        item.unidad,
      stock_actual:  item.stock_actual,
      stock_minimo:  item.stock_minimo,
      observaciones: item.observaciones,
      activo:        item.activo,
      created_by:    item.created_by,
    })
    setError(null)
    setDialog(item)
  }

  async function handleDelete() {
    if (!deleting) return
    const supabase = createClient()
    await supabase.from("inventario_items").update({ activo: false }).eq("id", deleting.id)
    setDeleting(null)
    if (selected) fetchItemsForCliente(selected.id)
  }

  async function handleSave() {
    if (!form.descripcion.trim()) { setError("La descripción es obligatoria"); return }
    setSaving(true); setError(null)

    const payload = {
      ...form,
      descripcion:   form.descripcion.trim(),
      clase_imo:     form.clase_imo?.trim()     || null,
      nu:            form.nu?.trim()            || null,
      observaciones: form.observaciones?.trim() || null,
    }

    try {
      const supabase = createClient()
      if (dialog === "new") {
        const { error: err } = await supabase.from("inventario_items").insert(payload)
        if (err) { setError(err.message); setSaving(false); return }
      } else if (dialog) {
        const { error: err } = await supabase.from("inventario_items").update(payload).eq("id", dialog.id)
        if (err) { setError(err.message); setSaving(false); return }
      }
      setSaving(false)
      setDialog(null)
      if (selected) fetchItemsForCliente(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
      setSaving(false)
    }
  }

  function handleExport() {
    if (!selected || !items.length) return
    const rows = items.map(item => ({
      "Código":        codigo(item.numero),
      "Descripción":   item.descripcion,
      "Categoría":     item.categoria,
      "Área":          item.area,
      "Clase IMO":     item.clase_imo ?? "—",
      "N° ONU":        item.nu ?? "—",
      "Stock Actual":  item.stock_actual,
      "Stock Mínimo":  item.stock_minimo,
      "Unidad":        item.unidad,
      "Estado":        getEstado(item),
      "Observaciones": item.observaciones ?? "",
    }))
    const today = new Date().toLocaleDateString("es-CL").replace(/\//g, "-")
    exportToExcel(rows, `Inventario_${selected.nombre}_${today}`, "Inventario")
  }

  const items = selected ? (clienteItems[selected.id] ?? []) : []
  const totalItems = Object.values(clienteItems).flat().length
  const filteredClientes = clientes.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          title="Inventario"
          subtitle={`${clientes.length} clientes activos · ${totalItems} ítems registrados`}
        >
          <Button variant="ghost" size="sm" onClick={fetchClientes} disabled={loading}
            className="h-10 w-10 p-0 text-muted-foreground">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          {selected && (
            <Button size="sm" onClick={openNew}
              className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
              <Plus className="h-3.5 w-3.5" />
              Registrar ítem
            </Button>
          )}
        </PageHeader>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">

          {/* ── Panel izquierdo: lista de clientes ── */}
          <div className={cn(
            "flex-shrink-0 border-b md:border-b-0 md:border-r flex flex-col bg-muted/10",
            "w-full md:w-72",
            selected ? "hidden md:flex" : "flex"
          )}>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClientes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Sin clientes activos</p>
              ) : (
                <div className="p-2 space-y-0.5">
                  {filteredClientes.map((c, idx) => {
                    const cItems   = clienteItems[c.id] ?? []
                    const estado   = getClienteEstado(cItems)
                    const isSel    = selected?.id === c.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => selectCliente(c)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition-colors group",
                          isSel
                            ? "bg-[oklch(0.35_0.12_240)] text-white"
                            : "hover:bg-muted/60 text-foreground"
                        )}
                      >
                        <Avatar className="h-7 w-7 flex-shrink-0">
                          <AvatarFallback className={cn(
                            "text-[10px] font-bold",
                            isSel ? "bg-white/20 text-white" : AVATAR_COLORS[idx % AVATAR_COLORS.length]
                          )}>
                            {initials(c.nombre)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-semibold truncate", isSel ? "text-white" : "")}>
                            {c.nombre}
                          </p>
                          <p className={cn("text-[10px]", isSel ? "text-white/70" : "text-muted-foreground")}>
                            {clienteItems[c.id] !== undefined
                              ? `${cItems.length} ítem${cItems.length !== 1 ? "s" : ""}`
                              : "—"}
                          </p>
                        </div>

                        {estado && (
                          <span className={cn(
                            "flex-shrink-0 h-2 w-2 rounded-full",
                            estado === "Crítico" ? "bg-red-500" :
                            estado === "Bajo"    ? "bg-amber-500" : "bg-emerald-500"
                          )} />
                        )}

                        <ChevronRight className={cn(
                          "h-3.5 w-3.5 flex-shrink-0 transition-opacity",
                          isSel ? "text-white/70 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                        )} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Panel derecho: inventario del cliente seleccionado ── */}
          <div className={cn(
            "flex-1 flex flex-col min-h-0 min-w-0",
            !selected && "hidden md:flex"
          )}>
            {/* Botón volver — solo móvil */}
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="md:hidden flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border-b bg-muted/5 flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a clientes
              </button>
            )}
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Warehouse className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">Selecciona un cliente</p>
                <p className="text-xs text-center max-w-xs opacity-70">
                  Elige un cliente del panel izquierdo para ver su inventario almacenado en bodega.
                </p>
              </div>
            ) : (
              <>
                {/* Cabecera del cliente seleccionado */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/5 flex-shrink-0">
                  <div>
                    <h3 className="text-sm font-bold">{selected.nombre}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {items.length} ítem{items.length !== 1 ? "s" : ""} en bodega
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="sm"
                      onClick={handleExport}
                      disabled={items.length === 0}
                      className="gap-1.5 text-xs h-7"
                    >
                      <Download className="h-3 w-3" />
                      Excel
                    </Button>
                    {getClienteEstado(items) && (
                      <Badge className={cn(
                        "text-[10px] px-2 py-0.5 border-0 font-semibold",
                        ESTADO_BADGE[getClienteEstado(items)!]
                      )}>
                        {getClienteEstado(items)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Tabla de ítems */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {loadingItems ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Package className="h-10 w-10 opacity-20" />
                      <p className="text-sm font-medium">Sin ítems registrados</p>
                      <Button size="sm" onClick={openNew} variant="outline" className="gap-1.5 text-xs">
                        <Plus className="h-3.5 w-3.5" /> Registrar primer ítem
                      </Button>
                    </div>
                  ) : (
                    <div className="h-full overflow-y-auto">
                      <table className="w-full text-sm table-fixed">
                        <colgroup>
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "32%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "17%" }} />
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "9%" }} />
                          <col style={{ width: "8%" }} />
                        </colgroup>
                        <thead className="sticky top-0 bg-muted/60 border-b z-10">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Código</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descripción</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Área</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categoría</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stock</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => {
                            const estado = getEstado(item)
                            return (
                              <tr key={item.id}
                                className={cn(
                                  "border-b last:border-0 hover:bg-muted/30 transition-colors group",
                                  idx % 2 !== 0 && "bg-muted/10"
                                )}
                              >
                                <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
                                  {codigo(item.numero)}
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-xs font-semibold truncate">{item.descripcion}</p>
                                  {(item.clase_imo || item.nu) && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {[
                                        item.clase_imo && `IMO ${item.clase_imo}`,
                                        item.nu        && `N° ONU ${item.nu}`,
                                      ].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className={cn(
                                    "text-[10px] px-1.5 py-0 border-0 font-medium",
                                    AREA_COLOR[item.area] ?? "bg-muted text-muted-foreground"
                                  )}>
                                    {item.area}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted-foreground truncate">
                                  {item.categoria}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-sm font-bold">{item.stock_actual}</span>
                                  <span className="text-[10px] text-muted-foreground ml-1">{item.unidad}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <Badge className={cn(
                                    "text-[10px] px-1.5 py-0 border-0 font-semibold",
                                    ESTADO_BADGE[estado]
                                  )}>
                                    {estado}
                                  </Badge>
                                </td>
                                <td className="px-2 py-3 text-center">
                                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => openEdit(item)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                      onClick={() => setDeleting(item)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Dialog: nuevo / editar ítem ── */}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === "new" ? "Registrar ítem de inventario" : "Editar ítem"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-1">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Descripción *
              </Label>
              <Input
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej: Contenedor 20' Clase IMO 3 — Metanol"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Categoría *
              </Label>
              <select
                value={form.categoria}
                onChange={e => setForm(p => ({ ...p, categoria: e.target.value as InventarioCategoria }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Área *
              </Label>
              <select
                value={form.area}
                onChange={e => setForm(p => ({ ...p, area: e.target.value as InventarioArea }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Clase IMO
              </Label>
              <Input
                value={form.clase_imo ?? ""}
                onChange={e => setForm(p => ({ ...p, clase_imo: e.target.value || null }))}
                placeholder="Ej: 3, 6.1, 8..."
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                N° ONU
              </Label>
              <Input
                value={form.nu ?? ""}
                onChange={e => setForm(p => ({ ...p, nu: e.target.value || null }))}
                placeholder="Ej: 1090"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Unidad
              </Label>
              <select
                value={form.unidad}
                onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Stock actual
              </Label>
              <Input
                type="number"
                min={0}
                value={form.stock_actual}
                onChange={e => setForm(p => ({ ...p, stock_actual: parseInt(e.target.value) || 0 }))}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Stock mínimo
              </Label>
              <Input
                type="number"
                min={0}
                value={form.stock_minimo}
                onChange={e => setForm(p => ({ ...p, stock_minimo: parseInt(e.target.value) || 0 }))}
                className="h-9"
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Observaciones
              </Label>
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
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={saving || !form.descripcion.trim()}
              onClick={handleSave}
              className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white"
            >
              {saving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />
              }
              {dialog === "new" ? "Registrar ítem" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmación de eliminación ── */}
      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold text-foreground">{deleting?.descripcion}</span> del inventario de este cliente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function InventarioPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <InventarioContent />
    </Suspense>
  )
}
