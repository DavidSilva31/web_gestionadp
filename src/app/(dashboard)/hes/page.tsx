"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  FileSpreadsheet, Search, Settings2, Printer, CheckCircle2,
  AlertCircle, Loader2, ChevronRight, FileText, RefreshCw, Download,
} from "lucide-react"
import type { Cliente, TarifaCliente, TarifaClienteInsert } from "@/types/database"

// ── Constants ──────────────────────────────────────────────────────────────────
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const CURRENT_YEAR  = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)

// ── Types ──────────────────────────────────────────────────────────────────────
interface MovRaw {
  id: string; numero: number; tipo: string; unidades: number | null
  operador: string | null; fecha: string; report_id: string | null
  reports: { numero: number; sec1_guia_numero: string | null; sec3_numero_guia: string | null } | null
}

interface DayEntry {
  fecha:       string
  operador:    string
  guias_in:    string
  pallets_in:  number
  reports_in:  string
  guias_out:   string
  pallets_out: number
  reports_out: string
  stock:       number
  tarifa_dia:  number
}

interface HesResult {
  palletDays:    number
  totalIngresos: number
  totalDespachos: number
  dailyLog:      DayEntry[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtUF(v: number) { return v.toFixed(4) }
function fmtCLP(v: number) { return `$${Math.round(v).toLocaleString("es-CL")}` }
function pad(n: number) { return String(n).padStart(2, "0") }

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function computeHES(movs: MovRaw[], year: number, month: number, tarifaAlmacenaje: number): HesResult {
  const periodStart = `${year}-${pad(month + 1)}-01`
  const periodEndDay = daysInMonth(year, month)

  // Starting stock = net ingresos - despachos before the period
  let stock = 0
  for (const m of movs) {
    if (m.fecha < periodStart) {
      stock += m.tipo === "ingreso" ? (m.unidades ?? 0) : -(m.unidades ?? 0)
    }
  }

  // Build daily log for the period
  const byDate = new Map<string, MovRaw[]>()
  for (const m of movs) {
    const d = m.fecha.slice(0, 10)
    if (d >= periodStart && d <= `${year}-${pad(month + 1)}-${pad(periodEndDay)}`) {
      if (!byDate.has(d)) byDate.set(d, [])
      byDate.get(d)!.push(m)
    }
  }

  let palletDays = 0
  let totalIngresos = 0
  let totalDespachos = 0
  const dailyLog: DayEntry[] = []

  for (let day = 1; day <= periodEndDay; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
    const dayMovs = byDate.get(dateStr) ?? []

    const ins  = dayMovs.filter(m => m.tipo === "ingreso")
    const outs = dayMovs.filter(m => m.tipo === "despacho")

    const palletsIn  = ins.reduce((s, m)  => s + (m.unidades ?? 0), 0)
    const palletsOut = outs.reduce((s, m) => s + (m.unidades ?? 0), 0)

    stock += palletsIn - palletsOut
    palletDays += Math.max(stock, 0)
    totalIngresos  += palletsIn
    totalDespachos += palletsOut

    const guiasIn  = ins.flatMap(m => m.reports?.sec1_guia_numero ? [m.reports.sec1_guia_numero] : m.reports?.sec3_numero_guia ? [m.reports.sec3_numero_guia] : []).join(" ")
    const guiasOut = outs.flatMap(m => m.reports?.sec1_guia_numero ? [m.reports.sec1_guia_numero] : m.reports?.sec3_numero_guia ? [m.reports.sec3_numero_guia] : []).join(" ")
    const repsIn   = ins.map(m => m.reports?.numero ? `REP-${String(m.reports.numero).padStart(3,"0")}` : `MOV-${String(m.numero).padStart(3,"0")}`).join(" ")
    const repsOut  = outs.map(m => m.reports?.numero ? `REP-${String(m.reports.numero).padStart(3,"0")}` : `MOV-${String(m.numero).padStart(3,"0")}`).join(" ")
    const operador = dayMovs[0]?.operador ?? ""

    if (dayMovs.length > 0 || dailyLog.length > 0) {
      dailyLog.push({
        fecha: dateStr, operador,
        guias_in: guiasIn, pallets_in: palletsIn, reports_in: repsIn,
        guias_out: guiasOut, pallets_out: palletsOut, reports_out: repsOut,
        stock: Math.max(stock, 0),
        tarifa_dia: Math.max(stock, 0) * tarifaAlmacenaje,
      })
    }
  }

  return { palletDays, totalIngresos, totalDespachos, dailyLog }
}

// ── Tarifa Dialog ──────────────────────────────────────────────────────────────
function TarifaDialog({
  clienteId, clienteNombre, existing, onClose, onSaved,
}: {
  clienteId: string; clienteNombre: string
  existing: TarifaCliente | null
  onClose: () => void
  onSaved: (t: TarifaCliente) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<TarifaClienteInsert>>({
    cliente_id:            clienteId,
    cotizacion_numero:     existing?.cotizacion_numero     ?? "",
    clase_imo:             existing?.clase_imo             ?? "",
    tarifa_almacenaje_uf:  existing?.tarifa_almacenaje_uf  ?? null,
    tarifa_inout_uf:       existing?.tarifa_inout_uf       ?? 0.06,
    tarifa_descons_20_uf:  existing?.tarifa_descons_20_uf  ?? null,
    tarifa_descons_40_uf:  existing?.tarifa_descons_40_uf  ?? null,
    tarifa_consolid_40_uf: existing?.tarifa_consolid_40_uf ?? null,
    tarifa_porteo_uf:      existing?.tarifa_porteo_uf      ?? null,
    tarifa_palletizado_uf: existing?.tarifa_palletizado_uf ?? null,
    facturacion_minima_uf: existing?.facturacion_minima_uf ?? null,
    activo: true,
  })

  function setField<K extends keyof TarifaClienteInsert>(k: K, v: TarifaClienteInsert[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function num(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n }

  async function handleSave() {
    if (!form.cotizacion_numero?.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = { ...form, cliente_id: clienteId, activo: true }
    let data, error
    if (existing) {
      ;({ data, error } = await supabase.from("tarifas_cliente").update(payload).eq("id", existing.id).select().single())
    } else {
      ;({ data, error } = await supabase.from("tarifas_cliente").insert(payload).select().single())
    }
    setSaving(false)
    if (!error && data) onSaved(data as TarifaCliente)
  }

  const fieldCls = "h-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1"
  const labelCls = "text-[11px] text-muted-foreground"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background rounded-xl border border-border/60 shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h2 className="text-[14px] font-semibold">Configurar tarifas</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Cotización N°</Label>
              <Input className={fieldCls} value={form.cotizacion_numero ?? ""} onChange={e => setField("cotizacion_numero", e.target.value)} placeholder="Ej: 1415 del 17/04/2019" />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Clase IMO</Label>
              <Input className={fieldCls} value={form.clase_imo ?? ""} onChange={e => setField("clase_imo", e.target.value)} placeholder="Ej: IMO 9, IMO 8, Normal" />
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tarifas (en UF)</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Almacenaje (UF/pallet/día)",  key: "tarifa_almacenaje_uf",  ph: "Ej: 0.0045" },
                { label: "IN / OUT (UF/pallet)",         key: "tarifa_inout_uf",       ph: "Ej: 0.06"   },
                { label: "Desconsolidación 20\" (UF/cont)", key: "tarifa_descons_20_uf", ph: "Ej: 3.5" },
                { label: "Desconsolidación 40\" (UF/cont)", key: "tarifa_descons_40_uf", ph: "Ej: 5.0" },
                { label: "Consolidación 40\" (UF/cont)",    key: "tarifa_consolid_40_uf", ph: "Ej: 4.0" },
                { label: "Porteo (UF/operación)",           key: "tarifa_porteo_uf",    ph: "Ej: 10.19" },
                { label: "Palletizado (UF/pallet)",         key: "tarifa_palletizado_uf", ph: "Ej: 0.321" },
                { label: "Facturación mínima (UF/mes)",     key: "facturacion_minima_uf", ph: "Ej: 5.0" },
              ].map(({ label, key, ph }) => (
                <div key={key} className="space-y-1">
                  <Label className={labelCls}>{label}</Label>
                  <Input className={fieldCls} type="number" step="0.0001"
                    value={form[key as keyof typeof form] ?? ""}
                    onChange={e => setField(key as keyof TarifaClienteInsert, num(e.target.value) as never)}
                    placeholder={ph}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px]">Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.cotizacion_numero?.trim()} className="h-8 text-[12px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Guardar tarifas
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HesPage() {
  const [clientes,       setClientes]       = useState<Cliente[]>([])
  const [search,         setSearch]         = useState("")
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [tarifa,         setTarifa]         = useState<TarifaCliente | null>(null)
  const [movs,           setMovs]           = useState<MovRaw[]>([])
  const [selectedMonth,  setSelectedMonth]  = useState(CURRENT_MONTH)
  const [selectedYear,   setSelectedYear]   = useState(CURRENT_YEAR)
  const [ufValue,        setUfValue]        = useState<string>("40120.20")
  const [tarifaDialog,   setTarifaDialog]   = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [exporting,      setExporting]      = useState(false)
  const [clientesLoaded, setClientesLoaded] = useState(false)
  const [tarifaMap,      setTarifaMap]      = useState<Record<string, boolean>>({})

  const selectedCliente = useMemo(() => clientes.find(c => c.id === selectedId) ?? null, [clientes, selectedId])

  // ── Load clientes + tarifa map ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("clientes").select("*").eq("activo", true).order("nombre"),
      supabase.from("tarifas_cliente").select("cliente_id").eq("activo", true),
    ]).then(([{ data: cls }, { data: tars }]) => {
      setClientes(cls ?? [])
      const map: Record<string, boolean> = {}
      for (const t of tars ?? []) map[t.cliente_id] = true
      setTarifaMap(map)
      setClientesLoaded(true)
    })
  }, [])

  // ── Load tarifa for selected client ────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setTarifa(null); return }
    const supabase = createClient()
    supabase.from("tarifas_cliente").select("*").eq("cliente_id", selectedId).eq("activo", true).single()
      .then(({ data }) => setTarifa(data ?? null))
  }, [selectedId])

  // ── Load movimientos for selected client + year ────────────────────────────
  const loadMovimientos = useCallback(async () => {
    if (!selectedId) return
    setLoading(true)
    const supabase = createClient()
    // Load all movimientos up to end of selected month (for stock reconstruction)
    const endDate = `${selectedYear}-${pad(selectedMonth + 1)}-${pad(daysInMonth(selectedYear, selectedMonth))}`
    const { data } = await supabase
      .from("movimientos")
      .select("id, numero, tipo, unidades, operador, fecha, report_id, reports(numero, sec1_guia_numero, sec3_numero_guia)")
      .eq("cliente_id", selectedId)
      .lte("fecha", endDate)
      .order("fecha")
    setMovs((data as MovRaw[]) ?? [])
    setLoading(false)
  }, [selectedId, selectedMonth, selectedYear])

  useEffect(() => { loadMovimientos() }, [loadMovimientos])

  // ── Compute HES ────────────────────────────────────────────────────────────
  const hes = useMemo<HesResult | null>(() => {
    if (!selectedId || movs.length === 0) return null
    const tarifaAlmacenaje = tarifa?.tarifa_almacenaje_uf ?? 0
    return computeHES(movs, selectedYear, selectedMonth, tarifaAlmacenaje)
  }, [movs, selectedId, selectedYear, selectedMonth, tarifa])

  // ── Billing summary ────────────────────────────────────────────────────────
  const billing = useMemo(() => {
    if (!hes || !tarifa) return null
    const uf = parseFloat(ufValue) || 0

    const rows: { label: string; qty: number | string; unit: string; tarifa: number; totalUF: number }[] = []
    const addRow = (label: string, qty: number, unit: string, t: number | null) => {
      if (!t || qty === 0) return
      rows.push({ label, qty, unit, tarifa: t, totalUF: qty * t })
    }

    addRow("Almacenaje pallets", hes.palletDays, "pallet-días", tarifa.tarifa_almacenaje_uf)
    addRow("Ingreso pallets a bodega", hes.totalIngresos, "pallets", tarifa.tarifa_inout_uf)
    addRow("Salida pallets desde bodega", hes.totalDespachos, "pallets", tarifa.tarifa_inout_uf)

    const totalUF  = rows.reduce((s, r) => s + r.totalUF, 0)
    const totalCLP = totalUF * uf
    const minUF    = tarifa.facturacion_minima_uf ?? 0
    const finalUF  = Math.max(totalUF, minUF)

    return { rows, totalUF, totalCLP: totalUF * uf, finalUF, finalCLP: finalUF * uf, hasMin: finalUF > totalUF }
  }, [hes, tarifa, ufValue])

  // ── Filtered clients ───────────────────────────────────────────────────────
  const filteredClientes = useMemo(() =>
    clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()) || c.rut.includes(search)),
    [clientes, search]
  )

