"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Package, ArrowDownCircle, ArrowUpCircle, Users,
  AlertTriangle, ArrowRight, Zap, Loader2, RefreshCw,
} from "lucide-react"
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

// ── Types ──────────────────────────────────────────────────────────────────────
interface StockRow { area: string | null; stock_actual: number; stock_minimo: number }
interface MovRow   { numero: number; tipo: string; cliente_nombre: string | null; carga: string; unidades: number | null; fecha: string; estado: string }
interface Alerta   { msg: string; nivel: "critical" | "warning" | "info" }

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth()
  const nombre = profile?.nombre?.split(" ")[0] ?? "Admin"

  const [loading,    setLoading]    = useState(true)
  const [stock,      setStock]      = useState(0)
  const [entradas,   setEntradas]   = useState(0)
  const [salidas,    setSalidas]    = useState(0)
  const [clientes,   setClientes]   = useState(0)
  const [entChg,     setEntChg]     = useState<string | null>(null)
  const [salChg,     setSalChg]     = useState<string | null>(null)
  const [clientNew,  setClientNew]  = useState(0)
  const [recentMovs, setRecentMovs] = useState<MovRow[]>([])
  const [alertas,    setAlertas]    = useState<Alerta[]>([])
  const [ocupacion,  setOcupacion]  = useState<{ zona: string; detalle: string; stock: number; pct: number }[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const now   = new Date()
    const yr    = now.getFullYear()
    const mo    = now.getMonth()
    const curr  = new Date(yr, mo, 1).toISOString()
    const prev  = new Date(yr, mo - 1, 1).toISOString()

    const [
      { data: itemsRaw },
      { data: movsRaw },
      { count: clientTotal },
      { count: clientNew },
    ] = await Promise.all([
      supabase.from("inventario_items").select("area, stock_actual, stock_minimo").eq("activo", true),
      supabase.from("movimientos").select("numero, tipo, cliente_nombre, carga, unidades, fecha, estado").gte("fecha", prev).order("fecha", { ascending: false }),
      supabase.from("clientes").select("*", { count: "exact", head: true }).eq("activo", true),
      supabase.from("clientes").select("*", { count: "exact", head: true }).gte("created_at", curr),
    ])

    const items = (itemsRaw ?? []) as StockRow[]
    const movs  = (movsRaw  ?? []) as MovRow[]

    // ── Stock total y distribución por área ──────────────────────────────────
    const totalStock = items.reduce((s, i) => s + i.stock_actual, 0)
    const areaStocks = AREAS.map(area => ({
      zona:    area,
      detalle: AREA_DETAIL[area],
      stock:   items.filter(i => i.area === area).reduce((s, i) => s + i.stock_actual, 0),
      pct:     0,
    }))
    const maxAreaStock = Math.max(...areaStocks.map(a => a.stock), 1)
    areaStocks.forEach(a => { a.pct = Math.round((a.stock / maxAreaStock) * 100) })

    // ── KPIs movimientos ─────────────────────────────────────────────────────
    const currMovs = movs.filter(m => m.fecha >= curr)
    const prevMovs = movs.filter(m => m.fecha >= prev && m.fecha < curr)
    const cEnt = currMovs.filter(m => m.tipo === "ingreso").length
    const cSal = currMovs.filter(m => m.tipo === "despacho").length
    const pEnt = prevMovs.filter(m => m.tipo === "ingreso").length
    const pSal = prevMovs.filter(m => m.tipo === "despacho").length

    // ── Alertas dinámicas ────────────────────────────────────────────────────
    const al: Alerta[] = []
    const depleted = items.filter(i => i.stock_actual === 0 && i.stock_minimo > 0).length
    if (depleted > 0)
      al.push({ msg: `${depleted} ítem${depleted > 1 ? "s" : ""} sin stock (agotado${depleted > 1 ? "s" : ""})`, nivel: "critical" })
    const lowStock = items.filter(i => i.stock_actual > 0 && i.stock_minimo > 0 && i.stock_actual <= i.stock_minimo).length
    if (lowStock > 0)
      al.push({ msg: `${lowStock} ítem${lowStock > 1 ? "s" : ""} bajo stock mínimo`, nivel: "warning" })
    const pending = movs.filter(m => m.estado === "en_proceso").length
    if (pending > 0)
      al.push({ msg: `${pending} movimiento${pending > 1 ? "s" : ""} en proceso`, nivel: "info" })
    if (al.length === 0)
      al.push({ msg: "No hay alertas activas", nivel: "info" })

    setStock(totalStock)
    setEntradas(cEnt)
    setSalidas(cSal)
    setClientes(clientTotal ?? 0)
    setEntChg(pctChange(cEnt, pEnt))
    setSalChg(pctChange(cSal, pSal))
    setClientNew(clientNew ?? 0)
    setRecentMovs(movs.slice(0, 5))
    setAlertas(al)
    setOcupacion(areaStocks)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const alertCount = alertas.filter(a => a.nivel !== "info").length
  const pendingCount = alertas.find(a => a.nivel === "info" && a.msg.includes("movimiento"))

  const kpiCards = [
    { title: "Unidades en bodega", value: stock.toLocaleString("es-CL"), unit: "ítems almacenados",       change: "Stock actual total",                              icon: Package,         gradient: "from-[#0A4A7F] to-[#1A5276]"   },
    { title: "Ingresos del mes",   value: String(entradas),              unit: "recepciones registradas", change: entChg ?? "mes actual",                            icon: ArrowDownCircle, gradient: "from-emerald-600 to-emerald-700" },
    { title: "Despachos del mes",  value: String(salidas),               unit: "salidas despachadas",     change: salChg ?? "mes actual",                            icon: ArrowUpCircle,   gradient: "from-amber-500 to-orange-500"   },
    { title: "Clientes activos",   value: String(clientes),              unit: "empresas con carga",      change: clientNew > 0 ? `+${clientNew} este mes` : "Sin cambios", icon: Users, gradient: "from-[#29ABE2] to-[#1A8BBD]"   },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-3 p-4 bg-muted/20">

        {/* ── Banner ── */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0A4A7F] via-[#0D5A98] to-[#29ABE2] px-5 py-3 text-white shadow-md">
          <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
                {getDayStr()} · Camino La Pólvora 106, Valparaíso
              </p>
              <h2 className="text-base font-bold tracking-tight mt-0.5">{getGreeting()}, {nombre}</h2>
              <p className="text-white/70 text-xs mt-0.5">
                {loading ? "Cargando resumen..." : (
                  <>
                    {alertCount > 0
                      ? <>Tienes <span className="text-white font-semibold">{alertCount} alerta{alertCount > 1 ? "s" : ""}</span> activa{alertCount > 1 ? "s" : ""}</>
                      : "Sin alertas activas"
                    }
                    {pendingCount && <> · <span className="text-white font-semibold">{pendingCount.msg}</span></>}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}
                className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-white/10">
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 flex-shrink-0">
                <Zap className="h-3 w-3 text-yellow-300" />
                <span className="text-xs font-medium">Sistema operativo</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => <div key={i} className="rounded-xl bg-muted/50 h-24 animate-pulse" />)
            : kpiCards.map((kpi) => (
                <div key={kpi.title}
                  className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${kpi.gradient} px-4 py-3 text-white shadow-sm`}>
                  <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-white/5 -translate-y-5 translate-x-5" />
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-1.5 rounded-lg bg-white/20">
                      <kpi.icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-[10px] text-white/60">{kpi.change}</span>
                  </div>
                  <p className="text-2xl font-bold tracking-tight leading-none">{kpi.value}</p>
                  <p className="text-white/65 text-[11px] mt-1">{kpi.unit}</p>
                </div>
              ))
          }
        </div>

        {/* ── Contenido principal ── */}
        <div className="grid grid-cols-3 gap-3 min-h-0">

          {/* Movimientos recientes */}
          <Card className="col-span-2 border-border/40 shadow-sm bg-background flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Movimientos recientes</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Últimos ingresos y despachos</CardDescription>
                </div>
                <Link href="/movimientos"
                  className="inline-flex items-center gap-1 h-6 px-2 text-xs text-primary hover:text-primary/80 font-medium rounded-md hover:bg-muted/60 transition-colors">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentMovs.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/40 z-10">
                    <TableRow className="hover:bg-transparent border-border/30">
                      <TableHead className="text-[11px] font-semibold text-muted-foreground pl-4 py-2">Movimiento</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground py-2">Cliente</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">Carga</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground text-right py-2">Cant.</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground text-right pr-4 py-2">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMovs.map((m) => (
                      <TableRow key={m.numero} className="hover:bg-muted/30 border-border/20 cursor-pointer">
                        <TableCell className="pl-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0",
                              m.tipo === "ingreso" ? "bg-emerald-50" : "bg-amber-50"
                            )}>
                              {m.tipo === "ingreso"
                                ? <ArrowDownCircle className="h-3 w-3 text-emerald-600" />
                                : <ArrowUpCircle   className="h-3 w-3 text-amber-600" />}
                            </div>
                            <div>
                              <p className="text-xs font-semibold capitalize">{m.tipo}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{movCodigo(m.numero)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <p className="text-xs font-medium truncate max-w-[130px]">{m.cliente_nombre ?? "—"}</p>
                          <p className="text-[10px] text-muted-foreground">{formatRelativa(m.fecha)}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell py-2 max-w-[130px] truncate">
                          {m.carga}
                        </TableCell>
                        <TableCell className="text-sm font-bold text-right py-2">{m.unidades ?? "—"}</TableCell>
                        <TableCell className="text-right pr-4 py-2">
                          <Badge className={cn(
                            "text-[10px] px-1.5 py-0 rounded-md border-0",
                            m.estado === "completado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
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

          {/* Columna derecha */}
          <div className="flex flex-col gap-3 min-h-0">

            {/* Alertas */}
            <Card className="border-border/40 shadow-sm bg-background flex-shrink-0">
              <CardHeader className="py-3 px-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-50">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm font-bold tracking-tight">Alertas</CardTitle>
                  {alertCount > 0 && (
                    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                      {alertCount}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5">
                {loading
                  ? <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
                  : alertas.map((a, i) => (
                      <div key={i} className={cn(
                        "flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium border-l-2",
                        a.nivel === "critical" ? "bg-red-50 text-red-700 border-red-400 dark:bg-red-900/20 dark:text-red-400"
                        : a.nivel === "warning" ? "bg-amber-50 text-amber-700 border-amber-400 dark:bg-amber-900/20 dark:text-amber-400"
                        : "bg-muted/60 text-muted-foreground border-border"
                      )}>
                        <span className={cn(
                          "mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0",
                          a.nivel === "critical" ? "bg-red-500" : a.nivel === "warning" ? "bg-amber-500" : "bg-muted-foreground/40"
                        )} />
                        {a.msg}
                      </div>
                    ))
                }
              </CardContent>
            </Card>

            {/* Ocupación por área */}
            <Card className="border-border/40 shadow-sm bg-background flex-1 min-h-0 flex flex-col">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-sm font-bold tracking-tight">Ocupación por área</CardTitle>
                <CardDescription className="text-xs">Stock relativo por zona</CardDescription>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col justify-between">
                {loading
                  ? Array(4).fill(0).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted/50" />)
                  : ocupacion.map((z) => {
                      const color    = z.pct >= 70 ? "bg-red-500" : z.pct >= 40 ? "bg-amber-500" : "bg-emerald-500"
                      const txtColor = z.pct >= 70 ? "text-red-600" : z.pct >= 40 ? "text-amber-600" : "text-emerald-600"
                      return (
                        <div key={z.zona}>
                          <div className="flex justify-between items-end mb-1">
                            <div>
                              <p className="text-xs font-semibold">{z.zona}</p>
                              <p className="text-[10px] text-muted-foreground">{z.detalle}</p>
                            </div>
                            <span className={cn("text-xs font-bold", txtColor)}>
                              {z.stock > 0 ? `${z.stock} ud.` : "—"}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", color)}
                              style={{ width: `${z.pct}%` }} />
                          </div>
                        </div>
                      )
                    })
                }
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
