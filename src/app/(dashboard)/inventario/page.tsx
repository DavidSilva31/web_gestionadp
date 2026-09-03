"use client"

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  Package, Plus, Search, RefreshCw, ChevronRight, ArrowLeft,
  Loader2, Pencil, Warehouse, Trash2, Download, AlertCircle, Check,
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
import { exportInventarioResumenToExcel, exportKardexToExcel, type KardexExportGroup } from "@/lib/excel"
import { resolveEffectiveClienteId } from "@/lib/inventario"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import type {
  Cliente,
  InventarioItem,
  InventarioItemInsert,
  InventarioCategoria,
  InventarioArea,
  InstalacionAlmacenamiento,
  Movimiento,
} from "@/types/database"

const CATEGORIAS: InventarioCategoria[] = [
  "Contenedor IMO", "Isotanque", "Residuo peligroso", "Carga general",
]
const UNIDADES = ["unidad", "pallets", "contenedor", "isotanque", "kg", "ton"]

// El enum Área quedó obsoleto frente al catálogo real de instalaciones — se
// sigue completando (columna NOT NULL) pero se infiere desde la instalación
// elegida en vez de pedírselo al usuario dos veces.
function inferArea(inst: InstalacionAlmacenamiento | undefined): InventarioArea {
  if (!inst) return "Bodega General"
  if (inst.codigo.toUpperCase().includes("RESPEL")) return "Zona RESPEL"
  if (inst.tipo === "Patio") return "Zona Isotanques"
  return "Bodega IMO"
}

const ESTADO_BADGE: Record<string, string> = {
  Normal:  "badge-success",
  Bajo:    "badge-warning",
  Crítico: "badge-danger",
}

const AVATAR_COLORS = [
  "bg-blue-100    text-blue-700    dark:bg-blue-900/40    dark:text-blue-300",
  "bg-violet-100  text-violet-700  dark:bg-violet-900/40  dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-cyan-100    text-cyan-700    dark:bg-cyan-900/40    dark:text-cyan-300",
  "bg-orange-100  text-orange-700  dark:bg-orange-900/40  dark:text-orange-300",
  "bg-rose-100    text-rose-700    dark:bg-rose-900/40    dark:text-rose-300",
  "bg-amber-100   text-amber-700   dark:bg-amber-900/40   dark:text-amber-300",
]

const codigo = (n: number) => `ALM-${String(n).padStart(3, "0")}`
const initials = (nombre: string) =>
  nombre.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()

function getEstado(item: InventarioItem): "Normal" | "Bajo" | "Crítico" {
  if (item.stock_actual <= 0) return "Crítico"
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
  stock_unidades: 0,
  stock_minimo:  0,
  observaciones: null,
  activo:        true,
  created_by:    null,
  instalacion_id: null,
  peso_ton:       null,
  peso_unitario_ton: null,
}

const KARDEX_ENVASES = ["Tambor", "Bidón", "IBC", "Saco", "Caja", "Pallet", "Granel", "Maxisaco", "Tineta", "Cilindro", "Cuñete", "Otro"]
const KARDEX_TIPOS = ["ingreso", "despacho"] as const

