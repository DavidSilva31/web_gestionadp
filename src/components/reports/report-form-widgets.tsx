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

// Formatea un RUT chileno mientras se escribe: XX.XXX.XXX-X.
export function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase()
  if (clean.length <= 1) return clean
  const body     = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const verifier = clean.slice(-1)
  return `${body}-${verifier}`
}

// Catálogo real en conductores (mismo patrón que EmpresaTransporteCombobox):
// un chofer siempre tiene el mismo RUT aunque cambie de camión, así que
// registrarlo una vez alcanza para autocompletar en los próximos reports —
// elegir uno de los dos campos (nombre o RUT) rellena el otro solo. Se
// guarda (upsert por RUT) recién al enviar a Operaciones, ver handleSave en
// reports/nuevo y reports/[id].
export interface ConductorOption { id: string; nombre: string; rut: string }

export function ConductorComboboxes({
  conductor, rutConductor, onChangeConductor, onChangeRutConductor, readOnly,
}: {
  conductor: string
  rutConductor: string
  onChangeConductor: (v: string) => void
  onChangeRutConductor: (v: string) => void
  readOnly?: boolean
}) {
  const [conductores, setConductores] = useState<ConductorOption[]>([])
  const [openNombre, setOpenNombre] = useState(false)
  const [openRut,    setOpenRut]    = useState(false)
  const refNombre = useRef<HTMLDivElement>(null)
  const refRut    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient()
      .from("conductores")
      .select("id, nombre, rut")
      .order("nombre", { ascending: true })
      .then(({ data }) => { if (data) setConductores(data as ConductorOption[]) })
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (refNombre.current && !refNombre.current.contains(e.target as Node)) setOpenNombre(false)
      if (refRut.current && !refRut.current.contains(e.target as Node)) setOpenRut(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function select(c: ConductorOption) {
    onChangeConductor(c.nombre)
    onChangeRutConductor(c.rut)
    setOpenNombre(false)
    setOpenRut(false)
  }

  const filteredByNombre = conductor
    ? conductores.filter(c => c.nombre.toUpperCase().includes(conductor.toUpperCase()))
    : conductores
  const filteredByRut = rutConductor
    ? conductores.filter(c => c.rut.includes(rutConductor))
    : conductores

  return (
    <>
      <Field label="Conductor" required>
        <div ref={refNombre} className="relative">
          <Input
            value={conductor}
            onChange={e => { onChangeConductor(e.target.value.toUpperCase()); setOpenNombre(true) }}
            onFocus={() => !readOnly && setOpenNombre(true)}
            placeholder="Nombre completo"
            className="h-8 text-xs"
            autoComplete="off"
            disabled={readOnly}
          />
          {openNombre && !readOnly && filteredByNombre.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {filteredByNombre.map(c => (
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
      </Field>
      <Field label="RUT conductor" required>
        <div ref={refRut} className="relative">
          <Input
            value={rutConductor}
            onChange={e => { onChangeRutConductor(formatRut(e.target.value)); setOpenRut(true) }}
            onFocus={() => !readOnly && setOpenRut(true)}
            placeholder="12.345.678-9"
            className="h-8 text-xs font-mono"
            autoComplete="off"
            disabled={readOnly}
          />
          {openRut && !readOnly && filteredByRut.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {filteredByRut.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => select(c)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted text-left transition-colors"
                >
                  <span className="font-mono text-foreground flex-shrink-0">{c.rut}</span>
                  <span className="text-muted-foreground truncate">{c.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
    </>
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
  // inventario_items no tiene columna SKU propia — el código vive en
  // movimientos (se carga al registrar el ítem o se edita inline en
  // Detalle). skuPorItem guarda el SKU más reciente de cada ítem, solo para
  // mostrarlo acá; si un ítem nunca tuvo un movimiento con código, queda
  // sin entrada y no se muestra nada.
  const [items,  setItems]  = useState<InventarioItemOption[]>([])
  const [skuPorItem, setSkuPorItem] = useState<Record<string, string>>({})
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState(value)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  // SKU del producto actualmente seleccionado — se muestra pegado al nombre
  // en el input mientras no se está buscando/editando (ver value del Input
  // más abajo), igual que ya se ve en cada opción del desplegable.
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // Al cerrar el dialog de "Nuevo producto" el foco vuelve al input y su
  // onFocus reabriría el dropdown justo después de elegir/crear — se
  // suprime esa única reapertura.
  const suppressFocusOpen = useRef(false)

  useEffect(() => {
    setItems([])
    setSkuPorItem({})
    if (!clienteId) return
    const supabase = createClient()
    resolveEffectiveClienteId(supabase, clienteId).then(effectiveId => {
      supabase
        .from("inventario_items")
        .select("id, descripcion, clase_imo, nu")
        .eq("cliente_id", effectiveId)
        .eq("activo", true)
        .order("descripcion", { ascending: true })
        .then(({ data }) => { if (data) setItems(data as InventarioItemOption[]) })

      supabase
        .from("movimientos")
        .select("inventario_item_id, codigo, fecha")
        .eq("cliente_id", effectiveId)
        .not("inventario_item_id", "is", null)
        .not("codigo", "is", null)
        .order("fecha", { ascending: false })
        .then(({ data }) => {
          if (!data) return
          const map: Record<string, string> = {}
          for (const m of data as { inventario_item_id: string; codigo: string }[]) {
            if (!map[m.inventario_item_id]) map[m.inventario_item_id] = m.codigo
          }
          setSkuPorItem(map)
        })
    })
  }, [clienteId])

  // Sincronizar query si el valor externo cambia (ej: al limpiar, o al
  // cargar un report ya guardado) — también resuelve el SKU a mostrar
  // buscando el ítem por nombre una vez que items/skuPorItem terminan de
  // cargar (llegan async, después de que value ya pudo estar seteado).
  useEffect(() => {
    setQuery(value)
    if (!value) { setSelectedSku(null); return }
    const match = items.find(i => i.descripcion === value)
    setSelectedSku(match ? (skuPorItem[match.id] ?? null) : null)
  }, [value, items, skuPorItem])

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
    setSelectedSku(skuPorItem[item.id] ?? null)
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
        value={!open && selectedSku ? `${query} · SKU ${selectedSku}` : query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onClear(); setSelectedSku(null); setOpen(true) }}
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
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{item.descripcion}</span>
                {skuPorItem[item.id] && (
                  <span className="text-muted-foreground"> · SKU {skuPorItem[item.id]}</span>
                )}
              </span>
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
        compact
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
// Sugiere los lotes ya existentes del producto elegido (mismo criterio que
// el filtro de Lote en Inventario > Detalle: lotes distintos presentes en
// sus movimientos) — texto libre igual, por si el lote es nuevo.
//
// Se busca por inventario_item_id O por carga=descripción: los movimientos
// que genera el despacho de un report (create_movimiento_from_report) no
// llevan inventario_item_id seteado —queda NULL a propósito, para que el
// trigger de stock no cuente el mismo movimiento dos veces— así que buscar
// solo por inventario_item_id se perdería justo los lotes reales de
// ingresos/despachos ya hechos, y solo mostraría los de altas manuales.
function LoteField({ inventarioItemId, carga, value, onChange, disabled }: {
  inventarioItemId: string
  carga: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [lotes, setLotes] = useState<string[]>([])
  const [open,  setOpen]  = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cargaTrim = carga.trim()
    if (!inventarioItemId && !cargaTrim) { setLotes([]); return }
    // Dos queries separadas (no .or()) para no tener que escapar `carga`,
    // que suele traer paréntesis (ej. "HIPOCLORITO (IBC)") — rompería el
    // filtro de PostgREST si fuera texto crudo dentro de un .or(...).
    const supabase = createClient()
    Promise.all([
      inventarioItemId
        ? supabase.from("movimientos").select("lote").eq("inventario_item_id", inventarioItemId).eq("oculto", false).not("lote", "is", null)
        : Promise.resolve({ data: [] as { lote: string | null }[] }),
      cargaTrim
        ? supabase.from("movimientos").select("lote").eq("carga", cargaTrim).eq("oculto", false).not("lote", "is", null)
        : Promise.resolve({ data: [] as { lote: string | null }[] }),
    ]).then(([a, b]) => {
      const set = new Set<string>()
      for (const m of [...(a.data ?? []), ...(b.data ?? [])]) if (m.lote) set.add(m.lote)
      setLotes([...set].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })))
    })
  }, [inventarioItemId, carga])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = value ? lotes.filter(l => l.toLowerCase().includes(value.toLowerCase())) : lotes

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => !disabled && lotes.length > 0 && setOpen(true)}
        placeholder="N° de lote"
        className="h-8 text-xs"
        autoComplete="off"
        disabled={disabled}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(l => (
            <button
              key={l}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(l); setOpen(false) }}
              className="w-full px-3 py-1.5 text-xs text-left font-mono hover:bg-muted transition-colors"
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
              <LoteField
                inventarioItemId={item.sec3_inventario_item_id}
                carga={item.sec3_producto}
                value={item.sec3_lote}
                onChange={v => onChange(index, { sec3_lote: v })}
                disabled={readOnly}
              />
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

// Formatos de imagen que el navegador decodifica de forma nativa vía
// <img>/Image() — basta con esto para poder dibujarla en el canvas, no hace
// falta una lista de MIME exacta (algunos navegadores no la setean bien en
// el drag&drop, así que se valida sobre todo por extensión).
const FIRMA_IMAGEN_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp"]

// ── FirmaCanvas ──────────────────────────────────────────────────────────────
// Firma del conductor en tablet/lápiz óptico — o una imagen de una firma ya
// hecha (escaneada/foto), arrastrada o elegida desde el explorador: en
// ambos casos termina siendo el mismo dataURL vía onChange, así que el resto
// del flujo (guardar, mostrar, aplicar con un clic) no necesita saber cuál
// de los dos orígenes se usó.
// Componente "no controlado" a propósito — no recibe la firma ya guardada
// como prop: cuando el report ya tiene una firma en BD, el padre la muestra
// por separado como imagen (mismo patrón que la evidencia fotográfica ya
// subida vs. la nueva por adjuntar) y solo renderiza este canvas para
// capturar una firma nueva.
export function FirmaCanvas({ onChange, readOnly }: {
  onChange: (dataUrl: string | null) => void
  readOnly?: boolean
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const drawingRef = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)
  const [dragOver,  setDragOver]  = useState(false)
  const [imgError,  setImgError]  = useState<string | null>(null)

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
    setImgError(null)
    onChange(null)
  }

  // Dibuja la imagen soltada/elegida centrada en el canvas, escalada para
  // que entre completa sin deformarse (mismo "contain" que ya usa <img> al
  // mostrar la firma guardada) — así el dataURL resultante siempre sale con
  // las mismas dimensiones que la firma a mano, sin caso especial aguas abajo.
  function loadImageFile(file: File) {
    if (readOnly) return
    const ext = (file.name.split(".").pop() ?? "").toLowerCase()
    if (!FIRMA_IMAGEN_EXT.includes(ext) && !file.type.startsWith("image/")) {
      setImgError(`Formato no reconocido (${file.name}) — usa PNG, JPG, WEBP, GIF o BMP.`)
      return
    }
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
      URL.revokeObjectURL(url)
      setImgError(null)
      setHasStroke(true)
      onChange(canvas.toDataURL("image/png"))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setImgError(`No se pudo leer la imagen (${file.name}).`)
    }
    img.src = url
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (readOnly) return
    const file = e.dataTransfer.files?.[0]
    if (file) loadImageFile(file)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed overflow-hidden transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          readOnly && "opacity-60"
        )}
        onDragOver={e => { e.preventDefault(); if (!readOnly) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-4 pointer-events-none">
            <p className="text-xs text-muted-foreground/70">
              {readOnly
                ? "Firma bloqueada — el report ya no admite cambios"
                : "Firma aquí, o arrastra una imagen de tu firma"}
            </p>
            {!readOnly && (
              <p className="text-[10px] text-muted-foreground/50">PNG, JPG, WEBP, GIF o BMP</p>
            )}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Subir imagen…
          </button>
          {hasStroke && (
            <button type="button" onClick={handleClear} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
              Limpiar firma
            </button>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) loadImageFile(file)
          e.target.value = ""
        }}
      />
      {imgError && <p className="text-[11px] text-destructive">{imgError}</p>}
    </div>
  )
}