  // ── Print ──────────────────────────────────────────────────────────────────
  function handlePrint() { window.print() }

  // ── Export Excel ───────────────────────────────────────────────────────────
  async function handleExportExcel() {
    if (!selectedCliente || !tarifa || !billing || !hes) return
    setExporting(true)
    try {
      const res = await fetch("/api/hes/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          cliente: {
            nombre:   selectedCliente.nombre,
            rut:      selectedCliente.rut,
            email:    selectedCliente.email,
            contacto: selectedCliente.contacto,
          },
          tarifa,
          billing,
          hes,
          mes: selectedMonth,
          anio: selectedYear,
          ufValue,
        }),
      })
      if (!res.ok) throw new Error("Error al generar Excel")
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `HES_${selectedCliente.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${MESES[selectedMonth].toUpperCase()}_${selectedYear}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {tarifaDialog && selectedCliente && (
        <TarifaDialog
          clienteId={selectedCliente.id}
          clienteNombre={selectedCliente.nombre}
          existing={tarifa}
          onClose={() => setTarifaDialog(false)}
          onSaved={t => { setTarifa(t); setTarifaMap(m => ({ ...m, [t.cliente_id]: true })); setTarifaDialog(false) }}
        />
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden print:overflow-visible">

        {/* ── Panel izquierdo: clientes ── */}
        <div className="w-64 flex-shrink-0 border-r border-border/60 flex flex-col bg-background print:hidden">
          <div className="p-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-8 pl-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1 rounded-lg" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!clientesLoaded ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredClientes.map(c => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/20",
                  selectedId === c.id ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/40"
                )}>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[12px] font-medium truncate", selectedId === c.id && "text-primary")}>{c.nombre}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.rut}</p>
                </div>
                <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", tarifaMap[c.id] ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                {selectedId === c.id && <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Con tarifas configuradas
          </div>
        </div>

        {/* ── Panel derecho ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!selectedCliente ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecciona un cliente para generar su HES</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 flex-shrink-0 print:hidden">
                <div>
                  <h2 className="text-[14px] font-bold tracking-tight">{selectedCliente.nombre}</h2>
                  <p className="text-[11px] text-muted-foreground">RUT {selectedCliente.rut}{tarifa ? ` · Cot. ${tarifa.cotizacion_numero}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Month + Year selectors */}
                  <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}
                    className="h-7 text-[12px] rounded-md border border-border/50 bg-background px-2 focus:outline-none">
                    {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}
                    className="h-7 text-[12px] rounded-md border border-border/50 bg-background px-2 focus:outline-none">
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <Button variant="ghost" size="sm" onClick={loadMovimientos} disabled={loading} className="h-7 w-7 p-0">
                    <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setTarifaDialog(true)} className="h-7 gap-1.5 text-[11px]">
                    <Settings2 className="h-3 w-3" />
                    {tarifa ? "Editar tarifas" : "Configurar tarifas"}
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={handleExportExcel}
                    disabled={exporting || !tarifa || !billing || !hes}
                    className="h-7 gap-1.5 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                  >
                    {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    Excel
                  </Button>
                  <Button size="sm" onClick={handlePrint} className="h-7 gap-1.5 text-[11px]">
                    <Printer className="h-3 w-3" /> PDF
                  </Button>
                </div>
              </div>

              {/* HES Document */}
              <div className="flex-1 overflow-y-auto p-5 bg-muted/10">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !tarifa ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <AlertCircle className="h-10 w-10 text-amber-500/60" />
                    <p className="text-sm font-medium">Sin tarifas configuradas</p>
                    <p className="text-xs text-muted-foreground">Configura las tarifas de este cliente para generar el HES</p>
                    <Button size="sm" onClick={() => setTarifaDialog(true)} className="mt-1 h-8 gap-1.5 text-[12px]">
                      <Settings2 className="h-3.5 w-3.5" /> Configurar tarifas
                    </Button>
                  </div>
                ) : (
                  <div className="max-w-5xl mx-auto space-y-4 print:max-w-none print:space-y-3">

                    {/* ── HES Header (printable) ── */}
                    <div className="bg-background rounded-xl border border-border/40 shadow-sm px-6 py-5 print:border-0 print:shadow-none print:px-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hoja de Estado de Servicio</p>
                          <h1 className="text-lg font-bold mt-1">HES {selectedCliente.nombre.toUpperCase()} {tarifa.clase_imo ? `· ${tarifa.clase_imo}` : ""}</h1>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{MESES[selectedMonth].toUpperCase()} DE {selectedYear}</p>
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="text-[11px] text-muted-foreground">Cotización N° <span className="font-semibold text-foreground">{tarifa.cotizacion_numero}</span></p>
                          {tarifa.clase_imo && <p className="text-[11px] text-muted-foreground">Clase <span className="font-semibold text-foreground">{tarifa.clase_imo}</span></p>}
                          <div className="flex items-center gap-1.5 mt-2 justify-end">
                            <span className="text-[10px] text-muted-foreground">UF al {pad(daysInMonth(selectedYear, selectedMonth))}/{pad(selectedMonth+1)}/{selectedYear}</span>
                            <Input value={ufValue} onChange={e => setUfValue(e.target.value)}
                              className="h-6 w-28 text-[11px] text-right bg-muted/40 border-border/50 print:hidden" placeholder="$40.120,20" />
                            <span className="hidden print:inline text-[11px] font-semibold">${parseFloat(ufValue).toLocaleString("es-CL")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-4 pt-3 border-t border-border/30">
                        <div><p className="text-[10px] text-muted-foreground">RUT</p><p className="text-[12px] font-medium">{selectedCliente.rut}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Email</p><p className="text-[12px] font-medium">{selectedCliente.email ?? "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">Contacto</p><p className="text-[12px] font-medium">{selectedCliente.contacto ?? "—"}</p></div>
                      </div>
                    </div>

                    {/* ── Resumen de cobro ── */}
                    {billing && (
                      <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[12px] font-semibold">Resumen de cobro — {MESES[selectedMonth]} {selectedYear}</span>
                        </div>
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-border/30 bg-muted/10">
                              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripción</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cantidad</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tarifa (UF)</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total Neto (UF)</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total Neto ($)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billing.rows.map((r, i) => (
                              <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="px-4 py-2">{r.label}</td>
                                <td className="text-right px-3 py-2 font-mono">{typeof r.qty === "number" ? r.qty.toLocaleString("es-CL") : r.qty} <span className="text-muted-foreground text-[10px]">{r.unit}</span></td>
                                <td className="text-right px-3 py-2 font-mono">{fmtUF(r.tarifa)}</td>
                                <td className="text-right px-3 py-2 font-mono font-semibold">{fmtUF(r.totalUF)}</td>
                                <td className="text-right px-4 py-2 font-mono text-muted-foreground">{fmtCLP(r.totalUF * (parseFloat(ufValue) || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            {billing.hasMin && (
                              <tr className="border-t border-border/30 bg-amber-50/30 dark:bg-amber-900/10">
                                <td colSpan={3} className="px-4 py-2 text-[11px] text-amber-600 dark:text-amber-400">Facturación mínima aplicada ({fmtUF(tarifa.facturacion_minima_uf!)} UF/mes)</td>
                                <td className="text-right px-3 py-2 font-mono font-bold text-amber-600">{fmtUF(billing.finalUF)}</td>
                                <td className="text-right px-4 py-2 font-mono text-amber-600">{fmtCLP(billing.finalCLP)}</td>
                              </tr>
                            )}
                            <tr className="border-t-2 border-border/60 bg-primary/5 font-bold">
                              <td colSpan={3} className="px-4 py-2.5 text-[13px]">TOTAL NETO</td>
                              <td className="text-right px-3 py-2.5 font-mono text-[13px]">{fmtUF(billing.finalUF)} UF</td>
                              <td className="text-right px-4 py-2.5 font-mono text-[13px] text-primary">{fmtCLP(billing.finalCLP)}</td>
                            </tr>
                          </tfoot>
                        </table>

                        {/* KPI chips */}
                        <div className="flex gap-3 px-4 py-3 border-t border-border/30 bg-muted/10">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Pallet-días</p>
                            <p className="text-[13px] font-bold">{hes?.palletDays.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Ingresos</p>
                            <p className="text-[13px] font-bold text-emerald-600">{hes?.totalIngresos.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Despachos</p>
                            <p className="text-[13px] font-bold text-amber-600">{hes?.totalDespachos.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Días con movimiento</p>
                            <p className="text-[13px] font-bold">{hes?.dailyLog.length}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Log diario ── */}
                    {hes && hes.dailyLog.length > 0 && (
                      <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[12px] font-semibold">Log diario — {MESES[selectedMonth]} {selectedYear}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{hes.dailyLog.length} días</Badge>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] min-w-[900px]">
                            <thead>
                              <tr className="border-b border-border/30 bg-muted/10 text-muted-foreground">
                                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                                <th className="text-left px-3 py-2 font-medium">Operador</th>
                                <th className="text-left px-3 py-2 font-medium">G.D. Ingreso</th>
                                <th className="text-right px-3 py-2 font-medium">Pallets IN</th>
                                <th className="text-left px-3 py-2 font-medium">Report IN</th>
                                <th className="text-left px-3 py-2 font-medium">G.D. Salida</th>
                                <th className="text-right px-3 py-2 font-medium">Pallets OUT</th>
                                <th className="text-left px-3 py-2 font-medium">Report OUT</th>
                                <th className="text-right px-3 py-2 font-medium">Stock</th>
                                <th className="text-right px-3 py-2 font-medium">Tarifa (UF)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hes.dailyLog.map((row, i) => (
                                <tr key={i} className={cn(
                                  "border-b border-border/15",
                                  (row.pallets_in > 0 || row.pallets_out > 0) ? "hover:bg-muted/30" : "text-muted-foreground/50"
                                )}>
                                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">{row.fecha.split("-").reverse().join("-")}</td>
                                  <td className="px-3 py-1.5 truncate max-w-[80px]">{row.operador || "—"}</td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[80px]">{row.guias_in || "—"}</td>
                                  <td className={cn("text-right px-3 py-1.5 font-mono font-semibold", row.pallets_in > 0 ? "text-emerald-600" : "text-muted-foreground/30")}>
                                    {row.pallets_in > 0 ? row.pallets_in : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-primary/70 truncate max-w-[100px]">{row.reports_in || "—"}</td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[80px]">{row.guias_out || "—"}</td>
                                  <td className={cn("text-right px-3 py-1.5 font-mono font-semibold", row.pallets_out > 0 ? "text-amber-600" : "text-muted-foreground/30")}>
                                    {row.pallets_out > 0 ? row.pallets_out : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-primary/70 truncate max-w-[100px]">{row.reports_out || "—"}</td>
                                  <td className="text-right px-3 py-1.5 font-mono font-bold">{row.stock.toLocaleString("es-CL")}</td>
                                  <td className="text-right px-3 py-1.5 font-mono text-muted-foreground">{row.tarifa_dia > 0 ? fmtUF(row.tarifa_dia) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="border-t-2 border-border/60 font-bold bg-muted/10">
                              <tr>
                                <td colSpan={3} className="px-3 py-2 text-[11px]">TOTAL {MESES[selectedMonth].toUpperCase()} {selectedYear}</td>
                                <td className="text-right px-3 py-2 font-mono text-emerald-600">{hes.totalIngresos.toLocaleString("es-CL")}</td>
                                <td />
                                <td />
                                <td className="text-right px-3 py-2 font-mono text-amber-600">{hes.totalDespachos.toLocaleString("es-CL")}</td>
                                <td />
                                <td className="text-right px-3 py-2 font-mono">{hes.dailyLog[hes.dailyLog.length - 1]?.stock.toLocaleString("es-CL")}</td>
                                <td className="text-right px-3 py-2 font-mono">{fmtUF(hes.palletDays * (tarifa?.tarifa_almacenaje_uf ?? 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {!hes && !loading && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8 opacity-20" />
                        <p className="text-sm">Sin movimientos registrados para {MESES[selectedMonth]} {selectedYear}</p>
                      </div>
                    )}

                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { font-size: 10px; }
          .print\\:hidden { display: none !important; }
          .print\\:inline { display: inline !important; }
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </>
  )
}
