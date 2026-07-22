"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FileDown, TrendingUp, BarChart3,
  ArrowDownCircle, ArrowUpCircle, Users, Package,
  Loader2, RefreshCw, MapPin, Boxes, FileCheck2,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { downloadAnaliticaPDF } from "@/lib/download-analitica-pdf"
import { AnaliticaPreviewModal } from "@/components/analitica/analitica-preview-modal"
import type { AnaliticaPDFData } from "@/components/analitica/analitica-pdf"

// ── Helpers ────────────────────────────────────────────────────────────────────
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

function fmtPct(pct: number | null, fallback: string, vsLabel: string): string {
  if (pct === null) return fallback
  return pct > 0 ? `+${pct}% ${vsLabel}` : `${pct}% ${vsLabel}`
}

const AREA_COLORS: Record<string, { dot: string }> = {
  "Bodega IMO":      { dot: "bg-amber-500"   },
  "Zona Isotanques": { dot: "bg-sky-500"     },
  "Zona RESPEL":     { dot: "bg-rose-500"    },
  "Bodega General":  { dot: "bg-emerald-500" },
}
const AREA_ORDER = ["Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General"]

// ── Component ──────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const now = new Date()

  const [periodo,  setPeriodo]  = useState<"mensual" | "anual">("mensual")
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear,  setSelYear]  = useState(now.getFullYear())

  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [kpis,          setKpis]          = useState({ total: 0, entradas: 0, salidas: 0, clientes: 0, entPct: null as number | null, salPct: null as number | null })
  const [mensual,       setMensual]       = useState<{ mes: string; entradas: number; salidas: number }[]>([])
  const [topItems,      setTopItems]      = useState<{ nombre: string; entradas: number; salidas: number; total: number; pct: number }[]>([])
  const [topClientes,   setTopClientes]   = useState<{ nombre: string; total: number; pct: number }[]>([])
  const [areaData,      setAreaData]      = useState<{ area: string; entradas: number; salidas: number; total: number; pct: number }[]>([])
  const [stockStatus,   setStockStatus]   = useState({ normal: 0, bajo: 0, critico: 0, total: 0 })
  const [reportsFunnel, setReportsFunnel] = useState({ borradores: 0, pendientes: 0, despachados: 0, total: 0 })
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  const periodoLabel = periodo === "mensual" ? `${MESES[selMonth]} ${selYear}` : `Año ${selYear}`
  const vsLabel = periodo === "mensual" ? "vs mes ant." : "vs año ant."

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()

    // Pre-calcular rangos de fecha (necesarios para la query de reports en el batch paralelo)
    let currStart: Date, currEnd: Date, prevStart: Date, prevEnd: Date
    if (periodo === "mensual") {
      currStart = new Date(selYear, selMonth, 1)
      currEnd   = new Date(selYear, selMonth + 1, 1)
      prevStart = new Date(selYear, selMonth - 1, 1)
      prevEnd   = currStart
    } else {
      currStart = new Date(selYear, 0, 1)
      currEnd   = new Date(selYear + 1, 0, 1)
      prevStart = new Date(selYear - 1, 0, 1)
      prevEnd   = currStart
    }
    const currStartIso = currStart.toISOString()
    const currEndIso   = currEnd.toISOString()
    const prevStartIso = prevStart.toISOString()
    const prevEndIso   = prevEnd.toISOString()

    const [
      { data: movData,        error: e1 },
      { count: clientesCount, error: e2 },
      { data: stockData },
      { data: reportsData },
    ] = await Promise.all([
      supabase
        .from("movimientos")
        .select("tipo, fecha, carga, cliente_nombre, area")
        .gte("fecha", `${selYear - 1}-01-01T00:00:00`)
        .lt("fecha",  `${selYear + 1}-01-01T00:00:00`)
        .order("fecha"),
      supabase
        .from("clientes")
        .select("*", { count: "exact", head: true })
        .eq("activo", true),
      supabase
        .from("inventario_items")
        .select("stock_actual, stock_minimo")
        .eq("activo", true),
      supabase
        .from("reports")
        .select("estado")
        .gte("created_at", currStartIso)
        .lt("created_at", currEndIso),
    ])

    if (e1 ?? e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }

    const movs = movData ?? []

    const currMovs = movs.filter(m => m.fecha >= currStartIso && m.fecha < currEndIso)
    const prevMovs = movs.filter(m => m.fecha >= prevStartIso && m.fecha < prevEndIso)
    const currEnt  = currMovs.filter(m => m.tipo === "ingreso").length
    const currSal  = currMovs.filter(m => m.tipo === "despacho").length
    const prevEnt  = prevMovs.filter(m => m.tipo === "ingreso").length
    const prevSal  = prevMovs.filter(m => m.tipo === "despacho").length

    // ── Gráfico mensual: Ene-mes seleccionado (mensual) o año completo (anual) ─
    const map: Record<number, { entradas: number; salidas: number }> = {}
    const chartLastMonth = periodo === "mensual" ? selMonth : 11
    for (let i = 0; i <= chartLastMonth; i++) map[i] = { entradas: 0, salidas: 0 }
    for (const m of movs) {
      const d = new Date(m.fecha)
      if (d.getFullYear() !== selYear) continue
      const mi = d.getMonth()
      if (map[mi]) {
        if (m.tipo === "ingreso") map[mi].entradas++
        else map[mi].salidas++
      }
    }
    const mensualData = Object.entries(map).map(([i, v]) => ({
      mes: MESES[+i], entradas: v.entradas, salidas: v.salidas,
    }))

    // ── Top cargas con desglose entrada/salida ───────────────────────────────
    const cargaMap: Record<string, { entradas: number; salidas: number }> = {}
    for (const m of currMovs) {
      if (!m.carga) continue
      if (!cargaMap[m.carga]) cargaMap[m.carga] = { entradas: 0, salidas: 0 }
      if (m.tipo === "ingreso") cargaMap[m.carga].entradas++
      else cargaMap[m.carga].salidas++
    }
    const sortedCargas = Object.entries(cargaMap)
      .map(([nombre, v]) => ({ nombre, ...v, total: v.entradas + v.salidas }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
    const maxCarga = sortedCargas[0]?.total ?? 1
    const topData  = sortedCargas.map(item => ({ ...item, pct: Math.round((item.total / maxCarga) * 100) }))

    // ── Top clientes ─────────────────────────────────────────────────────────
    const clienteMap: Record<string, number> = {}
    for (const m of currMovs) {
      if (m.cliente_nombre) clienteMap[m.cliente_nombre] = (clienteMap[m.cliente_nombre] ?? 0) + 1
    }
    const sortedCli  = Object.entries(clienteMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const maxCli     = sortedCli[0]?.[1] ?? 1
    const topCliData = sortedCli.map(([nombre, total]) => ({ nombre, total, pct: Math.round((total / maxCli) * 100) }))

    // ── Distribución por área ─────────────────────────────────────────────────
    const areaMap: Record<string, { entradas: number; salidas: number }> = {}
    for (const m of currMovs) {
      const a = (m as { area?: string | null }).area
      if (!a) continue
      if (!areaMap[a]) areaMap[a] = { entradas: 0, salidas: 0 }
      if (m.tipo === "ingreso") areaMap[a].entradas++
      else areaMap[a].salidas++
    }
    const maxArea       = Math.max(...Object.values(areaMap).map(v => v.entradas + v.salidas), 1)
    const areaDataResult = AREA_ORDER.map(area => {
      const v = areaMap[area] ?? { entradas: 0, salidas: 0 }
      return { area, ...v, total: v.entradas + v.salidas, pct: Math.round(((v.entradas + v.salidas) / maxArea) * 100) }
    })

    // ── Estado de stock ───────────────────────────────────────────────────────
    let normal = 0, bajo = 0, critico = 0
    for (const item of stockData ?? []) {
      const sa = item.stock_actual as number
      const sm = item.stock_minimo as number
      if (sa === 0)       critico++
      else if (sa <= sm)  bajo++
      else                normal++
    }

    // ── Reports del período ───────────────────────────────────────────────────
    let borradores = 0, pendientes = 0, despachados = 0
    for (const r of reportsData ?? []) {
      if (r.estado === "borrador")             borradores++
      else if (r.estado === "pendiente_despacho") pendientes++
      else if (r.estado === "despachado")      despachados++
    }

    setKpis({ total: currMovs.length, entradas: currEnt, salidas: currSal, clientes: clientesCount ?? 0, entPct: pctChange(currEnt, prevEnt), salPct: pctChange(currSal, prevSal) })
    setMensual(mensualData)
    setTopItems(topData)
    setTopClientes(topCliData)
    setAreaData(areaDataResult)
    setStockStatus({ normal, bajo, critico, total: normal + bajo + critico })
    setReportsFunnel({ borradores, pendientes, despachados, total: borradores + pendientes + despachados })
    setLoading(false)
  }, [periodo, selMonth, selYear])

  useEffect(() => { fetchData() }, [fetchData])

  const maxVal  = Math.max(...mensual.flatMap(m => [m.entradas, m.salidas]), 1)
  const currMes = mensual[mensual.length - 1]
  const prevMes = mensual.length > 1 ? mensual[mensual.length - 2] : null

  const summaryCards = [
    { label: "Total movimientos", value: String(kpis.total),    sub: periodoLabel,                              icon: BarChart3,       gradient: "from-[#0A4A7F] to-[#1A5276]"   },
    { label: "Entradas",          value: String(kpis.entradas), sub: fmtPct(kpis.entPct, periodoLabel, vsLabel), icon: ArrowDownCircle, gradient: "from-emerald-600 to-emerald-700" },
    { label: "Salidas",           value: String(kpis.salidas),  sub: fmtPct(kpis.salPct, periodoLabel, vsLabel), icon: ArrowUpCircle,   gradient: "from-amber-500 to-orange-500"   },
    { label: "Clientes activos",  value: String(kpis.clientes), sub: "empresas",                                icon: Users,           gradient: "from-[#29ABE2] to-[#1A8BBD]"   },
  ]

  const pdfData: AnaliticaPDFData = {
    year: selYear, periodo, periodoLabel, kpis, mensual, topItems, topClientes,
    areaData, stockStatus, reportsFunnel,
  }

  return (
    <>
    {showPdfPreview && (
      <AnaliticaPreviewModal
        data={pdfData}
        onClose={() => setShowPdfPreview(false)}
        onDownload={() => downloadAnaliticaPDF(pdfData)}
      />
    )}
    <div className="h-full overflow-y-auto lg:overflow-hidden">
      <div className="flex flex-col gap-3 p-3 sm:p-4 bg-muted/20 lg:h-full lg:grid lg:grid-rows-[auto_auto_1fr]">

        {/* Cabecera */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold tracking-tight">Analítica del almacén</h2>
              <p className="text-xs text-muted-foreground">Resumen estadístico — {periodoLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="h-7 w-7 p-0 text-muted-foreground">
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPdfPreview(true)} disabled={loading} className="h-7 gap-1.5 text-xs border-border/60">
                <FileDown className="h-3 w-3" /> Exportar PDF
              </Button>
            </div>
          </div>

          {/* Selector de periodo */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              {(["mensual", "anual"] as const).map(p => (
                <button key={p} onClick={() => setPeriodo(p)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize",
                    periodo === p
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}>
                  {p}
                </button>
              ))}
            </div>
            {periodo === "mensual" && (
              <select
                value={selMonth}
                onChange={e => setSelMonth(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
            <select
              value={selYear}
              onChange={e => setSelYear(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {Array.from({ length: now.getFullYear() - 2023 }, (_, i) => 2024 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {fetchError && (
            <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              Error al cargar datos: {fetchError}
            </div>
          )}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => <div key={i} className="rounded-xl bg-muted/50 h-24 animate-pulse" />)
            : summaryCards.map((s) => (
                <div key={s.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${s.gradient} px-4 py-3 text-white shadow-sm`}>
                  <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-white/5 -translate-y-5 translate-x-5" />
                  <div className="mb-2">
                    <div className="p-1.5 rounded-lg bg-white/20 inline-flex"><s.icon className="h-3.5 w-3.5 text-white" /></div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight leading-none">{s.value}</p>
                  <p className="text-white/75 text-[11px] mt-1 leading-tight">{s.label}</p>
                  <p className="text-white/45 text-[10px] mt-0.5 truncate">{s.sub}</p>
                </div>
              ))
          }
        </div>

        {/* Gráficos — versión detallada: móvil (scroll de página) y desde 1280px (3 columnas) */}
        <div className="grid grid-cols-1 lg:hidden xl:grid xl:grid-cols-3 gap-3 lg:min-h-0">

          {/* Gráfico mensual */}
          <Card className="border-border/40 shadow-sm bg-background lg:flex lg:flex-col lg:min-h-0">
            <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10"><BarChart3 className="h-3.5 w-3.5 text-primary" /></div>
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Movimientos por mes</CardTitle>
                  <CardDescription className="text-xs">Entradas vs salidas — {selYear}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col px-4 py-3 gap-3 lg:flex-1 lg:min-h-0">
              {loading ? (
                <div className="h-32 lg:flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : mensual.length === 0 ? (
                <div className="h-32 lg:flex-1 flex flex-col items-center justify-center gap-2">
                  <div className="p-3 rounded-xl bg-muted/50">
                    <BarChart3 className="h-6 w-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-0.5 sm:gap-1.5 h-[120px] lg:flex-1 lg:h-auto lg:min-h-0">
                    {mensual.map((m) => {
                      const total = m.entradas + m.salidas
                      return (
                        <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5 h-full group relative">
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            {total > 0 && (
                              <div className="bg-foreground text-background rounded px-1.5 py-1 shadow-lg text-center whitespace-nowrap">
                                <p className="text-[10px] font-bold leading-none">{total}</p>
                                <p className="text-[9px] mt-0.5 opacity-70">↓{m.entradas} ↑{m.salidas}</p>
                              </div>
                            )}
                          </div>
                          <div className="w-full flex gap-px items-end flex-1">
                            <div className="flex-1 bg-primary rounded-t-sm transition-all"
                              style={{ height: `${(m.entradas / maxVal) * 100}%` }} />
                            <div className="flex-1 rounded-t-sm transition-all"
                              style={{ height: `${(m.salidas / maxVal) * 100}%`, backgroundColor: "#29ABE2" }} />
                          </div>
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium flex-shrink-0">{m.mes}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-3 rounded-sm bg-primary inline-block" /> Entradas
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-3 rounded-sm inline-block" style={{ backgroundColor: "#29ABE2" }} /> Salidas
                    </div>
                  </div>

                  {currMes && (
                    <div className="border-t border-border/30 pt-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{currMes.mes} {selYear}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-base font-bold text-foreground leading-none">{currMes.entradas + currMes.salidas}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-emerald-600 leading-none">{currMes.entradas}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Entradas</p>
                        </div>
                        <div>
                          <p className="text-base font-bold text-amber-500 leading-none">{currMes.salidas}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Salidas</p>
                        </div>
                      </div>
                      {prevMes && (
                        <p className="text-[10px] text-muted-foreground mt-2 text-center">
                          {prevMes.mes}: {prevMes.entradas + prevMes.salidas} mov · ↓{prevMes.entradas} ent · ↑{prevMes.salidas} sal
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Columna centro: top cargas + top clientes */}
          <div className="flex flex-col gap-3 lg:min-h-0">

            {/* Top cargas */}
            <Card className="border-border/40 shadow-sm bg-background min-h-[180px] lg:min-h-0 lg:flex lg:flex-col lg:flex-1">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10"><TrendingUp className="h-3.5 w-3.5 text-primary" /></div>
                    <div>
                      <CardTitle className="text-sm font-bold tracking-tight">Cargas más activas</CardTitle>
                      <CardDescription className="text-xs">Por movimientos — {periodoLabel}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Ent.</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Sal.</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col justify-between px-4 py-3 lg:flex-1 lg:min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : topItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8">
                    <div className="p-3 rounded-xl bg-muted/50"><TrendingUp className="h-6 w-6 text-muted-foreground/25" /></div>
                    <p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {topItems.map((p, i) => {
                      const entrRatio = p.total > 0 ? Math.round((p.entradas / p.total) * 100) : 0
                      return (
                        <div key={p.nombre}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-bold text-muted-foreground/40 w-4 flex-shrink-0">#{i + 1}</span>
                              <div className="p-1 bg-muted rounded flex-shrink-0"><Package className="h-2.5 w-2.5 text-muted-foreground" /></div>
                              <span className="text-xs font-medium truncate">{p.nombre}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-[10px] text-emerald-600 font-medium">↓{p.entradas}</span>
                              <span className="text-[10px] text-amber-500 font-medium">↑{p.salidas}</span>
                              <span className="text-xs font-bold text-foreground w-4 text-right">{p.total}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className="h-full flex overflow-hidden" style={{ width: `${p.pct}%` }}>
                              <div className="h-full bg-emerald-500" style={{ width: `${entrRatio}%` }} />
                              <div className="h-full bg-amber-400 flex-1" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top clientes */}
            <Card className="border-border/40 shadow-sm bg-background min-h-[180px] lg:min-h-0 lg:flex lg:flex-col lg:flex-1">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#29ABE2]/10"><Users className="h-3.5 w-3.5 text-[#29ABE2]" /></div>
                  <div>
                    <CardTitle className="text-sm font-bold tracking-tight">Clientes más activos</CardTitle>
                    <CardDescription className="text-xs">Por movimientos — {periodoLabel}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col justify-between px-4 py-3 lg:flex-1 lg:min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : topClientes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8">
                    <div className="p-3 rounded-xl bg-muted/50"><Users className="h-6 w-6 text-muted-foreground/25" /></div>
                    <p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {topClientes.map((c, i) => (
                      <div key={c.nombre}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-muted-foreground/40 w-4 flex-shrink-0">#{i + 1}</span>
                            <div className="h-5 w-5 rounded-full bg-[#29ABE2]/10 flex items-center justify-center flex-shrink-0">
                              <Users className="h-2.5 w-2.5 text-[#29ABE2]" />
                            </div>
                            <span className="text-xs font-medium truncate">{c.nombre}</span>
                          </div>
                          <span className="text-xs font-bold ml-2 flex-shrink-0">{c.total}</span>
                        </div>
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#29ABE2]" style={{ width: `${c.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* Columna derecha: Área + (Stock & Reports combinados) */}
          <div className="flex flex-col gap-3 lg:min-h-0">

            {/* Distribución por área */}
            <Card className="border-border/40 shadow-sm bg-background min-h-[180px] lg:min-h-0 lg:flex lg:flex-col lg:flex-1">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10"><MapPin className="h-3.5 w-3.5 text-primary" /></div>
                  <div>
                    <CardTitle className="text-sm font-bold tracking-tight">Distribución por área</CardTitle>
                    <CardDescription className="text-xs">Movimientos por zona — {periodoLabel}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-3 flex flex-col justify-between gap-3 lg:flex-1 lg:min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {AREA_ORDER.map(area => {
                      const d  = areaData.find(x => x.area === area) ?? { area, entradas: 0, salidas: 0, total: 0, pct: 0 }
                      const ac = AREA_COLORS[area] ?? { dot: "bg-muted" }
                      const er = d.total > 0 ? Math.round((d.entradas / d.total) * 100) : 0
                      return (
                        <div key={area}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${ac.dot}`} />
                              <span className="text-xs font-medium truncate text-foreground/80">{area}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-[10px] text-emerald-600 font-medium">↓{d.entradas}</span>
                              <span className="text-[10px] text-amber-500 font-medium">↑{d.salidas}</span>
                              <span className="text-xs font-bold text-foreground w-4 text-right">{d.total}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            {d.total > 0 && (
                              <div className="h-full flex" style={{ width: `${Math.max(d.pct, 6)}%` }}>
                                <div className="h-full bg-emerald-500" style={{ width: `${er}%` }} />
                                <div className="h-full bg-amber-400 flex-1" />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stock al cierre + Reports — tarjeta unificada dividida en 2 columnas */}
            <Card className="border-border/40 shadow-sm bg-background min-h-[180px] lg:min-h-0 lg:flex lg:flex-col lg:flex-1">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10"><Boxes className="h-3.5 w-3.5 text-primary" /></div>
                    <CardTitle className="text-sm font-bold tracking-tight">Stock y Reports</CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <FileCheck2 className="h-3 w-3" />
                    <span>{periodoLabel}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex p-0 lg:flex-1 lg:min-h-0">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Stock */}
                    <div className="flex-1 flex flex-col gap-3 px-4 py-3 border-r border-border/30">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Stock actual</p>
                      <div className="flex flex-col gap-2.5 flex-1">
                        {([
                          { label: "Normal",  value: stockStatus.normal,  barCls: "bg-emerald-500", txtCls: "text-emerald-600 dark:text-emerald-400" },
                          { label: "Bajo",    value: stockStatus.bajo,    barCls: "bg-amber-400",   txtCls: "text-amber-500 dark:text-amber-400"   },
                          { label: "Crítico", value: stockStatus.critico, barCls: "bg-rose-500",    txtCls: "text-rose-600 dark:text-rose-400"     },
                        ] as const).map(({ label, value, barCls, txtCls }) => {
                          const pct = stockStatus.total > 0 ? Math.round((value / stockStatus.total) * 100) : 0
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${barCls}`} />
                                  <span className="text-[10px] font-medium text-foreground/80">{label}</span>
                                </div>
                                <span className={`text-[11px] font-bold ${txtCls}`}>{value}</span>
                              </div>
                              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">{stockStatus.total} ítems activos</p>
                    </div>

                    {/* Reports */}
                    <div className="flex-1 flex flex-col gap-3 px-4 py-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Reports</p>
                      <div className="flex flex-col gap-2.5 flex-1">
                        {([
                          { label: "Borradores",  value: reportsFunnel.borradores,  barCls: "bg-muted-foreground/40", txtCls: "text-muted-foreground"               },
                          { label: "Pendientes",  value: reportsFunnel.pendientes,  barCls: "bg-amber-400",           txtCls: "text-amber-500 dark:text-amber-400"   },
                          { label: "Despachados", value: reportsFunnel.despachados, barCls: "bg-emerald-500",         txtCls: "text-emerald-600 dark:text-emerald-400"},
                        ] as const).map(({ label, value, barCls, txtCls }) => {
                          const pct = reportsFunnel.total > 0 ? Math.round((value / reportsFunnel.total) * 100) : 0
                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-medium text-foreground/80">{label}</span>
                                <span className={`text-[11px] font-bold ${txtCls}`}>{value}</span>
                              </div>
                              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">{reportsFunnel.total} en el período</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Gráficos — versión compacta 768-1279px: gráfico arriba, 2x2 abajo, sin scroll.
            Flex-col (no grid) para que cada fila reciba una altura definida y las
            barras del gráfico (height en %) puedan resolverse correctamente. */}
        <div className="hidden lg:flex xl:hidden flex-col gap-2 lg:min-h-0 lg:flex-1">

          {/* Movimientos por mes — compacto */}
          <Card className="flex-[0.85] border-border/40 shadow-sm bg-background flex flex-col lg:min-h-0">
            <CardHeader className="py-1.5 px-3 border-b border-border/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <BarChart3 className="h-3 w-3 text-primary" /> Movimientos por mes
                </CardTitle>
                <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />Ent.</span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: "#29ABE2" }} />Sal.</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 py-2 flex-1 min-h-0">
              {loading ? (
                <div className="h-full flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : mensual.length === 0 ? (
                <div className="h-full flex items-center justify-center"><p className="text-[10px] text-muted-foreground">Sin movimientos registrados</p></div>
              ) : (
                <div className="flex items-end gap-1 h-full">
                  {mensual.map(m => (
                    <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5 h-full">
                      <div className="w-full flex gap-px items-end flex-1">
                        <div className="flex-1 bg-primary rounded-t-sm" style={{ height: `${(m.entradas / maxVal) * 100}%` }} />
                        <div className="flex-1 rounded-t-sm" style={{ height: `${(m.salidas / maxVal) * 100}%`, backgroundColor: "#29ABE2" }} />
                      </div>
                      <span className="text-[8px] text-muted-foreground font-medium flex-shrink-0">{m.mes}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fila 2: Cargas | Clientes */}
          <div className="flex-1 flex gap-2 lg:min-h-0">
            <Card className="flex-1 border-border/40 shadow-sm bg-background flex flex-col lg:min-h-0">
              <CardHeader className="py-1.5 px-3 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-primary" /> Cargas más activas
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 py-1.5 flex-1 min-h-0 flex flex-col justify-center gap-1.5">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                ) : topItems.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center">Sin datos</p>
                ) : topItems.slice(0, 3).map(p => (
                  <div key={p.nombre}>
                    <div className="flex items-center justify-between mb-0.5 gap-1">
                      <span className="text-[10px] font-medium truncate">{p.nombre}</span>
                      <span className="text-[10px] font-bold flex-shrink-0">{p.total}</span>
                    </div>
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="flex-1 border-border/40 shadow-sm bg-background flex flex-col lg:min-h-0">
              <CardHeader className="py-1.5 px-3 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-[#29ABE2]" /> Clientes más activos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 py-1.5 flex-1 min-h-0 flex flex-col justify-center gap-1.5">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                ) : topClientes.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center">Sin datos</p>
                ) : topClientes.slice(0, 3).map(c => (
                  <div key={c.nombre}>
                    <div className="flex items-center justify-between mb-0.5 gap-1">
                      <span className="text-[10px] font-medium truncate">{c.nombre}</span>
                      <span className="text-[10px] font-bold flex-shrink-0">{c.total}</span>
                    </div>
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#29ABE2]" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Fila 3: Distribución por área | Stock y Reports */}
          <div className="flex-1 flex gap-2 lg:min-h-0">
            <Card className="flex-1 border-border/40 shadow-sm bg-background flex flex-col lg:min-h-0">
              <CardHeader className="py-1.5 px-3 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-primary" /> Distribución por área
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 py-1.5 flex-1 min-h-0 flex flex-col justify-center gap-1">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                ) : AREA_ORDER.map(area => {
                  const d  = areaData.find(x => x.area === area) ?? { area, entradas: 0, salidas: 0, total: 0, pct: 0 }
                  const ac = AREA_COLORS[area] ?? { dot: "bg-muted" }
                  return (
                    <div key={area}>
                      <div className="flex items-center justify-between mb-0.5 gap-1 min-w-0">
                        <span className="flex items-center gap-1 min-w-0">
                          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${ac.dot}`} />
                          <span className="text-[10px] font-medium truncate text-foreground/80">{area}</span>
                        </span>
                        <span className="text-[10px] font-bold flex-shrink-0">{d.total}</span>
                      </div>
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${ac.dot}`} style={{ width: `${Math.max(d.pct, d.total > 0 ? 6 : 0)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="flex-1 border-border/40 shadow-sm bg-background flex flex-col lg:min-h-0">
              <CardHeader className="py-1.5 px-3 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-xs font-bold tracking-tight flex items-center gap-1.5">
                  <Boxes className="h-3 w-3 text-primary" /> Stock y Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 py-1.5 flex-1 min-h-0 flex flex-col justify-center gap-1">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                ) : (
                  <>
                    {([
                      { label: "Normal",      value: stockStatus.normal,        barCls: "bg-emerald-500"          },
                      { label: "Bajo",        value: stockStatus.bajo,          barCls: "bg-amber-400"            },
                      { label: "Crítico",     value: stockStatus.critico,       barCls: "bg-rose-500"             },
                      { label: "Borradores",  value: reportsFunnel.borradores,  barCls: "bg-muted-foreground/40"  },
                      { label: "Pendientes",  value: reportsFunnel.pendientes,  barCls: "bg-amber-400"            },
                      { label: "Despachados", value: reportsFunnel.despachados, barCls: "bg-emerald-500"          },
                    ] as const).map(({ label, value, barCls }, i) => {
                      const base = i < 3 ? stockStatus.total : reportsFunnel.total
                      const pct  = base > 0 ? Math.round((value / base) * 100) : 0
                      return (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="text-[9px] text-foreground/80 w-[62px] flex-shrink-0 truncate">{label}</span>
                          <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-bold w-3.5 text-right flex-shrink-0">{value}</span>
                        </div>
                      )
                    })}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
    </>
  )
}
