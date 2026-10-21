"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Package, ArrowDownCircle, ArrowUpCircle, Users,
  AlertTriangle, FileDown, RefreshCw,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { createClient } from "@/lib/supabase"
import { fetchTodas } from "@/lib/fetch-todas"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { useAnalitica, MESES, type Periodo } from "@/hooks/use-analitica"
import { CargasActivasCard, ClientesActivosCard, DistribucionAreaCard } from "@/components/dashboard/analitica-cards"
import { downloadAnaliticaPDF } from "@/lib/download-analitica-pdf"
import { AnaliticaPreviewModal } from "@/components/analitica/analitica-preview-modal"
import type { AnaliticaPDFData } from "@/components/analitica/analitica-pdf"

// ── Constantes ─────────────────────────────────────────────────────────────────
// ── Helpers ────────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Buen día"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

function getDayStr() {
  return new Date()
    .toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(/^\w/, c => c.toUpperCase())
}

function pctChange(curr: number, prev: number): string | null {
  if (prev === 0) return null
  const p = Math.round(((curr - prev) / prev) * 100)
  return p >= 0 ? `+${p}% vs mes ant.` : `${p}% vs mes ant.`
}

function isPositiveDelta(str: string | null): boolean | null {
  if (!str) return null
  return str.startsWith("+")
}

function buildChartData(movs: { tipo: string; fecha: string }[], months = 6) {
  const now = new Date()
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1)
    const tYear  = d.getFullYear()
    const tMonth = d.getMonth()
    const mes = d.toLocaleDateString("es-CL", { month: "short" })
      .replace(".", "")
      .replace(/^\w/, c => c.toUpperCase())
    const monthly = movs.filter(m => {
      const md = new Date(m.fecha)
      return md.getFullYear() === tYear && md.getMonth() === tMonth
    })
    return {
      mes,
      ingresos:  monthly.filter(m => m.tipo === "ingreso").length,
      despachos: monthly.filter(m => m.tipo === "despacho").length,
    }
  })
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface MovRow { tipo: string; fecha: string }
interface ChartPoint { mes: string; ingresos: number; despachos: number }