// Celda editable del Kardex: clic para editar, blur/Enter guarda, Escape
// cancela. `onSave` hace el update real y devuelve un mensaje de error (o
// nada si quedó bien) — la celda no cambia de estado hasta confirmar éxito.
function KardexCell({
  value, kind, options, onSave, align = "left", placeholder = "—", labels, disabled = false,
}: {
  value: string | number | null
  kind: "text" | "number" | "date" | "select"
  options?: readonly string[]
  labels?: Record<string, string>
  onSave: (v: string | number | null) => Promise<string | void>
  align?: "left" | "right"
  placeholder?: string
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value == null ? "" : String(value))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (!editing) setDraft(value == null ? "" : String(value)) }, [value, editing])
  useEffect(() => { if (disabled) { setEditing(false); setErr(null) } }, [disabled])

  async function commit() {
    // disabled={saving} en el input hace que el navegador lo blurree apenas se
    // desactiva — sin este guard, Enter dispara commit() y el blur resultante
    // dispara un segundo commit() con el mismo draft antes de que setEditing(false)
    // desmonte el input.
    if (saving) return
    const raw = draft.trim()
    const parsed: string | number | null = kind === "number" ? (raw === "" ? null : parseFloat(raw)) : (raw || null)
    if (parsed === (value ?? null)) { setEditing(false); return }
    setSaving(true)
    const error = await onSave(parsed)
    setSaving(false)
    if (error) { setErr(error); return }
    setErr(null)
    setEditing(false)
  }
  function cancel() { setDraft(value == null ? "" : String(value)); setEditing(false); setErr(null) }

  if (!editing) {
    // Ojo: NO usar el atributo `disabled` nativo acá — un <button disabled>
    // deja de emitir mousedown/mouseover, así que el arrastre para mover la
    // vista de Detalle (que escucha mousedown en el contenedor padre) nunca
    // se entera del gesto sobre esas celdas. En vez de eso, el bloqueo se
    // marca con data-kardex-locked y se ignora el click a mano.
    return (
      <button type="button" data-kardex-locked={disabled ? "true" : undefined}
        onClick={() => { if (!disabled) setEditing(true) }}
        style={disabled ? { cursor: "inherit" } : undefined}
        className={cn(
          "block w-full whitespace-nowrap text-left px-2 py-1.5 transition-colors",
          disabled ? "" : "hover:bg-primary/10 cursor-pointer",
          align === "right" && "text-right"
        )}>
        {value == null || value === ""
          ? <span className="text-muted-foreground/40">{placeholder}</span>
          : (labels?.[String(value)] ?? String(value))}
      </button>
    )
  }
  const shared = "h-7 w-full min-w-[70px] text-[11px] px-1.5 rounded-none border border-primary bg-background focus:outline-none"
  return (
    <div className="relative">
      {kind === "select" ? (
        <select autoFocus disabled={saving} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === "Escape") cancel() }} className={shared}>
          <option value="">—</option>
          {options?.map(o => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
        </select>
      ) : (
        <input autoFocus disabled={saving} type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
          value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel() }}
          className={cn(shared, align === "right" && "text-right")} />
      )}
      {err && <span className="absolute left-0 top-full mt-0.5 whitespace-nowrap z-10 text-[9px] text-destructive-foreground bg-destructive rounded px-1.5 py-0.5">{err}</span>}
    </div>
  )
}

