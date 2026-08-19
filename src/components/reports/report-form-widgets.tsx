"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Wrench, Plus, Minus, X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Field } from "./report-form-sections"

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
        readOnly={readOnly}
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

export interface TarifaOption { id: string; clase_imo: string | null; cotizacion_numero: string }

// Clientes con más de una tarifa en paralelo (ej. PROQUIMIN) deben elegir a
// cuál pertenece este report — de lo contrario el movimiento auto-generado al
// despachar quedaría sin saber a qué contrato facturarlo. Con una sola
// tarifa activa se asigna sola, sin pedirle nada al operador.
export function TarifaSelect({ clienteId, value, onChange, onCountChange, readOnly }: {
  clienteId: string
  value: string
  onChange: (id: string) => void
  onCountChange?: (count: number) => void
  readOnly?: boolean
}) {
  const [tarifas, setTarifas] = useState<TarifaOption[]>([])
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    setTarifas([])
    setFetchError(false)
    if (!clienteId) { onCountChange?.(0); return }
    createClient()
      .from("tarifas_cliente")
      .select("id, clase_imo, cotizacion_numero")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("clase_imo")
      .then(({ data, error }) => {
        if (error) {
          console.error("[reports] error obteniendo tarifas del cliente:", error)
          setFetchError(true)
          return // no llamar onCountChange — mejor dejar el conteo previo que asumir 0
        }
        const list = (data as TarifaOption[]) ?? []
        setTarifas(list)
        onCountChange?.(list.length)
      })
  }, [clienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Solo auto-asignar si el report todavía no tiene tarifa elegida — si
    // ya tenía una (ej. al abrir un report existente para editar) nunca
    // reasignarla sola aunque el cliente haya quedado con una sola tarifa
    // activa distinta, o se cambiaría en silencio a qué contrato factura.
    if (!readOnly && !value && tarifas.length === 1) onChange(tarifas[0].id)
  }, [tarifas]) // eslint-disable-line react-hooks/exhaustive-deps

  if (fetchError) {
    return (
      <Field label="Tarifa / Clase" className="col-span-1 sm:col-span-3">
        <p className="text-[11px] text-destructive">
          No se pudieron cargar las tarifas del cliente — verifica antes de enviar a despacho si tiene más de un contrato.
        </p>
      </Field>
    )
  }

  if (tarifas.length <= 1) return null

  return (
    <Field label="Tarifa / Clase" required className="col-span-1 sm:col-span-3">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={readOnly}
        className="h-8 w-full rounded-md border border-amber-400 bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-default"
      >
        <option value="">Este cliente tiene {tarifas.length} contratos — selecciona a cuál pertenece</option>
        {tarifas.map(t => (
          <option key={t.id} value={t.id}>{t.clase_imo ?? t.cotizacion_numero}</option>
        ))}
      </select>
    </Field>
  )
}

export interface InventarioItemOption { id: string; descripcion: string; clase_imo: string | null; nu: string | null }

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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setItems([])
    if (!clienteId) return
    createClient()
      .from("inventario_items")
      .select("id, descripcion, clase_imo, nu")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("descripcion", { ascending: true })
      .then(({ data }) => { if (data) setItems(data as InventarioItemOption[]) })
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

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onClear(); setOpen(true) }}
        onFocus={() => !readOnly && setOpen(true)}
        placeholder={clienteId ? "Buscar producto en inventario..." : "Selecciona un cliente primero"}
        className="h-8 text-xs"
        autoComplete="off"
        readOnly={readOnly}
      />
      {open && !readOnly && filtered.length > 0 && (
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
        </div>
      )}
      {open && !readOnly && clienteId && filtered.length === 0 && query.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-sm px-3 py-2 text-xs text-muted-foreground">
          Sin coincidencias — se usará el texto ingresado
        </div>
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