// ── Chart tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; fill: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-1.5 mt-0.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, unit, change, icon: Icon, iconColor, iconBg, positive,
}: {
  title: string; value: string; unit: string; change: string
  icon: React.ElementType; iconColor: string; iconBg: string; positive?: boolean | null
}) {
  return (
    <div className="bg-card border border-border rounded-lg px-3.5 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <div className={cn("h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0", iconBg)}>
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-medium tracking-tight tabular-nums text-foreground">{value}</p>
        <p className="text-[10.5px] text-muted-foreground truncate">{unit}</p>
      </div>
      <p className={cn(
        "text-[10px] font-medium",
        positive === true  ? "delta-up" :
        positive === false ? "delta-down" :
        "text-muted-foreground"
      )}>
        {change}
      </p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth()
  const nombre = profile?.nombre?.split(" ")[0] ?? "Admin"

  const now = new Date()
  const [periodo,  setPeriodo]  = useState<Periodo>("mensual")
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear,  setSelYear]  = useState(now.getFullYear())
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const an = useAnalitica(periodo, selMonth, selYear)
  const periodoLabel = periodo === "mensual" ? `${MESES[selMonth]} ${selYear}` : `Año ${selYear}`

  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [stock,      setStock]      = useState(0)
  const [entradas,   setEntradas]   = useState(0)
  const [salidas,    setSalidas]    = useState(0)
  const [clientes,   setClientes]   = useState(0)
  const [entChg,     setEntChg]     = useState<string | null>(null)
  const [salChg,     setSalChg]     = useState<string | null>(null)
  const [clientNew,  setClientNew]  = useState(0)
  const [allMovs,    setAllMovs]    = useState<MovRow[]>([])
  const [chartData,  setChartData]  = useState<ChartPoint[]>([])
  const [chartMonths, setChartMonths] = useState(6)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const now  = new Date()
    const yr   = now.getFullYear()
    const mo   = now.getMonth()
    const curr         = new Date(yr, mo, 1).toISOString()
    const prev         = new Date(yr, mo - 1, 1).toISOString()
    const twelveMonthsAgo = new Date(yr, mo - 11, 1).toISOString()

    const [
      { data: itemsRaw,      error: e1 },
      { data: movsRaw,       error: e2 },
      { count: clientTotal,  error: e3 },
      { count: clientNewCount, error: e4 },
    ] = await Promise.all([
      supabase.from("inventario_items").select("stock_actual").eq("activo", true),
      fetchTodas<MovRow>((d, h) => supabase.from("movimientos").select("tipo, fecha").gte("fecha", twelveMonthsAgo).order("fecha", { ascending: false }).order("numero").range(d, h)),
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", curr),
    ])

    const queryError = e1 ?? e2 ?? e3 ?? e4
    if (queryError) { setFetchError(queryError.message); setLoading(false); return }

    const items = (itemsRaw ?? []) as { stock_actual: number }[]
    const movs  = (movsRaw  ?? []) as MovRow[]

    const totalStock = items.reduce((s, i) => s + i.stock_actual, 0)
    const currMovs = movs.filter(m => m.fecha >= curr)
    const prevMovs = movs.filter(m => m.fecha >= prev && m.fecha < curr)
    const cEnt = currMovs.filter(m => m.tipo === "ingreso").length
    const cSal = currMovs.filter(m => m.tipo === "despacho").length
    const pEnt = prevMovs.filter(m => m.tipo === "ingreso").length
    const pSal = prevMovs.filter(m => m.tipo === "despacho").length

    setStock(totalStock)
    setEntradas(cEnt)
    setSalidas(cSal)
    setClientes(clientTotal ?? 0)
    setEntChg(pctChange(cEnt, pEnt))
    setSalChg(pctChange(cSal, pSal))
    setClientNew(clientNewCount ?? 0)
    setAllMovs(movs)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setChartData(buildChartData(allMovs, chartMonths)) }, [chartMonths, allMovs])


  const pdfData: AnaliticaPDFData = {
    year: selYear, periodo, periodoLabel, kpis: an.kpis, mensual: an.mensual, topItems: an.topItems, topClientes: an.topClientes,
    areaData: an.areaData, stockStatus: an.stockStatus, reportsFunnel: an.reportsFunnel,
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {showPdfPreview && (
        <AnaliticaPreviewModal data={pdfData} onClose={() => setShowPdfPreview(false)} onDownload={() => downloadAnaliticaPDF(pdfData)} />
      )}
      <div className="p-3 sm:p-4 flex flex-col gap-3 xl:flex-1 xl:min-h-0 xl:grid xl:grid-rows-[auto_auto_auto_1fr]">

        {/* ── Header ── */}
        <div className="flex items-baseline justify-between gap-3 py-1">
          <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
            <h1 className="text-base font-medium tracking-tight text-foreground flex-shrink-0">
              {getGreeting()}, {nombre}
            </h1>
            <p className="section-label truncate">· {getDayStr()} · Camino La Pólvora 106, Valparaíso</p>
          </div>
        </div>

        {/* ── Error ── */}
        {fetchError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[12px]">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">Error al cargar datos: {fetchError}</span>
            <Button variant="ghost" size="sm" onClick={fetchData}
              className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/10">
              Reintentar
            </Button>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => (
                <div key={i} className="rounded-lg bg-muted/40 h-[72px] animate-pulse" />
              ))
            : (
              <>
                <KpiCard
                  title="Unidades en bodega"
                  value={stock.toLocaleString("es-CL")}
                  unit="ítems almacenados"
                  change="Stock actual total"
                  icon={Package}
                  iconBg="bg-[var(--color-status-info-bg)]"
                  iconColor="text-[var(--color-adp-blue)]"
                />
                <KpiCard
                  title="Ingresos del mes"
                  value={String(entradas)}
                  unit="recepciones registradas"
                  change={entChg ?? "mes actual"}
                  icon={ArrowDownCircle}
                  iconBg="bg-[var(--color-status-success-bg)]"
                  iconColor="text-[var(--color-status-success-text)]"
                  positive={isPositiveDelta(entChg)}
                />
                <KpiCard
                  title="Despachos del mes"
                  value={String(salidas)}
                  unit="salidas despachadas"
                  change={salChg ?? "mes actual"}
                  icon={ArrowUpCircle}
                  iconBg="bg-[var(--color-status-warning-bg)]"
                  iconColor="text-[var(--color-status-warning-text)]"
                  positive={isPositiveDelta(salChg)}
                />
                <KpiCard
                  title="Clientes activos"
                  value={String(clientes)}
                  unit="empresas con carga"
                  change={clientNew > 0 ? `+${clientNew} este mes` : "Sin cambios"}
                  icon={Users}
                  iconBg="bg-[var(--color-adp-celeste-light)]"
                  iconColor="text-[var(--color-adp-blue-mid)]"
                  positive={clientNew > 0 ? true : null}
                />
              </>
            )
          }
        </div>

        {/* ── Gráfico de tendencia ── */}
        <Card className="border-border bg-card">
          <CardHeader className="py-2 px-3.5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <CardTitle className="text-sm font-medium">Actividad mensual</CardTitle>
                <CardDescription className="text-[11px]">Ingresos y despachos — últimos 6 meses</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-[#22c55e] flex-shrink-0" />
                    Ingresos
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-[#f59e0b] flex-shrink-0" />
                    Despachos
                  </div>
                </div>
                <div className="flex items-center gap-0.5 bg-muted/60 rounded-md p-0.5">
                  {([6, 9, 12] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setChartMonths(m)}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                        chartMonths === m
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3.5 pt-2 pb-1.5">
            {loading ? (
              <div className="h-[76px] animate-pulse rounded-lg bg-muted/40" />
            ) : (
              <div className="h-[76px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    barGap={3}
                    barCategoryGap="40%"
                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      strokeOpacity={0.12}
                      vertical={false}
                      stroke="currentColor"
                    />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 10, fill: "currentColor", opacity: 0.5 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                    />
                    <Bar dataKey="ingresos"  name="Ingresos"  fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="despachos" name="Despachos" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Analítica del período — Cargas, Clientes y Distribución por área ── */}
        <div className="flex flex-col gap-3 xl:min-h-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-medium">Analítica del almacén</h2>
              <p className="text-[11px] text-muted-foreground">Resumen estadístico — {periodoLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                {(["mensual", "anual"] as const).map(p => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize",
                      periodo === p ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}>
                    {p}
                  </button>
                ))}
              </div>
              {periodo === "mensual" && (
                <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                  {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              )}
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                {Array.from({ length: now.getFullYear() - 2023 }, (_, i) => 2024 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={an.refetch} disabled={an.loading} className="h-8 w-8 p-0 text-muted-foreground" aria-label="Actualizar analítica">
                <RefreshCw className={cn("h-3 w-3", an.loading && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPdfPreview(true)} disabled={an.loading} className="h-8 gap-1.5 text-xs border-border/60">
                <FileDown className="h-3 w-3" /> Exportar PDF
              </Button>
            </div>
          </div>
          {an.fetchError && (
            <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              Error al cargar la analítica: {an.fetchError}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 xl:flex-1 xl:min-h-0">
          <CargasActivasCard loading={an.loading} topItems={an.topItems} periodoLabel={periodoLabel} />
          <ClientesActivosCard loading={an.loading} topClientes={an.topClientes} periodoLabel={periodoLabel} />
          <DistribucionAreaCard loading={an.loading} areaData={an.areaData} periodoLabel={periodoLabel} />
          </div>
        </div>
      </div>
    </div>
  )
}