// ── Inner component (requiere useSearchParams → envuelto en Suspense) ──────────
function InventarioContent() {
  const { user, profile } = useAuth()
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
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [itemsError,   setItemsError]   = useState<string | null>(null)
  const [dialog,       setDialog]       = useState<null | "new" | InventarioItem>(null)
  const [form,         setForm]         = useState<InventarioItemInsert>(EMPTY_FORM)
  const [deleting,     setDeleting]     = useState<InventarioItem | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [exportPreview, setExportPreview] = useState<
    | { kind: "resumen"; rows: Record<string, string | number>[]; filename: string }
    | { kind: "kardex";  groups: KardexExportGroup[]; filename: string }
    | null
  >(null)
  const [exportError,  setExportError]  = useState<string | null>(null)
  const [instalaciones, setInstalaciones] = useState<InstalacionAlmacenamiento[]>([])
  const [vista,        setVista]        = useState<"resumen" | "kardex">("resumen")
  const [kardexProducto, setKardexProducto] = useState<string | null>(null)
  const [kardexImoFiltro, setKardexImoFiltro] = useState<string | null>(null)
  const [kardexMovs,   setKardexMovs]   = useState<Record<string, (Movimiento & { reports: { numero: number } | null })[]>>({})
  const [loadingKardex, setLoadingKardex] = useState(false)
  const [kardexError,  setKardexError]  = useState<string | null>(null)
  // Bloqueo de edición del Detalle: las celdas solo se pueden tocar tras
  // presionar "Editar" — capa extra para que ningún valor cambie sin querer.
  // Al confirmar un primer cambio el botón pasa a "Confirmar" para forzar un
  // clic consciente que vuelva a bloquear la tabla.
  const [kardexEditing, setKardexEditing] = useState(false)
  const [kardexDirty,   setKardexDirty]   = useState(false)
  // Arrastrar para mover la vista de Detalle (como un canvas): clic sostenido
  // sobre una zona no interactiva y el cursor cambia a "mano" mientras
  // desplaza el scroll vertical general y el horizontal de la tabla bajo el cursor.
  const kardexScrollRef = useRef<HTMLDivElement>(null)
  const [kardexPanning, setKardexPanning] = useState(false)

  function handleKardexPanStart(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const interactive = target.closest<HTMLElement>("button, input, select, a, textarea")
    // Las celdas del Kardex bloqueadas (ver KardexCell) se marcan con
    // data-kardex-locked en vez de `disabled` para seguir recibiendo
    // mousedown y permitir arrastrar la vista desde encima de un valor.
    if (interactive && interactive.dataset.kardexLocked !== "true") return
    const outer = kardexScrollRef.current
    if (!outer) return
    const inner = target.closest<HTMLElement>(".kardex-hscroll")
    const startX = e.clientX
    const startY = e.clientY
    const startScrollTop = outer.scrollTop
    const startScrollLeft = inner?.scrollLeft ?? 0
    let dragging = false

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!dragging && Math.hypot(dx, dy) > 4) { dragging = true; setKardexPanning(true) }
      if (dragging) {
        outer!.scrollTop = startScrollTop - dy
        if (inner) inner.scrollLeft = startScrollLeft - dx
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      setKardexPanning(false)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const [{ data: cData, error: e1 }, { data: iData, error: e2 }] = await Promise.all([
      supabase.from("clientes").select("id, nombre, stock_compartido_con, usa_vista_kardex").eq("activo", true).order("nombre"),
      supabase.from("inventario_items").select("*").eq("activo", true).order("numero"),
    ])
    if (e1 ?? e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
    const clientes = (cData ?? []) as Cliente[]
    if (clientes.length) setClientes(clientes)
    const grouped: Record<string, InventarioItem[]> = {}
    for (const c of clientes) grouped[c.id] = []
    for (const item of (iData ?? []) as InventarioItem[]) {
      if (grouped[item.cliente_id]) grouped[item.cliente_id].push(item)
      else grouped[item.cliente_id] = [item]
    }
    // Clientes que comparten pool de stock con otro ven los mismos ítems —
    // mismo arreglo, no una copia, para que el contador y el panel coincidan.
    for (const c of clientes) {
      if (c.stock_compartido_con && grouped[c.stock_compartido_con]) {
        grouped[c.id] = grouped[c.stock_compartido_con]
      }
    }
    setClienteItems(grouped)
    setLoading(false)
  }, [])

  useEffect(() => {
    createClient().from("instalaciones_almacenamiento").select("*").eq("activo", true).order("orden")
      .then(({ data }) => setInstalaciones((data ?? []) as InstalacionAlmacenamiento[]))
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  const fetchItemsForCliente = useCallback(async (clienteId: string) => {
    setLoadingItems(true)
    setItemsError(null)
    const supabase = createClient()
    const effectiveId = await resolveEffectiveClienteId(supabase, clienteId)
    const { data, error } = await supabase
      .from("inventario_items")
      .select("*")
      .eq("cliente_id", effectiveId)
      .eq("activo", true)
      .order("numero")
    if (error) {
      setItemsError(error.message)
    } else {
      setClienteItems(prev => ({ ...prev, [clienteId]: (data ?? []) as InventarioItem[] }))
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
    setVista("resumen")
    setKardexProducto(null)
    setKardexImoFiltro(null)
    setKardexEditing(false)
    setKardexDirty(false)
    if (!clienteItems[c.id]) {
      fetchItemsForCliente(c.id)
    }
  }

  const fetchKardexForCliente = useCallback(async (clienteId: string) => {
    setLoadingKardex(true)
    setKardexError(null)
    const supabase = createClient()
    const effectiveId = await resolveEffectiveClienteId(supabase, clienteId)
    const { data, error } = await supabase
      .from("movimientos")
      .select("*, reports(numero)")
      .eq("cliente_id", effectiveId)
      .order("fecha", { ascending: true })
    if (error) {
      setKardexError(error.message)
    } else {
      setKardexMovs(prev => ({ ...prev, [clienteId]: (data ?? []) as unknown as (Movimiento & { reports: { numero: number } | null })[] }))
    }
    setLoadingKardex(false)
  }, [])

  useEffect(() => {
    if (vista === "kardex" && selected && !kardexMovs[selected.id]) {
      fetchKardexForCliente(selected.id)
    }
  }, [vista, selected, kardexMovs, fetchKardexForCliente])

  // Agrupa por lote (código) y calcula el saldo corrido fila a fila, igual
  // que el Kardex en excel del cliente — el saldo nunca se guarda en BD.
  const kardexGroups = useMemo(() => {
    const movs = selected ? (kardexMovs[selected.id] ?? []) : []
    const groups = new Map<string, typeof movs>()
    for (const m of movs) {
      const key = m.codigo || m.lote || m.carga
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return [...groups.entries()].map(([key, groupMovs]) => {
      let stockPos = 0
      let stockUnd = 0
      const rows = groupMovs.map(m => {
        if (m.tipo === "ingreso") { stockPos += m.posiciones ?? 0; stockUnd += m.unidades ?? 0 }
        else                      { stockPos -= m.posiciones ?? 0; stockUnd -= m.unidades ?? 0 }
        return { ...m, stockPos, stockUnd }
      })
      return { key, carga: groupMovs[0].carga, lote: groupMovs[0].lote, codigo: groupMovs[0].codigo, rows }
    })
  }, [selected, kardexMovs])

  const kardexProductos = useMemo(() => {
    const counts = new Map<string, number>()
    for (const g of kardexGroups) counts.set(g.carga, (counts.get(g.carga) ?? 0) + 1)
    return [...counts.entries()].map(([carga, lotes]) => ({ carga, lotes })).sort((a, b) => a.carga.localeCompare(b.carga))
  }, [kardexGroups])

  // IMOs distintos presentes en los movimientos del cliente — permite buscar
  // por clase IMO en vez de por producto, mostrando todos los productos que
  // comparten esa clase.
  const kardexImos = useMemo(() => {
    const set = new Set<string>()
    for (const g of kardexGroups) for (const r of g.rows) if (r.imo) set.add(r.imo)
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [kardexGroups])

  const kardexGroupsFiltered = kardexProducto
    ? kardexGroups.filter(g => g.carga === kardexProducto)
    : kardexImoFiltro
    ? kardexGroups.filter(g => g.rows.some(r => r.imo === kardexImoFiltro))
    : []

  // Edición inline de un valor del Kardex — el trigger de BD ya recalcula
  // stock_actual del ítem cuando cambian tipo/unidades, no hay que tocarlo acá.
  async function updateKardexField<K extends keyof Movimiento>(movId: string, field: K, value: Movimiento[K]) {
    if (!selected) return
    const supabase = createClient()
    const { error } = await supabase.from("movimientos").update({ [field]: value }).eq("id", movId)
    if (error) return error.message
    setKardexMovs(prev => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? []).map(m => m.id === movId ? { ...m, [field]: value } : m),
    }))
    setKardexDirty(true)
  }

  async function updateKardexReport(movId: string, raw: string | number | null) {
    if (!selected) return
    const supabase = createClient()
    if (raw == null || raw === "") {
      const { error } = await supabase.from("movimientos").update({ report_id: null }).eq("id", movId)
      if (error) return error.message
      setKardexMovs(prev => ({ ...prev, [selected.id]: (prev[selected.id] ?? []).map(m => m.id === movId ? { ...m, report_id: null, reports: null } : m) }))
      setKardexDirty(true)
      return
    }
    const numero = parseInt(String(raw), 10)
    if (Number.isNaN(numero)) return "Número inválido"
    const { data: rep, error: findErr } = await supabase.from("reports").select("id, numero").eq("numero", numero).maybeSingle()
    if (findErr) return findErr.message
    if (!rep) return `No existe report ${numero}`
    const { error } = await supabase.from("movimientos").update({ report_id: rep.id }).eq("id", movId)
    if (error) return error.message
    setKardexMovs(prev => ({ ...prev, [selected.id]: (prev[selected.id] ?? []).map(m => m.id === movId ? { ...m, report_id: rep.id, reports: { numero: rep.numero } } : m) }))
    setKardexDirty(true)
  }

  async function openNew() {
    if (!selected) return
    // Si el cliente seleccionado comparte pool de stock, el ítem nuevo debe
    // quedar bajo el dueño real del inventario, no bajo el cliente en pantalla.
    const supabase = createClient()
    const ownerId = await resolveEffectiveClienteId(supabase, selected.id)
    setForm({ ...EMPTY_FORM, cliente_id: ownerId })
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
      stock_unidades: item.stock_unidades,
      stock_minimo:  item.stock_minimo,
      observaciones: item.observaciones,
      activo:        item.activo,
      created_by:    item.created_by,
      instalacion_id: item.instalacion_id,
      peso_ton:       item.peso_ton,
      peso_unitario_ton: item.peso_unitario_ton,
    })
    setError(null)
    setDialog(item)
  }

  async function handleDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("inventario_items").update({ activo: false }).eq("id", deleting.id)
      if (error) { setError(error.message); return }
      logAudit({
        tabla:          "inventario_items",
        registro_id:    deleting.id,
        accion:         "inventario.eliminar_item",
        descripcion:    `Ítem ${deleting.descripcion} eliminado${selected ? ` — ${selected.nombre}` : ""}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      setDeleting(null)
      if (selected) fetchItemsForCliente(selected.id)
    } catch (err) {
      console.error("[inventario] error eliminando ítem:", err)
      setError("No se pudo eliminar el ítem.")
    } finally {
      setDeletingBusy(false)
    }
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
      area:          inferArea(instalaciones.find(i => i.id === form.instalacion_id)),
      // Ancla fija para recalcular peso_ton automáticamente cuando stock_actual
      // cambie por un movimiento/despacho (ver syncPesoTon en lib/inventario.ts).
      peso_unitario_ton: form.peso_ton != null && form.stock_actual > 0
        ? form.peso_ton / form.stock_actual
        : null,
    }

    try {
      const supabase = createClient()
      if (dialog === "new") {
        const { data: inserted, error: err } = await supabase.from("inventario_items").insert(payload).select("id").single()
        if (err) { setError(err.message); setSaving(false); return }
        logAudit({
          tabla:          "inventario_items",
          registro_id:    inserted.id,
          accion:         "inventario.crear_item",
          descripcion:    `Ítem ${payload.descripcion} creado${selected ? ` — ${selected.nombre}` : ""}`,
          usuario_id:     user?.id,
          usuario_nombre: profile?.nombre ?? user?.email,
        })
      } else if (dialog) {
        // Exclude stock_actual from edit — stock must change only through movimientos
        const { stock_actual, ...editPayload } = payload
        void stock_actual
        // Con stock 0 no hay forma real de recalcular el ancla — no pisarla
        // con null o se pierde para siempre y peso_ton deja de sincronizar
        // cuando el stock vuelva a subir (ver syncPesoTon en lib/inventario.ts).
        if (form.stock_actual === 0) delete (editPayload as { peso_unitario_ton?: number | null }).peso_unitario_ton
        const { error: err } = await supabase.from("inventario_items").update(editPayload).eq("id", dialog.id)
        if (err) { setError(err.message); setSaving(false); return }
        logAudit({
          tabla:          "inventario_items",
          registro_id:    dialog.id,
          accion:         "inventario.actualizar_item",
          descripcion:    `Ítem ${payload.descripcion} actualizado${selected ? ` — ${selected.nombre}` : ""}`,
          usuario_id:     user?.id,
          usuario_nombre: profile?.nombre ?? user?.email,
        })
      }
      setSaving(false)
      setDialog(null)
      if (selected) fetchItemsForCliente(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
      setSaving(false)
    }
  }

  function buildExportRows() {
    if (!selected || !items.length) return null
    const rows = items.map(item => ({
      "Código":        codigo(item.numero),
      "Descripción":   item.descripcion,
      "Categoría":     item.categoria,
      "Instalación":   instalaciones.find(i => i.id === item.instalacion_id)?.codigo ?? "Sin asignar",
      "Clase IMO":     item.clase_imo ?? "—",
      "N° ONU":        item.nu ?? "—",
      "Stock Actual":  item.stock_actual,
      "Stock Mínimo":  item.stock_minimo,
      "Unidad":        item.unidad,
      "Estado":        getEstado(item),
      "Observaciones": item.observaciones ?? "",
    }))
    const today = new Date().toLocaleDateString("es-CL").replace(/\//g, "-")
    return { rows, filename: `Inventario_${selected.nombre}_${today}` }
  }

  // Excel del Detalle: SIEMPRE todos los productos del cliente (kardexGroups
  // sin filtrar), sin importar si en pantalla hay un Producto o un IMO
  // seleccionado — el filtro es solo para mirar, no para acotar la descarga.
  function buildKardexExportRows() {
    if (!selected || kardexGroups.length === 0) return null
    const groups: KardexExportGroup[] = kardexGroups.map(g => ({
      carga: g.carga,
      subtitulo: [g.codigo && `Código ${g.codigo}`, g.lote && `Lote ${g.lote}`].filter(Boolean).join(" · ") || "Movimientos",
      rows: g.rows.map(m => ({
        "Fecha":               m.fecha.slice(0, 10),
        "Tipo":                m.tipo === "ingreso" ? "Ingreso" : "Despacho",
        "IMO":                 m.imo ?? "",
        "N° UN":               m.un ?? "",
        "Lote":                m.lote ?? "",
        "N° CAS":              m.cas ?? "",
        "N° Guía":             m.guia_numero ?? "",
        "Orden de Compra":     m.orden_compra ?? "",
        "Fecha Elaboración":   m.fecha_elaboracion ?? "",
        "Fecha Vencimiento":   m.fecha_vencimiento ?? "",
        "Peso Neto":           m.peso_envase ?? "",
        "Envase":              m.tipo_envase ?? "",
        "N° Report":           m.reports?.numero ?? "",
        "Ingreso Posiciones":  m.tipo === "ingreso"  ? (m.posiciones ?? "") : "",
        "Ingreso Unidades":    m.tipo === "ingreso"  ? (m.unidades ?? "")  : "",
        "Despacho Posiciones": m.tipo === "despacho" ? (m.posiciones ?? "") : "",
        "Despacho Unidades":   m.tipo === "despacho" ? (m.unidades ?? "")  : "",
        "Stock Posiciones":    m.stockPos,
        "Stock Unidades":      m.stockUnd,
        "Bodega":              m.bodega ?? "",
      })),
    }))
    const today = new Date().toLocaleDateString("es-CL").replace(/\//g, "-")
    return { groups, filename: `Detalle_Inventario_${selected.nombre}_${today}` }
  }

  function openExportPreview() {
    if (vista === "kardex") {
      const built = buildKardexExportRows()
      if (built) setExportPreview({ kind: "kardex", ...built })
    } else {
      const built = buildExportRows()
      if (built) setExportPreview({ kind: "resumen", ...built })
    }
  }

  async function handleDownloadExport() {
    if (!exportPreview) return
    setExportError(null)
    try {
      if (exportPreview.kind === "kardex") {
        await exportKardexToExcel(exportPreview.groups, exportPreview.filename, selected?.nombre ?? "")
      } else {
        await exportInventarioResumenToExcel(exportPreview.rows, exportPreview.filename, selected?.nombre ?? "")
      }
      setExportPreview(null)
    } catch (err) {
      console.error("[inventario] error exportando Excel:", err)
      setExportError("No se pudo generar el archivo Excel.")
    }
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
              className="gap-1.5 bg-primary hover:bg-primary/85 text-primary-foreground">
              <Plus className="h-3.5 w-3.5" />
              Registrar ítem
            </Button>
          )}
        </PageHeader>

        {fetchError && (
          <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            Error al cargar inventario: {fetchError}
          </div>
        )}

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
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
                            ? "bg-primary text-primary-foreground"
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
                    {selected.usa_vista_kardex && (
                      <div className="inline-flex rounded-md border border-border/50 overflow-hidden h-7">
                        {(["resumen", "kardex"] as const).map(v => (
                          <button key={v} type="button" onClick={() => { setVista(v); setKardexEditing(false); setKardexDirty(false); setKardexImoFiltro(null) }}
                            className={cn(
                              "px-2.5 text-[11px] font-medium transition-colors",
                              vista === v ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                            )}>
                            {v === "kardex" ? "Detalle" : "Resumen"}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline" size="sm"
                      onClick={openExportPreview}
                      disabled={vista === "kardex" ? kardexGroups.length === 0 : items.length === 0}
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

                {vista === "kardex" && kardexProductos.length > 0 && (
                  <div className="px-6 py-2.5 border-b bg-muted/5 flex items-center gap-2 flex-shrink-0">
                    <Label className="text-[11px] text-muted-foreground font-medium">Producto</Label>
                    <select value={kardexProducto ?? ""}
                      onChange={e => {
                        setKardexProducto(e.target.value || null)
                        setKardexImoFiltro(null)
                        setKardexEditing(false); setKardexDirty(false)
                      }}
                      className="h-8 flex-1 max-w-sm rounded-md border border-input bg-background px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Selecciona un producto…</option>
                      {kardexProductos.map(p => (
                        <option key={p.carga} value={p.carga}>{p.carga}{p.lotes > 1 ? ` (${p.lotes} lotes)` : ""}</option>
                      ))}
                    </select>
                    <Label className="text-[11px] text-muted-foreground font-medium">IMO</Label>
                    <select value={kardexImoFiltro ?? ""}
                      onChange={e => {
                        setKardexImoFiltro(e.target.value || null)
                        setKardexProducto(null)
                        setKardexEditing(false); setKardexDirty(false)
                      }}
                      className="h-8 w-36 rounded-md border border-input bg-background px-2.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Todos</option>
                      {kardexImos.map(imo => (
                        <option key={imo} value={imo}>{imo}</option>
                      ))}
                    </select>
                    {(kardexProducto || kardexImoFiltro) && (
                      <Button
                        type="button"
                        size="sm"
                        variant={kardexEditing ? undefined : "outline"}
                        onClick={() => {
                          if (kardexEditing) { setKardexEditing(false); setKardexDirty(false) }
                          else setKardexEditing(true)
                        }}
                        className={cn(
                          "ml-auto gap-1.5 text-xs h-7",
                          kardexEditing && !kardexDirty && "bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        )}
                      >
                        {kardexDirty
                          ? <><Check className="h-3.5 w-3.5" />Confirmar</>
                          : <><Pencil className="h-3.5 w-3.5" />Editar</>}
                      </Button>
                    )}
                  </div>
                )}

                {/* Tabla de ítems */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {vista === "kardex" ? (
                    loadingKardex ? (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : kardexError ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                        <AlertCircle className="h-8 w-8 text-destructive/60" />
                        <p className="text-sm">No se pudo cargar el kardex: {kardexError}</p>
                        <Button size="sm" variant="outline" onClick={() => selected && fetchKardexForCliente(selected.id)} className="gap-1.5 text-xs">
                          Reintentar
                        </Button>
                      </div>
                    ) : kardexGroups.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Package className="h-10 w-10 opacity-20" />
                        <p className="text-sm font-medium">Sin movimientos registrados</p>
                      </div>
                    ) : !kardexProducto && !kardexImoFiltro ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Package className="h-10 w-10 opacity-20" />
                        <p className="text-sm font-medium">Selecciona un producto o un IMO para ver el Detalle</p>
                        <p className="text-xs">{kardexProductos.length} productos con movimientos</p>
                      </div>
                    ) : kardexGroupsFiltered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Package className="h-10 w-10 opacity-20" />
                        <p className="text-sm font-medium">Sin productos para el IMO {kardexImoFiltro}</p>
                      </div>
                    ) : (
                      <div
                        ref={kardexScrollRef}
                        onMouseDown={handleKardexPanStart}
                        className={cn(
                          "h-full overflow-y-auto overflow-x-auto p-4 space-y-5",
                          kardexPanning ? "cursor-grabbing select-none" : "cursor-grab"
                        )}
                      >
                        {kardexGroupsFiltered.map(group => (
                          <div key={group.key} className="rounded-lg border border-border/40 overflow-hidden">
                            <div className="px-3 py-2 bg-muted/40 border-b border-border/30 flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-bold">{group.carga}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {[group.codigo && `Código ${group.codigo}`, group.lote && `Lote ${group.lote}`].filter(Boolean).join(" · ")}
                              </span>
                            </div>
                            <div className="kardex-hscroll overflow-x-auto">
                              <table className="text-[11px] min-w-[1400px] w-full">
                                <thead className="bg-muted/20 border-b border-border/20">
                                  <tr className="text-left text-muted-foreground">
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Fecha</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Tipo</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">IMO</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">UN</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Lote</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">CAS</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Guía</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">OC</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Elab.</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Venc.</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Peso neto</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Envase</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Report</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Ing. Pos</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Ing. Und</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Desp. Pos</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Desp. Und</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Stock Pos</th>
                                    <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap">Stock Und</th>
                                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">Bodega</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.rows.map((m, i) => {
                                    const vencido = m.fecha_vencimiento && m.fecha_vencimiento < new Date().toISOString().slice(0, 10)
                                    return (
                                      <tr key={m.id} className={cn("border-b border-border/10 last:border-0", i % 2 !== 0 && "bg-muted/10")}>
                                        <td className="p-0 whitespace-nowrap tabular-nums">
                                          <KardexCell kind="date" value={m.fecha.slice(0, 10)} disabled={!kardexEditing}
                                            onSave={async v => {
                                              if (!v) return "Requerido"
                                              const old = new Date(m.fecha)
                                              const [y, mo, d] = String(v).split("-").map(Number)
                                              old.setUTCFullYear(y, mo - 1, d)
                                              return updateKardexField(m.id, "fecha", old.toISOString())
                                            }} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap">
                                          <KardexCell kind="select" value={m.tipo} options={KARDEX_TIPOS} disabled={!kardexEditing}
                                            labels={{ ingreso: "Ingreso", despacho: "Despacho" }}
                                            onSave={v => updateKardexField(m.id, "tipo", (v as Movimiento["tipo"]) ?? "ingreso")} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.imo} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "imo", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.un} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "un", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.lote} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "lote", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.cas} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "cas", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.guia_numero} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "guia_numero", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.orden_compra} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "orden_compra", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="date" value={m.fecha_elaboracion} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "fecha_elaboracion", v as string | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap">
                                          <KardexCell kind="date" value={m.fecha_vencimiento} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "fecha_vencimiento", v as string | null)} />
                                          {vencido && <span className="text-[9px] text-destructive font-medium block px-1.5">Vencido</span>}
                                        </td>
                                        <td className="p-0 text-right whitespace-nowrap tabular-nums">
                                          <KardexCell kind="number" align="right" value={m.peso_envase} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "peso_envase", v as number | null)} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="select" value={m.tipo_envase} options={KARDEX_ENVASES} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "tipo_envase", v as Movimiento["tipo_envase"])} />
                                        </td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.reports?.numero ?? null} disabled={!kardexEditing} onSave={v => updateKardexReport(m.id, v)} />
                                        </td>
                                        <td className="p-0 text-right whitespace-nowrap tabular-nums">
                                          {m.tipo === "ingreso"
                                            ? <KardexCell kind="number" align="right" value={m.posiciones} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "posiciones", v as number | null)} />
                                            : ""}
                                        </td>
                                        <td className="p-0 text-right whitespace-nowrap tabular-nums">
                                          {m.tipo === "ingreso"
                                            ? <KardexCell kind="number" align="right" value={m.unidades} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "unidades", v as number | null)} />
                                            : ""}
                                        </td>
                                        <td className="p-0 text-right whitespace-nowrap tabular-nums">
                                          {m.tipo === "despacho"
                                            ? <KardexCell kind="number" align="right" value={m.posiciones} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "posiciones", v as number | null)} />
                                            : ""}
                                        </td>
                                        <td className="p-0 text-right whitespace-nowrap tabular-nums">
                                          {m.tipo === "despacho"
                                            ? <KardexCell kind="number" align="right" value={m.unidades} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "unidades", v as number | null)} />
                                            : ""}
                                        </td>
                                        <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-semibold">{m.stockPos}</td>
                                        <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-semibold">{m.stockUnd}</td>
                                        <td className="p-0 whitespace-nowrap text-muted-foreground">
                                          <KardexCell kind="text" value={m.bodega} disabled={!kardexEditing} onSave={v => updateKardexField(m.id, "bodega", v as string | null)} />
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : loadingItems ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : itemsError ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 text-destructive/60" />
                      <p className="text-sm">No se pudo cargar el inventario: {itemsError}</p>
                      <Button size="sm" variant="outline" onClick={() => selected && fetchItemsForCliente(selected.id)} className="gap-1.5 text-xs">
                        Reintentar
                      </Button>
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
                    <div className="h-full overflow-auto">
                      <table className="w-full text-sm table-fixed min-w-[720px]">
                        <colgroup>
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "28%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "9%" }} />
                        </colgroup>
                        <thead className="sticky top-0 bg-muted/60 border-b z-10">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Código</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descripción</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instalación</th>
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
                                  {(() => {
                                    const inst = instalaciones.find(i => i.id === item.instalacion_id)
                                    return inst ? (
                                      <Badge className={cn(
                                        "text-[10px] px-1.5 py-0 border-0 font-medium",
                                        inst.tipo === "Patio"
                                          ? "bg-[var(--color-adp-celeste-light)] text-[var(--color-status-info-text)]"
                                          : "bg-[var(--color-status-info-bg)] text-[var(--color-status-info-text)]"
                                      )}>
                                        {inst.codigo}
                                      </Badge>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground/60">Sin asignar</span>
                                    )
                                  })()}
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
                                  <div className="flex items-center justify-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                Instalación
              </Label>
              <select
                value={form.instalacion_id ?? ""}
                onChange={e => setForm(p => ({ ...p, instalacion_id: e.target.value || null }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sin asignar</option>
                {instalaciones.map(i => <option key={i.id} value={i.id}>{i.codigo}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground/70">
                Define la zona/área del ítem automáticamente.
              </p>
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
                onChange={dialog === "new" ? e => setForm(p => ({ ...p, stock_actual: Math.max(0, parseInt(e.target.value) || 0) })) : undefined}
                readOnly={dialog !== "new"}
                className={cn("h-9", dialog !== "new" && "opacity-60 cursor-not-allowed")}
              />
              {dialog !== "new" && (
                <p className="text-[10px] text-muted-foreground">Actualizado vía movimientos</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Peso estimado (ton)
              </Label>
              <Input
                type="number"
                min={0}
                step="0.001"
                value={form.peso_ton ?? ""}
                onChange={e => setForm(p => ({ ...p, peso_ton: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                placeholder="Opcional — para medir ocupación de la instalación"
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
              className="gap-1.5 bg-primary hover:bg-primary/85 text-primary-foreground"
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

      {/* ── Vista previa del Excel antes de descargar ── */}
      <Dialog open={exportPreview !== null} onOpenChange={open => { if (!open) { setExportPreview(null); setExportError(null) } }}>
        <DialogContent className={cn("max-h-[85vh] flex flex-col", exportPreview?.kind === "kardex" ? "sm:max-w-5xl" : "sm:max-w-3xl")}>
          <DialogHeader>
            <DialogTitle>
              Vista previa del Excel — {selected?.nombre}
              {exportPreview?.kind === "kardex" && (
                <span className="text-muted-foreground font-normal"> · Detalle, {new Set(exportPreview.groups.map(g => g.carga)).size} productos</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {exportError && (
            <p className="text-xs text-destructive">{exportError}</p>
          )}

          <div className="flex-1 overflow-auto border rounded-lg">
            {exportPreview?.kind === "resumen" && (
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
            {exportPreview?.kind === "kardex" && (
              <div className="divide-y">
                {exportPreview.groups.map((group, gi) => (
                  <div key={gi}>
                    <div className="px-3 py-2 bg-[#0A4A7F] text-white text-[11px] font-bold sticky top-0">
                      {group.carga}
                      <span className="font-normal opacity-80"> — {group.subtitulo}</span>
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-[#1A5276]/10">
                        <tr>
                          {Object.keys(group.rows[0] ?? {}).map(col => (
                            <th key={col} className="text-left px-2.5 py-1.5 font-semibold text-[#1A5276] whitespace-nowrap border-b">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="px-2.5 py-1.5 whitespace-nowrap">{String(val)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
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

      {/* ── Confirmación de eliminación ── */}
      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) { setDeleting(null); setError(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-4 w-4 text-destructive" />
              </span>
              ¿Eliminar ítem?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold text-foreground">{deleting?.descripcion}</span> del inventario de este cliente.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={handleDelete}
              className="gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
            >
              {deletingBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <InventarioContent />
    </Suspense>
  )
}
