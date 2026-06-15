"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FileDown, TrendingUp, BarChart3,
  ArrowDownCircle, ArrowUpCircle, Users, Package,
  Loader2, RefreshCw,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// ── Helpers ────────────────────────────────────────────────────────────────────
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

function fmtPct(pct: number | null, fallback: string): string {
  if (pct === null) return fallback
  return pct > 0 ? `+${pct}% vs mes ant.` : `${pct}% vs mes ant.`
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ReportesPage() {
  const now      = new Date()
  const year     = now.getFullYear()
  const monthIdx = now.getMonth()
  const mesActual = MESES[monthIdx]

  const [loading,     setLoading]     = useState(true)
  const [kpis,        setKpis]        = useState({ total: 0, entradas: 0, salidas: 0, clientes: 0, entPct: null as number | null, salPct: null as number | null })
  const [mensual,     setMensual]     = useState<{ mes: string; entradas: number; salidas: number }[]>([])
  const [topItems,    setTopItems]    = useState<{ nombre: string; entradas: number; salidas: number; total: number; pct: number }[]>([])
  const [topClientes, setTopClientes] = useState<{ nombre: string; total: number; pct: number }[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const currentMonthStart = new Date(year, monthIdx, 1).toISOString()
    const prevMonthStart    = new Date(year, monthIdx - 1, 1).toISOString()

    const [{ data: movData }, { count: clientesCount }] = await Promise.all([
      supabase
        .from("movimientos")
        .select("tipo, fecha, carga, cliente_nombre")
        .gte("fecha", `${year}-01-01T00:00:00`)
        .order("fecha"),
      supabase
        .from("clientes")
        .select("*", { count: "exact", head: true })
        .eq("activo", true),
    ])

    const movs = movData ?? []

    // ── Gráfico mensual ──────────────────────────────────────────────────────
    const map: Record<number, { entradas: number; salidas: number }> = {}
    for (let i = 0; i <= monthIdx; i++) map[i] = { entradas: 0, salidas: 0 }
    for (const m of movs) {
      const mi = new Date(m.fecha).getMonth()
      if (map[mi]) {
        if (m.tipo === "ingreso") map[mi].entradas++
        else map[mi].salidas++
      }
    }
    const mensualData = Object.entries(map).map(([i, v]) => ({
      mes: MESES[+i], entradas: v.entradas, salidas: v.salidas,
    }))

    // ── KPIs mes actual vs anterior ──────────────────────────────────────────
    const currMovs = movs.filter(m => m.fecha >= currentMonthStart)
    const prevMovs = movs.filter(m => m.fecha >= prevMonthStart && m.fecha < currentMonthStart)
    const currEnt  = currMovs.filter(m => m.tipo === "ingreso").length
    const currSal  = currMovs.filter(m => m.tipo === "despacho").length
    const prevEnt  = prevMovs.filter(m => m.tipo === "ingreso").length
    const prevSal  = prevMovs.filter(m => m.tipo === "despacho").length

    // ── Top cargas con desglose entrada/salida ───────────────────────────────
    const cargaMap: Record<string, { entradas: number; salidas: number }> = {}
    for (const m of movs) {
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
    for (const m of movs) {
      if (m.cliente_nombre) clienteMap[m.cliente_nombre] = (clienteMap[m.cliente_nombre] ?? 0) + 1
    }
    const sortedCli = Object.entries(clienteMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const maxCli    = sortedCli[0]?.[1] ?? 1
    const topCliData = sortedCli.map(([nombre, total]) => ({ nombre, total, pct: Math.round((total / maxCli) * 100) }))

    setKpis({ total: currMovs.length, entradas: currEnt, salidas: currSal, clientes: clientesCount ?? 0, entPct: pctChange(currEnt, prevEnt), salPct: pctChange(currSal, prevSal) })
    setMensual(mensualData)
    setTopItems(topData)
    setTopClientes(topCliData)
    setLoading(false)
  }, [year, monthIdx])

  useEffect(() => { fetchData() }, [fetchData])

  const maxVal = Math.max(...mensual.flatMap(m => [m.entradas, m.salidas]), 1)
  const currMes = mensual[mensual.length - 1]
  const prevMes = mensual.length > 1 ? mensual[mensual.length - 2] : null

  const summaryCards = [
    { label: "Total movimientos", value: String(kpis.total),    sub: `${mesActual} ${year}`,                      icon: BarChart3,       gradient: "from-[#0A4A7F] to-[#1A5276]"   },
    { label: "Entradas",          value: String(kpis.entradas), sub: fmtPct(kpis.entPct, `${mesActual} ${year}`), icon: ArrowDownCircle, gradient: "from-emerald-600 to-emerald-700" },
    { label: "Salidas",           value: String(kpis.salidas),  sub: fmtPct(kpis.salPct, `${mesActual} ${year}`), icon: ArrowUpCircle,   gradient: "from-amber-500 to-orange-500"   },
    { label: "Clientes activos",  value: String(kpis.clientes), sub: "empresas",                                  icon: Users,           gradient: "from-[#29ABE2] to-[#1A8BBD]"   },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-3 p-4 bg-muted/20">

        {/* Cabecera */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Reportes del almacén</h2>
            <p className="text-xs text-muted-foreground">Resumen estadístico — {mesActual} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="h-7 w-7 p-0 text-muted-foreground">
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-border/60">
              <FileDown className="h-3 w-3" /> Exportar PDF
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading
            ? Array(4).fill(0).map((_, i) => <div key={i} className="rounded-xl bg-muted/50 h-24 animate-pulse" />)
            : summaryCards.map((s) => (
                <div key={s.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${s.gradient} px-4 py-3 text-white shadow-sm`}>
                  <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-white/5 -translate-y-5 translate-x-5" />
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-1.5 rounded-lg bg-white/20"><s.icon className="h-3.5 w-3.5 text-white" /></div>
                  </div>
                  <p className="text-2xl font-bold tracking-tight leading-none">{s.value}</p>
                  <p className="text-white/65 text-[11px] mt-1">{s.label}</p>
                  <p className="text-white/45 text-[10px] mt-0.5">{s.sub}</p>
                </div>
              ))
          }
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0">

          {/* Gráfico mensual */}
          <Card className="border-border/40 shadow-sm bg-background flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10"><BarChart3 className="h-3.5 w-3.5 text-primary" /></div>
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Movimientos por mes</CardTitle>
                  <CardDescription className="text-xs">Entradas vs salidas — {year}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-3">
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : mensual.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Sin movimientos registrados</p>
                </div>
              ) : (
                <>
                  {/* Barras */}
                  <div className="flex-1 min-h-0 flex items-end gap-1.5">
                    {mensual.map((m) => {
                      const total = m.entradas + m.salidas
                      return (
                        <div key={m.mes} className="flex-1 flex flex-col items-center gap-0.5 h-full group relative">
                          {/* Label flotante on hover */}
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            {total > 0 && (
                              <div className="bg-foreground text-background rounded px-1.5 py-1 shadow-lg text-center whitespace-nowrap">
                                <p className="text-[10px] font-bold leading-none">{total}</p>
                                <p className="text-[9px] mt-0.5 opacity-70">↓{m.entradas} ↑{m.salidas}</p>
                              </div>
                            )}
                          </div>
                          <div className="w-full flex gap-0.5 items-end flex-1">
                            <div className="flex-1 bg-primary rounded-t-sm transition-all"
                              style={{ height: `${(m.entradas / maxVal) * 100}%` }} />
                            <div className="flex-1 rounded-t-sm transition-all"
                              style={{ height: `${(m.salidas / maxVal) * 100}%`, backgroundColor: "#29ABE2" }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium flex-shrink-0">{m.mes}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Leyenda */}
                  <div className="flex gap-4 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-3 rounded-sm bg-primary inline-block" /> Entradas
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-3 rounded-sm inline-block" style={{ backgroundColor: "#29ABE2" }} /> Salidas
                    </div>
                  </div>

                  {/* Resumen mes actual */}
                  {currMes && (
                    <div className="border-t border-border/30 pt-3 flex-shrink-0">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{currMes.mes} {year}</p>
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
                          {prevMes.mes}: {prevMes.entradas + prevMes.salidas} movimientos · {prevMes.entradas} entradas · {prevMes.salidas} salidas
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Columna derecha: dos cards apiladas */}
          <div className="flex flex-col gap-3 min-h-0">

            {/* Top cargas con desglose */}
            <Card className="border-border/40 shadow-sm bg-background flex flex-col flex-1 min-h-0">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10"><TrendingUp className="h-3.5 w-3.5 text-primary" /></div>
                    <div>
                      <CardTitle className="text-sm font-bold tracking-tight">Cargas más activas</CardTitle>
                      <CardDescription className="text-xs">Por movimientos — {year}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Entradas</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Salidas</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col justify-between px-4 py-3">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : topItems.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center"><p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p></div>
                ) : (
                  topItems.map((p, i) => {
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
                        {/* Barra apilada entradas/salidas, ancho relativo al máximo */}
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full flex overflow-hidden" style={{ width: `${p.pct}%` }}>
                            <div className="h-full bg-emerald-500" style={{ width: `${entrRatio}%` }} />
                            <div className="h-full bg-amber-400 flex-1" />
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Top clientes */}
            <Card className="border-border/40 shadow-sm bg-background flex flex-col flex-1 min-h-0">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#29ABE2]/10"><Users className="h-3.5 w-3.5 text-[#29ABE2]" /></div>
                  <div>
                    <CardTitle className="text-sm font-bold tracking-tight">Clientes más activos</CardTitle>
                    <CardDescription className="text-xs">Por movimientos — {year}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col justify-between px-4 py-3">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : topClientes.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center"><p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p></div>
                ) : (
                  topClientes.map((c, i) => (
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
                  ))
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
