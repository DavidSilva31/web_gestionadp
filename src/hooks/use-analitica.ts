"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import { fetchTodas } from "@/lib/fetch-todas"

export const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
export const AREA_ORDER = ["Bodega IMO", "Zona Isotanques", "Zona RESPEL", "Bodega General"]

export type Periodo = "mensual" | "anual"

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

// Estadísticas del almacén para un período (mes o año): KPIs, movimientos por mes, tops, áreas, stock y reports.
// Antes vivía en la página Analítica (/reportes); ahora la usa el Inicio.
export function useAnalitica(periodo: Periodo, selMonth: number, selYear: number) {
  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [kpis,          setKpis]          = useState({ total: 0, entradas: 0, salidas: 0, clientes: 0, entPct: null as number | null, salPct: null as number | null })
  const [mensual,       setMensual]       = useState<{ mes: string; entradas: number; salidas: number }[]>([])
  const [topItems,      setTopItems]      = useState<{ nombre: string; entradas: number; salidas: number; total: number; pct: number }[]>([])
  const [topClientes,   setTopClientes]   = useState<{ nombre: string; total: number; pct: number }[]>([])
  const [areaData,      setAreaData]      = useState<{ area: string; entradas: number; salidas: number; total: number; pct: number }[]>([])
  const [stockStatus,   setStockStatus]   = useState({ normal: 0, bajo: 0, critico: 0, total: 0 })
  const [reportsFunnel, setReportsFunnel] = useState({ borradores: 0, pendientes: 0, despachados: 0, total: 0 })

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
      { data: stockData,      error: e3 },
      { data: reportsData,    error: e4 },
    ] = await Promise.all([
      fetchTodas<{ tipo: string; fecha: string; carga: string | null; cliente_nombre: string | null; area: string | null }>((d, h) => supabase
        .from("movimientos")
        .select("tipo, fecha, carga, cliente_nombre, area")
        .gte("fecha", `${selYear - 1}-01-01T00:00:00`)
        .lt("fecha",  `${selYear + 1}-01-01T00:00:00`)
        .order("fecha").order("numero").range(d, h)),
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

    if (e1 ?? e2 ?? e3 ?? e4) { setFetchError((e1 ?? e2 ?? e3 ?? e4)!.message); setLoading(false); return }

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
      else if (r.estado === "pendiente_operaciones" || r.estado === "pendiente_despacho" || r.estado === "en_proceso") pendientes++
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

  return { loading, fetchError, kpis, mensual, topItems, topClientes, areaData, stockStatus, reportsFunnel, refetch: fetchData }
}
