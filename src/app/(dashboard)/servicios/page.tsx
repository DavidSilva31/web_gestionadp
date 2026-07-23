"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Search, Wrench, Plus, Pencil, Trash2, Loader2,
  ChevronRight, GripVertical, Check, X, ArrowLeft,
} from "lucide-react"
import type { Cliente, ServicioCliente, ServicioClienteInsert } from "@/types/database"

// ── ServiceForm (inline add / edit) ──────────────────────────────────────────
function ServiceForm({
  clienteId,
  clienteNombre,
  existing,
  onSave,
  onCancel,
}: {
  clienteId: string
  clienteNombre: string
  existing: ServicioCliente | null
  onSave: (s: ServicioCliente) => void
  onCancel: () => void
}) {
  const { user, profile } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nombre:      existing?.nombre      ?? "",
    descripcion: existing?.descripcion ?? "",
    tarifa_uf:   existing?.tarifa_uf   != null ? String(existing.tarifa_uf) : "",
    unidad:      existing?.unidad      ?? "unidad",
    orden:       existing?.orden       ?? 0,
  })

  const field = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  async function handleSave() {
    if (!form.nombre.trim()) return
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    const payload: ServicioClienteInsert = {
      cliente_id:  clienteId,
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      tarifa_uf:   parseFloat(form.tarifa_uf) || null,
      unidad:      form.unidad.trim() || "unidad",
      orden:       Number(form.orden) || 0,
      activo:      true,
    }
    let data, error
    if (existing) {
      ;({ data, error } = await supabase
        .from("servicios_cliente").update(payload).eq("id", existing.id).select().single())
    } else {
      ;({ data, error } = await supabase
        .from("servicios_cliente").insert(payload).select().single())
    }
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    if (data) {
      logAudit({
        tabla:          "servicios_cliente",
        registro_id:    data.id,
        accion:         existing ? "servicio.actualizar" : "servicio.crear",
        descripcion:    `Servicio ${payload.nombre} ${existing ? "actualizado" : "creado"} — ${clienteNombre}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      onSave(data as ServicioCliente)
    }
  }

  const inp = "h-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1"
  const lbl = "text-[11px] text-muted-foreground"

  return (
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
      <p className="text-[12px] font-semibold text-primary">
        {existing ? "Editar servicio" : "Nuevo servicio"}
      </p>

      <div className="space-y-1">
        <Label className={lbl}>Nombre del servicio *</Label>
        <Input className={inp} value={form.nombre} onChange={field("nombre")}
          placeholder="Ej: Paletizado sin provisión de pallets" />
      </div>

      <div className="space-y-1">
        <Label className={lbl}>Descripción (opcional)</Label>
        <Input className={inp} value={form.descripcion} onChange={field("descripcion")}
          placeholder="Descripción detallada para el HES" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className={lbl}>Tarifa (UF/unidad)</Label>
          <Input className={inp} type="number" step="0.0001" value={form.tarifa_uf}
            onChange={field("tarifa_uf")} placeholder="0.0000" />
        </div>
        <div className="space-y-1">
          <Label className={lbl}>Unidad</Label>
          <Input className={inp} value={form.unidad} onChange={field("unidad")}
            placeholder="pallet / cont. / hora" />
        </div>
        <div className="space-y-1">
          <Label className={lbl}>Orden</Label>
          <Input className={inp} type="number" value={form.orden} onChange={field("orden")}
            placeholder="0" />
        </div>
      </div>

      {saveError && (
        <p className="text-[11px] text-destructive">{saveError}</p>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-[12px]">
          <X className="h-3 w-3 mr-1" /> Cancelar
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.nombre.trim()}
          className="h-7 text-[12px]">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
          {existing ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </div>
  )
}

// ── ServiceCard ────────────────────────────────────────────────────────────────
function ServiceCard({
  srv, clienteNombre, onEdit, onDelete,
}: {
  srv: ServicioCliente
  clienteNombre: string
  onEdit: () => void
  onDelete: () => void
}) {
  const { user, profile } = useAuth()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`¿Eliminar servicio "${srv.nombre}"?`)) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from("servicios_cliente").update({ activo: false }).eq("id", srv.id)
    setDeleting(false)
    if (error) { alert("Error al eliminar: " + error.message); return }
    logAudit({
      tabla:          "servicios_cliente",
      registro_id:    srv.id,
      accion:         "servicio.eliminar",
      descripcion:    `Servicio ${srv.nombre} eliminado — ${clienteNombre}`,
      usuario_id:     user?.id,
      usuario_nombre: profile?.nombre ?? user?.email,
    })
    onDelete()
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/20 hover:bg-muted/20 group">
      <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate">{srv.nombre}</p>
        {srv.descripcion && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{srv.descripcion}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {srv.tarifa_uf != null && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {srv.tarifa_uf.toFixed(4)} UF / {srv.unidad}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}
          className="h-6 w-6 p-0 hover:bg-primary/10 hover:text-primary">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive">
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ServiciosPage() {
  const [clientes,       setClientes]       = useState<Cliente[]>([])
  const [search,         setSearch]         = useState("")
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [servicios,      setServicios]      = useState<ServicioCliente[]>([])
  const [loadingClientes,setLoadingClientes]= useState(true)
  const [loadingSrvs,    setLoadingSrvs]    = useState(false)
  const [addingNew,      setAddingNew]      = useState(false)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [servicioMap,    setServicioMap]    = useState<Record<string, number>>({})

  const selectedCliente = useMemo(
    () => clientes.find(c => c.id === selectedId) ?? null,
    [clientes, selectedId]
  )

  // ── Load clients ────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("clientes").select("id, nombre, rut").eq("activo", true).order("nombre"),
      supabase.from("servicios_cliente").select("cliente_id").eq("activo", true),
    ]).then(([{ data: cls }, { data: srvs }]) => {
      setClientes((cls ?? []) as Cliente[])
      const map: Record<string, number> = {}
      for (const s of srvs ?? []) map[s.cliente_id] = (map[s.cliente_id] ?? 0) + 1
      setServicioMap(map)
      setLoadingClientes(false)
    })
  }, [])

  // ── Load services for selected client ───────────────────────────────────────
  const loadServicios = useCallback(async () => {
    if (!selectedId) { setServicios([]); return }
    setLoadingSrvs(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("servicios_cliente")
      .select("*")
      .eq("cliente_id", selectedId)
      .eq("activo", true)
      .order("orden")
      .order("nombre")
    setServicios((data ?? []) as ServicioCliente[])
    setLoadingSrvs(false)
  }, [selectedId])

  useEffect(() => {
    setAddingNew(false)
    setEditingId(null)
    loadServicios()
  }, [loadServicios])

  const filteredClientes = useMemo(
    () => clientes.filter(c =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) || c.rut.includes(search)
    ),
    [clientes, search]
  )

  function handleSaved(srv: ServicioCliente) {
    setAddingNew(false)
    setEditingId(null)
    loadServicios()
    // Reload count from DB to keep badge accurate on both create and edit
    createClient()
      .from("servicios_cliente")
      .select("*", { count: "exact", head: true })
      .eq("cliente_id", srv.cliente_id)
      .eq("activo", true)
      .then(({ count }) => {
        if (count !== null) setServicioMap(m => ({ ...m, [srv.cliente_id]: count }))
      })
  }

  function handleDeleted(srvId: string) {
    setServicios(prev => prev.filter(s => s.id !== srvId))
    if (selectedId) {
      setServicioMap(m => ({ ...m, [selectedId]: Math.max((m[selectedId] ?? 1) - 1, 0) }))
    }
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">

      {/* ── Panel izquierdo: clientes ─────────────────────────────────────── */}
      <div className={cn(
        "w-full md:w-64 flex-shrink-0 border-b md:border-b-0 md:border-r border-border/60 flex flex-col bg-background",
        selectedId ? "hidden md:flex" : "flex"
      )}>
        <div className="p-3 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="h-8 pl-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1 rounded-lg" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingClientes ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filteredClientes.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/20",
                selectedId === c.id
                  ? "bg-primary/8 border-l-2 border-l-primary"
                  : "hover:bg-muted/40"
              )}>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[12px] font-medium truncate", selectedId === c.id && "text-primary")}>
                  {c.nombre}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{c.rut}</p>
              </div>
              {(servicioMap[c.id] ?? 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 flex-shrink-0">
                  {servicioMap[c.id]}
                </Badge>
              )}
              {selectedId === c.id && (
                <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border/40 text-[10px] text-muted-foreground">
          {clientes.length} clientes
        </div>
      </div>

      {/* ── Panel derecho ─────────────────────────────────────────────────── */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden",
        !selectedCliente && "hidden md:flex"
      )}>
        {/* Botón volver — solo móvil */}
        {selectedCliente && (
          <button
            onClick={() => setSelectedId(null)}
            className="md:hidden flex items-center gap-1.5 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border-b border-border/40 bg-muted/5 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a clientes
          </button>
        )}
        {!selectedCliente ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Wrench className="h-12 w-12 opacity-20" />
            <p className="text-sm">Selecciona un cliente para gestionar sus servicios</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 flex-shrink-0">
              <div>
                <h2 className="text-[14px] font-bold tracking-tight">{selectedCliente.nombre}</h2>
                <p className="text-[11px] text-muted-foreground">RUT {selectedCliente.rut}</p>
              </div>
              <Button size="sm" onClick={() => { setAddingNew(true); setEditingId(null) }}
                disabled={addingNew}
                className="h-7 gap-1.5 text-[12px]">
                <Plus className="h-3 w-3" /> Agregar servicio
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingSrvs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {/* Add form */}
                  {addingNew && (
                    <ServiceForm
                      clienteId={selectedCliente.id}
                      clienteNombre={selectedCliente.nombre}
                      existing={null}
                      onSave={handleSaved}
                      onCancel={() => setAddingNew(false)}
                    />
                  )}

                  {/* Services list */}
                  {servicios.length === 0 && !addingNew ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                      <Wrench className="h-8 w-8 opacity-20" />
                      <p className="text-sm">Sin servicios configurados</p>
                      <p className="text-xs">Agrega los servicios especiales de este cliente para que aparezcan en el HES</p>
                      <Button size="sm" variant="outline" onClick={() => setAddingNew(true)}
                        className="mt-1 h-7 gap-1.5 text-[12px]">
                        <Plus className="h-3 w-3" /> Agregar primer servicio
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
                        <Wrench className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[12px] font-semibold">
                          Servicios — {servicios.length} configurados
                        </span>
                      </div>

                      {servicios.map(srv => (
                        <div key={srv.id}>
                          {editingId === srv.id ? (
                            <div className="p-3">
                              <ServiceForm
                                clienteId={selectedCliente.id}
                                clienteNombre={selectedCliente.nombre}
                                existing={srv}
                                onSave={s => { handleSaved(s); loadServicios() }}
                                onCancel={() => setEditingId(null)}
                              />
                            </div>
                          ) : (
                            <ServiceCard
                              srv={srv}
                              clienteNombre={selectedCliente.nombre}
                              onEdit={() => { setEditingId(srv.id); setAddingNew(false) }}
                              onDelete={() => handleDeleted(srv.id)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Info box */}
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">¿Cómo funcionan los servicios?</p>
                    <p>Los servicios configurados aquí aparecerán automáticamente en el HES del cliente como filas adicionales en el resumen de cobro y columnas en el log diario del Excel.</p>
                    <p>Al generar el HES, podrás ingresar la cantidad mensual de cada servicio.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
