"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Wrench, Plus, Minus, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { resolveEffectiveClienteId, type InventarioItemOption } from "@/lib/inventario"
import { ItemFormDialog } from "@/components/inventario/item-form-dialog"
import { Field } from "./report-form-sections"
import type { BodegajeItemFormData } from "./report-form-types"

// Widgets compartidos entre reports/nuevo y reports/[id] — misma vista para
// crear y editar un report, ambos con el mismo vínculo real a cliente/
// tarifa/inventario/servicios.

export interface ClienteOption { id: string; nombre: string; rut: string | null }

export function ClienteCombobox({ value, onChange, onChangeId, readOnly }: {
  value: string
  onChange: (nombre: string) => void
  onChangeId: (id: string) => void
  readOnly?: boolean
}) {
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient()
      .from("clientes")
      .select("id, nombre, rut")
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .then(({ data }) => { if (data) setClientes(data as ClienteOption[]) })
  }, [])

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = query
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(query.toLowerCase()) ||
        (c.rut?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
    : clientes

  function select(c: ClienteOption) {
    setQuery(c.nombre)
    onChange(c.nombre)
    onChangeId(c.id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onChangeId(""); setOpen(true) }}
        onFocus={() => !readOnly && setOpen(true)}
        placeholder="Seleccionar o escribir cliente"
        className="h-8 text-xs"
        autoComplete="off"
        disabled={readOnly}
      />
      {open && !readOnly && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(c)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted text-left transition-colors"
            >
              <span className="font-medium text-foreground truncate">{c.nombre}</span>
              <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">{c.rut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Catálogo real en empresas_transporte (no una lista fija) — mismo patrón
// de sugerencia que ClienteCombobox, sin bloquear texto libre: una empresa
// nueva que se escriba y guarde en un report queda además insertada acá
// (ver handleSave en reports/nuevo y reports/[id]) y aparece como sugerencia
// en los próximos reports. Cada opción tiene su propio ícono de eliminar
// (desactiva la fila, no borra los reports que ya la usan).
export interface EmpresaTransporteOption { id: string; nombre: string }

export function EmpresaTransporteCombobox({ value, onChange, readOnly }: {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
}) {
  const [empresas, setEmpresas] = useState<EmpresaTransporteOption[]>([])
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState(value)
  const [deleting,     setDeleting]     = useState<EmpresaTransporteOption | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function fetchEmpresas() {
    createClient()
      .from("empresas_transporte")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .then(({ data }) => { if (data) setEmpresas(data as EmpresaTransporteOption[]) })
  }

  useEffect(() => { fetchEmpresas() }, [])
  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = query
    ? empresas.filter(e => e.nombre.includes(query.toUpperCase()))
    : empresas

  function select(nombre: string) {
    setQuery(nombre)
    onChange(nombre)
    setOpen(false)
  }

  async function handleDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    setDeleteError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("empresas_transporte").update({ activo: false }).eq("id", deleting.id)
      if (error) { setDeleteError(error.message); return }
      setEmpresas(prev => prev.filter(e => e.id !== deleting.id))
      if (query === deleting.nombre) { setQuery(""); onChange("") }
      setDeleting(null)
    } catch (err) {
      console.error("[EmpresaTransporteCombobox] error eliminando:", err)
      setDeleteError("Ocurrió un error inesperado al eliminar.")
    } finally {
      setDeletingBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); setOpen(true) }}
        onFocus={() => !readOnly && setOpen(true)}
        placeholder="Seleccionar o escribir empresa"
        className="h-8 text-xs"
        autoComplete="off"
        disabled={readOnly}
      />
      {open && !readOnly && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(e => (
            <div key={e.id} className="group flex items-center justify-between hover:bg-muted transition-colors">
              <button
                type="button"
                onMouseDown={ev => ev.preventDefault()}
                onClick={() => select(e.nombre)}
                className="flex-1 min-w-0 px-3 py-2 text-xs text-left truncate"
              >
                {e.nombre}
              </button>
              <button
                type="button"
                onMouseDown={ev => ev.preventDefault()}
                onClick={ev => { ev.stopPropagation(); setDeleting(e) }}
                className="px-2.5 py-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-colors flex-shrink-0"
                aria-label={`Eliminar ${e.nombre}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={o => { if (!o) { setDeleting(null); setDeleteError(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-4 w-4 text-destructive" />
              </span>
              Eliminar empresa de transporte
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold text-foreground">{deleting?.nombre}</span> de la lista de sugerencias.
              Los reports que ya la usan no se ven afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90 gap-1.5"
            >
              {deletingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Tarifa/contrato: antes se elegía a mano acá (clientes con más de un
// contrato en paralelo, ej. PROQUIMIN). Ahora se deriva sola en reports/[id]
// comparando la Clase IMO del producto elegido en Bodegaje contra la Clase
// IMO de cada tarifa del cliente — mismo dato, dos tablas — así que este
// tipo solo queda para tipar esa lista, sin selector propio.
export interface TarifaOption { id: string; clase_imo: string | null; cotizacion_numero: string }

export function ProductoCombobox({ clienteId, value, onChange, onSelect, onClear, readOnly }: {
  clienteId: string
  value: string
  onChange: (v: string) => void
  onSelect: (item: InventarioItemOption) => void
  onClear: () => void
  readOnly?: boolean
}) {
  const [items,  setItems]  = useState<InventarioItemOption[]>([])
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState(value)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Al cerrar el dialog de "Nuevo producto" el foco vuelve al input y su
  // onFocus reabriría el dropdown justo después de elegir/crear — se
  // suprime esa única reapertura.
  const suppressFocusOpen = useRef(false)

  useEffect(() => {
    setItems([])
    if (!clienteId) return
    const supabase = createClient()
    resolveEffectiveClienteId(supabase, clienteId).then(effectiveId => supabase
      .from("inventario_items")
      .select("id, descripcion, clase_imo, nu")
      .eq("cliente_id", effectiveId)
      .eq("activo", true)
      .order("descripcion", { ascending: true })
      .then(({ data }) => { if (data) setItems(data as InventarioItemOption[]) }))
  }, [clienteId])

  // Sincronizar query si el valor externo cambia (ej: al limpiar)
  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = query
    ? items.filter(i => i.descripcion.toLowerCase().includes(query.toLowerCase()))
    : items

  function select(item: InventarioItemOption) {
    setQuery(item.descripcion)
    onChange(item.descripcion)
    onSelect(item)
    setOpen(false)
  }

  function handleCreado(item: InventarioItemOption) {
    setItems(prev => [...prev, item].sort((a, b) => a.descripcion.localeCompare(b.descripcion)))
    suppressFocusOpen.current = true
    select(item)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onClear(); setOpen(true) }}
        onFocus={() => {
          if (suppressFocusOpen.current) { suppressFocusOpen.current = false; return }
          if (!readOnly) setOpen(true)
        }}
        placeholder={clienteId ? "Buscar producto en inventario..." : "Selecciona un cliente primero"}
        className="h-8 text-xs"
        autoComplete="off"
        disabled={readOnly}
      />
      {open && !readOnly && clienteId && (filtered.length > 0 || query.length > 0) && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(item)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted text-left transition-colors"
            >
              <span className="font-medium text-foreground truncate">{item.descripcion}</span>
              {item.clase_imo && (
                <span className="text-[10px] font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  Cl. {item.clase_imo}{item.nu ? ` · UN ${item.nu}` : ""}
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && query.length > 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin coincidencias en Inventario</p>
          )}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setNuevoOpen(true); setOpen(false) }}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-primary hover:bg-muted text-left transition-colors border-t"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo producto{query ? ` "${query}"` : ""}
          </button>
        </div>
      )}
      <ItemFormDialog
        clienteId={clienteId}
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        onCreated={handleCreado}
        initialDescripcion={query}
      />
    </div>
  )
}

// Deriva si una tarifa cubre la Clase IMO de un producto — compara el texto
// libre de Clase IMO de la tarifa (ej. "Clases 2.1, 2.2, 2.3 y 3") contra el
// valor exacto de Clase IMO del producto. Antes vivía en reports/[id]/page.tsx
// para el único producto del report; ahora se aplica por línea acá.
export function tarifaCubreClase(tarifaClase: string | null, itemClase: string | null): boolean {
  if (!tarifaClase || !itemClase) return false
  const tokens = tarifaClase.replace(/clases?/gi, "").split(/,| y /i).map(t => t.trim()).filter(Boolean)
  return tokens.includes(itemClase.trim())
}

// Lista repetible de productos de Bodegaje — un report puede tener varios,
// cada uno con su propia tarifa derivada de su Clase IMO (ver
// tarifaCubreClase). Reutiliza ProductoCombobox sin cambios, una instancia
// por fila. Hora inicio/término, Servicios y Observaciones son de la
// sección completa y viven en Sec3Content, no acá.
export function BodegajeItemsList({ clienteId, items, onChange, onAdd, onRemove, tarifasCliente, readOnly }: {
  clienteId: string
  items: BodegajeItemFormData[]
  onChange: (index: number, patch: Partial<BodegajeItemFormData>) => void
  onAdd: () => void
  onRemove: (index: number) => void
  tarifasCliente: TarifaOption[]
  readOnly?: boolean
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin productos agregados.</p>
      )}
      {items.map((item, index) => (
        <div key={item.id ?? `nuevo-${index}`} className="relative border border-border/60 rounded-lg p-2.5 space-y-2 bg-muted/20">
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              aria-label="Quitar producto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="pr-6">
            <Field label="Producto">
              <ProductoCombobox
                clienteId={clienteId}
                value={item.sec3_producto}
                onChange={v => onChange(index, { sec3_producto: v })}
                onSelect={selected => onChange(index, {
                  sec3_inventario_item_id: selected.id,
                  sec3_producto:           selected.descripcion,
                  sec3_clase_imo:          selected.clase_imo ?? "",
                  sec3_nu:                 selected.nu ?? "",
                  tarifa_cliente_id: tarifasCliente.find(t => tarifaCubreClase(t.clase_imo, selected.clase_imo))?.id ?? "",
                })}
                onClear={() => onChange(index, {
                  sec3_inventario_item_id: "", sec3_clase_imo: "", sec3_nu: "", tarifa_cliente_id: "",
                })}
                readOnly={readOnly}
              />
            </Field>
            {item.sec3_producto.trim() && !item.sec3_inventario_item_id && (
              <p className="text-[10px] text-amber-600 mt-1">
                No vinculado al catálogo — este producto no actualizará el stock.
              </p>
            )}
            {item.sec3_inventario_item_id && tarifasCliente.length > 1 && !item.tarifa_cliente_id && (
              <p className="text-[10px] text-amber-600 mt-1">
                Ningún contrato de este cliente coincide con la Clase IMO &quot;{item.sec3_clase_imo || "—"}&quot; — revisa antes de enviar a despacho.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Field label="Clase IMO">
              <Input value={item.sec3_clase_imo} onChange={e => onChange(index, { sec3_clase_imo: e.target.value })}
                placeholder="Clase IMO si aplica" className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="NU">
              <Input value={item.sec3_nu} onChange={e => onChange(index, { sec3_nu: e.target.value })}
                className="h-8 text-xs font-mono" disabled={readOnly} />
            </Field>
            <Field label="N° Bodega">
              <Input value={item.sec3_numero_bodega} onChange={e => onChange(index, { sec3_numero_bodega: e.target.value })}
                placeholder="Número de bodega" className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="N° Pallets">
              <Input type="number" min={0} value={item.sec3_numero_pallets}
                onChange={e => onChange(index, { sec3_numero_pallets: e.target.value })}
                placeholder="0" className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="N° Unidades">
              <Input type="number" min={0} value={item.sec3_numero_unidades}
                onChange={e => onChange(index, { sec3_numero_unidades: e.target.value })}
                placeholder="0" className="h-8 text-xs" disabled={readOnly} />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Field label="Lote">
              <Input value={item.sec3_lote} onChange={e => onChange(index, { sec3_lote: e.target.value })}
                placeholder="N° de lote" className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="CAS">
              <Input value={item.sec3_cas} onChange={e => onChange(index, { sec3_cas: e.target.value })}
                className="h-8 text-xs font-mono" disabled={readOnly} />
            </Field>
            <Field label="OC">
              <Input value={item.sec3_orden_compra} onChange={e => onChange(index, { sec3_orden_compra: e.target.value })}
                placeholder="Orden de compra" className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="Elab.">
              <Input type="date" value={item.sec3_fecha_elaboracion}
                onChange={e => onChange(index, { sec3_fecha_elaboracion: e.target.value })} className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="Venc.">
              <Input type="date" value={item.sec3_fecha_vencimiento}
                onChange={e => onChange(index, { sec3_fecha_vencimiento: e.target.value })} className="h-8 text-xs" disabled={readOnly} />
            </Field>
          </div>
        </div>
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd} className="gap-1.5 text-xs h-7">
          <Plus className="h-3.5 w-3.5" /> Agregar producto
        </Button>
      )}
    </div>
  )
}

export interface ServicioOption { id: string; nombre: string; unidad: string; tarifa_uf: number | null; tarifa_clp: number | null }
export interface ServicioSeleccionado { id: string; cantidad: number }

// Precarga los servicios del catálogo del cliente (servicios_cliente) — para
// clientes sin catálogo aún, solo queda la opción de agregar manualmente.
// La selección de esta sección se guarda en el report (servicios_ids /
// servicios_manual) para usarse cuando se genere el HES. Sin tarifas acá —
// esta vista no muestra costos. Acordeón colapsado por defecto.
export function ServiciosSection({
  clienteId, selected, onToggle, onCantidadChange, manual, onAddManual, onRemoveManual, readOnly,
}: {
  clienteId: string
  selected: ServicioSeleccionado[]
  onToggle: (id: string) => void
  onCantidadChange: (id: string, cantidad: number) => void
  manual: string[]
  onAddManual: (nombre: string) => void
  onRemoveManual: (index: number) => void
  readOnly?: boolean
}) {
  const [servicios, setServicios] = useState<ServicioOption[]>([])
  const [loading,   setLoading]   = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [manualInput, setManualInput] = useState("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setServicios([])
    setFetchError(false)
    if (!clienteId) return
    setLoading(true)
    createClient()
      .from("servicios_cliente")
      .select("id, nombre, unidad, tarifa_uf, tarifa_clp")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      // Transporte se cobra por viaje en el módulo Transporte Incomex, no
      // acá — mezclarlo acá arriesgaba cobrarlo dos veces en el HES.
      .eq("categoria", "otro")
      .order("orden")
      .then(({ data, error }) => {
        if (error) console.error("[reports] error obteniendo servicios del cliente:", error)
        setServicios((data as ServicioOption[]) ?? [])
        setFetchError(!!error)
        setLoading(false)
      })
  }, [clienteId])

  function addManual() {
    const v = manualInput.trim()
    if (!v) return
    onAddManual(v.toUpperCase())
    setManualInput("")
  }

  const totalSeleccionado = selected.length + manual.length

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 mb-1.5"
      >
        <h2 className="text-[13px] font-bold text-foreground flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" /> Servicios asociados
          {totalSeleccionado > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">({totalSeleccionado} seleccionado{totalSeleccionado > 1 ? "s" : ""})</span>
          )}
        </h2>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
      <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2">
        {!clienteId ? (
          <p className="text-[11px] text-muted-foreground">Selecciona un cliente para ver sus servicios.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando servicios del cliente...
          </div>
        ) : fetchError ? (
          <p className="text-[11px] text-destructive">No se pudo cargar el catálogo de servicios del cliente — intenta de nuevo antes de agregar manualmente.</p>
        ) : servicios.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Este cliente aún no tiene servicios en catálogo{!readOnly && " — agrégalos manualmente abajo"}.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {servicios.map(s => {
              const sel = selected.find(x => x.id === s.id)
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <label className={cn("flex items-center gap-2 flex-1 min-w-0", readOnly ? "cursor-default" : "cursor-pointer")}>
                    <Checkbox
                      checked={!!sel}
                      onCheckedChange={() => !readOnly && onToggle(s.id)}
                      disabled={readOnly}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-foreground/90 truncate">{s.nombre}</span>
                  </label>
                  {sel && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onCantidadChange(s.id, Math.max(1, sel.cantidad - 1))}
                        className="h-5 w-5 flex items-center justify-center rounded border border-input text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                      <span className="w-5 text-center tabular-nums">{sel.cantidad}</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => onCantidadChange(s.id, sel.cantidad + 1)}
                        className="h-5 w-5 flex items-center justify-center rounded border border-input text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {manual.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {manual.map((m, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal gap-1 pr-1">
                {m}
                {!readOnly && (
                  <button type="button" onClick={() => onRemoveManual(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Input
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addManual() } }}
              placeholder="Agregar servicio manual (no está en el catálogo)"
              className="h-7 text-[11px]"
            />
            <Button type="button" variant="outline" size="sm" onClick={addManual} className="h-7 px-2 gap-1 text-[11px] flex-shrink-0">
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// ── FirmaCanvas ──────────────────────────────────────────────────────────────
// Firma del conductor en tablet/lápiz óptico. Componente "no controlado" a
// propósito — no recibe la firma ya guardada como prop: cuando el report ya
// tiene una firma en BD, el padre la muestra por separado como imagen
// (mismo patrón que la evidencia fotográfica ya subida vs. la nueva por
// adjuntar) y solo renderiza este canvas para capturar una firma nueva.
export function FirmaCanvas({ onChange, readOnly }: {
  onChange: (dataUrl: string | null) => void
  readOnly?: boolean
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || !drawingRef.current) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1e293b"
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function handlePointerUp() {
    if (readOnly || !drawingRef.current) return
    drawingRef.current = false
    setHasStroke(true)
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL("image/png"))
  }

  function handleClear() {
    if (readOnly) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("relative rounded-lg border-2 border-dashed border-muted-foreground/25 overflow-hidden", readOnly && "opacity-60")}>
        <canvas
          ref={canvasRef}
          width={700}
          height={200}
          className={cn("w-full h-[170px] touch-none bg-white", readOnly ? "cursor-not-allowed" : "cursor-crosshair")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {!hasStroke && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/70 pointer-events-none px-4 text-center">
            {readOnly ? "Firma bloqueada — el report ya no admite cambios" : "Firma aquí — el conductor firma con el dedo o lápiz óptico"}
          </p>
        )}
      </div>
      {!readOnly && hasStroke && (
        <button type="button" onClick={handleClear} className="self-end text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
          Limpiar firma
        </button>
      )}
    </div>
  )
}
