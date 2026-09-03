"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Wrench, Plus, Minus, X, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { resolveEffectiveClienteId } from "@/lib/inventario"

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

// Tarifa/contrato: antes se elegía a mano acá (clientes con más de un
// contrato en paralelo, ej. PROQUIMIN). Ahora se deriva sola en reports/[id]
// comparando la Clase IMO del producto elegido en Bodegaje contra la Clase
// IMO de cada tarifa del cliente — mismo dato, dos tablas — así que este
// tipo solo queda para tipar esa lista, sin selector propio.
export interface TarifaOption { id: string; clase_imo: string | null; cotizacion_numero: string }

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

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onClear(); setOpen(true) }}
        onFocus={() => !readOnly && setOpen(true)}
        placeholder={clienteId ? "Buscar producto en inventario..." : "Selecciona un cliente primero"}
        className="h-8 text-xs"
        autoComplete="off"
        disabled={readOnly}
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
      <div className="relative rounded-lg border-2 border-dashed border-muted-foreground/25 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={700}
          height={200}
          className="w-full h-[170px] touch-none cursor-crosshair bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {!hasStroke && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/70 pointer-events-none px-4 text-center">
            Firma aquí — el conductor firma con el dedo o lápiz óptico
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
