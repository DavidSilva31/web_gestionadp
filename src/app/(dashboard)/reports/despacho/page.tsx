"use client"

import { useState, useEffect, useCallback } from "react"
import { CheckCircle2, Clock, Truck, Search, User, Calendar, Package, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

interface PendingReport {
  id:                  string
  numero:              number
  cliente:             string
  patente:             string
  conductor:           string
  created_at:          string
  nombre_operador:     string | null
  sec1_activa:         boolean
  sec2_activa:         boolean
  sec3_activa:         boolean
  sec1_tipo_contenedor: string | null
  sec3_producto:       string | null
}

function minutosEsperando(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
}

function horaFormateada(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

function SeccionTag({ active, label }: { active: boolean; label: string }) {
  if (!active) return null
  return <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-medium px-2 py-0.5 rounded">{label}</span>
}

function ReportCard({ report, onDispatch }: { report: PendingReport; onDispatch: (id: string, nombre: string) => Promise<void> }) {
  const [expanded,    setExpanded]    = useState(false)
  const [nombre,      setNombre]      = useState("")
  const [dispatching, setDispatching] = useState(false)

  async function handleConfirm() {
    if (!nombre.trim()) return
    setDispatching(true)
    await onDispatch(report.id, nombre)
    setDispatching(false)
  }

  const mins = minutosEsperando(report.created_at)

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <Truck className="h-5 w-5 text-amber-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono font-bold text-sm text-[oklch(0.35_0.12_240)]">#{report.numero}</span>
            <span className="font-semibold text-sm text-foreground truncate">{report.cliente}</span>
            <span className="ml-auto text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              <Clock className="h-3 w-3 inline mr-1" />
              {mins < 1 ? "Recién llegado" : `Esperando ${mins} min`}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded font-medium text-foreground">{report.patente}</span>
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{report.conductor}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{horaFormateada(report.created_at)}</span>
          </div>
        </div>

        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 pb-3">
        <Package className="h-3 w-3 text-muted-foreground" />
        <SeccionTag active={report.sec1_activa} label={`Dep. Contenedor${report.sec1_tipo_contenedor ? ` (${report.sec1_tipo_contenedor})` : ""}`} />
        <SeccionTag active={report.sec2_activa} label="Consol./Otros" />
        <SeccionTag active={report.sec3_activa} label={report.sec3_producto ? `Bodega: ${report.sec3_producto}` : "Bodegaje"} />
        {report.nombre_operador && (
          <span className="text-[10px] text-muted-foreground ml-1">Operador: {report.nombre_operador}</span>
        )}
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 px-5 py-4">
          <p className="text-xs font-semibold text-foreground mb-3">Confirmar salida del vehículo</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1">Nombre del despachador</label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" className="h-8 text-xs" />
            </div>
            <Button
              onClick={handleConfirm}
              disabled={!nombre.trim() || dispatching}
              size="sm"
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
            >
              {dispatching
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Confirmando...</>
                : <><CheckCircle2 className="h-3.5 w-3.5" />Confirmar despacho</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DespachoPage() {
  const { user } = useAuth()
  const [pending,    setPending]    = useState<PendingReport[]>([])
  const [dispatched, setDispatched] = useState<{ numero: number; cliente: string }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")

  const fetchPending = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("reports")
      .select("id, numero, cliente, patente, conductor, created_at, nombre_operador, sec1_activa, sec2_activa, sec3_activa, sec1_tipo_contenedor, sec3_producto")
      .eq("estado", "pendiente_despacho")
      .order("created_at", { ascending: true })

    if (data) setPending(data as PendingReport[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  async function handleDispatch(id: string, nombre: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from("reports")
      .update({
        estado:             "despachado",
        nombre_despachador: nombre,
        fecha_despacho:     new Date().toISOString(),
        dispatched_by:      user?.id ?? null,
      })
      .eq("id", id)

    if (!error) {
      const r = pending.find(x => x.id === id)
      if (r) setDispatched(prev => [{ numero: r.numero, cliente: r.cliente }, ...prev])
      setPending(prev => prev.filter(x => x.id !== id))
    }
  }

  const filtered = pending.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.patente.toLowerCase().includes(q) || r.cliente.toLowerCase().includes(q) || String(r.numero).includes(q)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Cola de despacho" subtitle="Vehículos esperando confirmación de salida en portería">
        <Button variant="ghost" size="sm" onClick={fetchPending} disabled={loading} className="h-8 w-8 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4 flex gap-4">
        {/* Cola de espera */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por patente, cliente o N°..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 border border-amber-200 dark:border-amber-800 rounded-lg px-3 h-8 text-xs font-semibold flex-shrink-0">
              <Clock className="h-3.5 w-3.5" />
              {filtered.length} pendiente{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-foreground">Todo despachado</p>
                <p className="text-xs text-muted-foreground mt-1">No hay vehículos en espera</p>
              </div>
            ) : (
              filtered.map(r => <ReportCard key={r.id} report={r} onDispatch={handleDispatch} />)
            )}
          </div>
        </div>

        {/* Panel derecho */}
        <div className="w-64 flex-shrink-0 flex flex-col min-h-0 gap-3">
          <div className="bg-card rounded-xl border flex flex-col min-h-0 overflow-hidden flex-1">
            <div className="px-4 py-3 border-b flex-shrink-0">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Despachados esta sesión</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {dispatched.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">Sin registros aún</p>
              ) : dispatched.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground font-mono">#{d.numero}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{d.cliente}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-4 flex-shrink-0">
            <p className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Esta sesión</p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Despachados</span>
                <span className="font-bold text-foreground">{dispatched.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">En espera</span>
                <span className="font-bold text-amber-600">{filtered.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
