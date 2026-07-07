"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Package, ArrowDownCircle, ArrowUpCircle, Users,
  AlertTriangle, ArrowRight, RefreshCw, Loader2,
  CheckCircle2, Info,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

// ── Constantes ─────────────────────────────────────────────────────────────────
const AREAS = ["Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General"] as const
const AREA_DETAIL: Record<string, string> = {
  "Bodega IMO":      "Sustancias peligrosas",
  "Zona Isotanques": "Isotanques y contenedores",
  "Zona RESPEL":     "Residuos peligrosos",
  "Bodega General":  "Carga general y alimentos",
}

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

function movCodigo(n: number) {
  return `MOV-${String(n).padStart(3, "0")}`
}

function formatRelativa(iso: string) {
  const d   = new Date(iso)
  const now = new Date()
  const diffH = Math.floor((now.getTime() - d.getTime()) / 3_600_000)
  const t = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
  if (diffH < 24) return `Hoy ${t}`
  if (diffH < 48) return `Ayer ${t}`
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })
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
interface StockRow { area: string | null; stock_actual: number; stock_minimo: number }
interface MovRow   { numero: number; tipo: string; cliente_nombre: string | null; carga: string; unidades: number | null; fecha: string; estado: string }
interface Alerta   { msg: string; nivel: "critical" | "warning" | "info" }
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
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", iconBg)}>
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </div>
      </div>
      <div>
        <p className="kpi-value">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{unit}</p>
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

  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [stock,      setStock]      = useState(0)
  const [entradas,   setEntradas]   = useState(0)
  const [salidas,    setSalidas]    = useState(0)
  const [clientes,   setClientes]   = useState(0)
  const [entChg,     setEntChg]     = useState<string | null>(null)
  const [salChg,     setSalChg]     = useState<string | null>(null)
  const [clientNew,  setClientNew]  = useState(0)
  const [recentMovs, setRecentMovs] = useState<MovRow[]>([])
  const [allMovs,    setAllMovs]    = useState<MovRow[]>([])
  const [alertas,    setAlertas]    = useState<Alerta[]>([])
  const [ocupacion,  setOcupacion]  = useState<{ zona: string; detalle: string; stock: number; pct: number }[]>([])
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
    const sixMonthsAgo = new Date(yr, mo - 11, 1).toISOString()

    const [
      { data: itemsRaw,      error: e1 },
      { data: movsRaw,       error: e2 },
      { count: clientTotal,  error: e3 },
      { count: clientNewCount },
    ] = await Promise.all([
      supabase.from("inventario_items").select("area, stock_actual, stock_minimo").eq("activo", true),
      supabase.from("movimientos").select("numero, tipo, cliente_nombre, carga, unidades, fecha, estado").gte("fecha", sixMonthsAgo).order("fecha", { ascending: false }),
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", curr),
    ])

    const queryError = e1 ?? e2 ?? e3
    if (queryError) { setFetchError(queryError.message); setLoading(false); return }

    const items = (itemsRaw ?? []) as StockRow[]
    const movs  = (movsRaw  ?? []) as MovRow[]

    const totalStock = items.reduce((s, i) => s + i.stock_actual, 0)
    const areaStocks = AREAS.map(area => ({
      zona:    area,
      detalle: AREA_DETAIL[area],
      stock:   items.filter(i => i.area === area).reduce((s, i) => s + i.stock_actual, 0),
      pct:     0,
    }))
    const maxAreaStock = Math.max(...areaStocks.map(a => a.stock), 1)
    areaStocks.forEach(a => { a.pct = Math.round((a.stock / maxAreaStock) * 100) })

    const currMovs = movs.filter(m => m.fecha >= curr)
    const prevMovs = movs.filter(m => m.fecha >= prev && m.fecha < curr)
    const cEnt = currMovs.filter(m => m.tipo === "ingreso").length
    const cSal = currMovs.filter(m => m.tipo === "despacho").length
    const pEnt = prevMovs.filter(m => m.tipo === "ingreso").length
    const pSal = prevMovs.filter(m => m.tipo === "despacho").length

    const al: Alerta[] = []
    const depleted = items.filter(i => i.stock_actual === 0 && i.stock_minimo > 0).length
    if (depleted > 0)
      al.push({ msg: `${depleted} ítem${depleted > 1 ? "s" : ""} sin stock`, nivel: "critical" })
    const lowStock = items.filter(i => i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo).length
    if (lowStock > 0)
      al.push({ msg: `${lowStock} ítem${lowStock > 1 ? "s" : ""} bajo stock mínimo`, nivel: "warning" })
    const pending = movs.filter(m => m.estado === "en_proceso").length
    if (pending > 0)
      al.push({ msg: `${pending} movimiento${pending > 1 ? "s" : ""} en proceso`, nivel: "info" })
    if (al.length === 0)
      al.push({ msg: "Sin alertas activas", nivel: "info" })

    setStock(totalStock)
    setEntradas(cEnt)
    setSalidas(cSal)
    setClientes(clientTotal ?? 0)
    setEntChg(pctChange(cEnt, pEnt))
    setSalChg(pctChange(cSal, pSal))
    setClientNew(clientNewCount ?? 0)
    setRecentMovs(movs.slice(0, 5))
    setAllMovs(movs)
    setAlertas(al)
    setOcupacion(areaStocks)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setChartData(buildChartData(allMovs, chartMonths)) }, [chartMonths, allMovs])

  const alertCount = alertas.filter(a => a.nivel !== "info").length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 sm:p-4 flex flex-col gap-3 flex-1 min-h-0 lg:grid lg:grid-rows-[auto_auto_auto_1fr]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h1 className="text-base font-medium tracking-tight text-foreground">
              {getGreeting()}, {nombre}
            </h1>
            <p className="section-label mt-0.5">{getDayStr()} · Camino La Pólvora 106, Valparaíso</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border",
              alertCount > 0
                ? "badge-warning border-[var(--color-status-warning-bg)]"
                : "badge-success border-[var(--color-status-success-bg)]"
            )}>
              {alertCount > 0
                ? <AlertTriangle className="h-3 w-3" />
                : <CheckCircle2 className="h-3 w-3" />
              }
              {alertCount > 0
                ? `${alertCount} alerta${alertCount > 1 ? "s" : ""} activa${alertCount > 1 ? "s" : ""}`
                : "Sistema operativo"
              }
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={fetchData} disabled={loading}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
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
                <div key={i} className="rounded-lg bg-muted/40 h-[88px] animate-pulse" />
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
          <CardHeader className="py-3 px-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">Actividad mensual</CardTitle>
                <CardDescription className="text-xs mt-0.5">Ingresos y despachos — últimos 6 meses</CardDescription>
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
          <CardContent className="px-4 pt-3 pb-2">
            {loading ? (
              <div className="h-[112px] animate-pulse rounded-lg bg-muted/40" />
            ) : (
              <div className="h-[112px]">
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

        {/* ── Contenido principal — 3 paneles 5/4/3 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:min-h-0">

          {/* Movimientos recientes — 5/12 */}
          <Card className="lg:col-span-5 border-border bg-card flex flex-col lg:min-h-0">
            <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Movimientos recientes</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Últimos ingresos y despachos</CardDescription>
                </div>
                <Link
                  href="/movimientos"
                  className="inline-flex items-center gap-1 h-6 px-2 text-xs text-primary hover:text-primary/80 font-medium rounded-md hover:bg-muted/50 transition-colors"
                >
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : recentMovs.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/30 z-10">
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="section-label pl-4 py-2">Movimiento</TableHead>
                      <TableHead className="section-label py-2">Cliente</TableHead>
                      <TableHead className="section-label text-right py-2">Cant.</TableHead>
                      <TableHead className="section-label text-right pr-4 py-2">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMovs.map((m) => (
                      <TableRow key={m.numero} className="hover:bg-muted/20 border-border/60 cursor-pointer">
                        <TableCell className="pl-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0",
                              m.tipo === "ingreso"
                                ? "bg-[var(--color-status-success-bg)]"
                                : "bg-[var(--color-status-warning-bg)]"
                            )}>
                              {m.tipo === "ingreso"
                                ? <ArrowDownCircle className="h-3 w-3 text-[var(--color-status-success-text)]" />
                                : <ArrowUpCircle   className="h-3 w-3 text-[var(--color-status-warning-text)]" />
                              }
                            </div>
                            <div>
                              <p className="text-xs font-medium capitalize">{m.tipo}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{movCodigo(m.numero)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <p className="text-xs font-medium truncate max-w-[120px]">{m.cliente_nombre ?? "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{formatRelativa(m.fecha)}</p>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-right py-2.5 tabular-nums">
                          {m.unidades ?? "—"}
                        </TableCell>
                        <TableCell className="text-right pr-4 py-2.5">
                          <Badge className={cn(
                            "text-[10px] px-1.5 py-0 rounded-md border-0 font-medium",
                            m.estado === "completado" ? "badge-success" : "badge-warning"
                          )}>
                            {m.estado === "completado" ? "Completado" : "En proceso"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Ocupación por área — 4/12 */}
          <Card className="lg:col-span-4 border-border bg-card flex flex-col lg:min-h-0">
            <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border">
              <CardTitle className="text-sm font-medium">Ocupación por área</CardTitle>
              <CardDescription className="text-xs">Stock relativo por zona</CardDescription>
            </CardHeader>
            <CardContent className="px-4 py-3 flex-1 min-h-0 flex flex-col overflow-hidden">
              {loading
                ? <div className="flex flex-col justify-between flex-1 gap-3">
                    {Array(4).fill(0).map((_, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="h-3.5 w-28 animate-pulse rounded bg-muted/40" />
                        <div className="h-2 w-full animate-pulse rounded-full bg-muted/40" />
                      </div>
                    ))}
                  </div>
                : <div className="flex flex-col flex-1 min-h-0 justify-between">
                    <div className="flex flex-col justify-between flex-1 gap-2">
                      {ocupacion.map((z) => {
                        const barColor = z.pct >= 70
                          ? "bg-[var(--color-status-danger-text)]/70"
                          : z.pct >= 40
                          ? "bg-[var(--color-adp-celeste)]"
                          : "bg-[var(--color-adp-blue)]"
                        const valColor = z.pct >= 70
                          ? "text-[var(--color-status-danger-text)]"
                          : z.pct >= 40
                          ? "text-[var(--color-adp-blue-mid)]"
                          : "text-foreground"
                        return (
                          <div key={z.zona} className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-baseline gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{z.zona}</p>
                                <p className="text-[10px] text-muted-foreground">{z.detalle}</p>
                              </div>
                              <span className={cn("text-xs font-semibold tabular-nums flex-shrink-0", valColor)}>
                                {z.stock > 0 ? `${z.stock} ud.` : "—"}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                                style={{ width: `${Math.max(z.pct, z.stock > 0 ? 4 : 0)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="pt-3 mt-3 border-t border-border flex justify-between items-center flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground">Total en bodega</span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {ocupacion.reduce((s, z) => s + z.stock, 0)} ud.
                      </span>
                    </div>
                  </div>
              }
            </CardContent>
          </Card>

          {/* Alertas — 3/12 */}
          <Card className="lg:col-span-3 border-border bg-card flex flex-col lg:min-h-0">
            <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Alertas</CardTitle>
                {alertCount > 0 && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
                    {alertCount}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 flex flex-col gap-2 overflow-hidden">
              {loading
                ? <div className="h-24 animate-pulse rounded-md bg-muted/40" />
                : alertas.map((a, i) => (
                    <div key={i} className={cn(
                      "flex items-start gap-2 px-2.5 py-2.5 rounded-lg text-[11px] font-medium border-l-[3px] leading-snug",
                      a.nivel === "critical"
                        ? "bg-[var(--color-status-danger-bg)] text-[var(--color-status-danger-text)] border-[var(--color-status-danger-text)]"
                        : a.nivel === "warning"
                        ? "bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning-text)] border-[var(--color-status-warning-text)]"
                        : "bg-muted/50 text-muted-foreground border-muted-foreground/30"
                    )}>
                      {a.nivel === "critical" || a.nivel === "warning"
                        ? <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                        : <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                      }
                      <span>{a.msg}</span>
                    </div>
                  ))
              }
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
