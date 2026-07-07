"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { CheckCircle2, Clock, Truck, Search, User, Calendar, Package, ChevronDown, ChevronUp, Loader2, RefreshCw, Upload, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import { cn } from "@/lib/utils"

interface PendingReport {
  id:                   string
  numero:               number
  cliente:              string
  patente:              string
  conductor:            string
  created_at:           string
  nombre_operador:      string | null
  sec1_activa:          boolean
  sec2_activa:          boolean
  sec3_activa:          boolean
  sec1_tipo_contenedor: string | null
  sec3_producto:        string | null
}

interface DispatchedReport {
  id:                 string
  numero:             number
  cliente:            string
  patente:            string
  conductor:          string
  fecha_despacho:     string
  nombre_despachador: string | null
}

function minutosEsperando(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
}

function horaFormateada(ts: string): string {
  return new Date(ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

function SeccionTag({ active, label }: { active: boolean; label: string }) {
  if (!active) return null
  return (
    <span className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-medium px-2 py-0.5 rounded">
      {label}
    </span>
  )
}

function ReportCard({ report, onDispatch }: { report: PendingReport; onDispatch: (id: string, nombre: string, docPath: string) => Promise<string | null> }) {
  const [expanded,    setExpanded]    = useState(false)
  const [nombre,      setNombre]      = useState("")
  const [file,        setFile]        = useState<File | null>(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) { setFile(dropped); setUploadError(null) }
  }

  async function handleConfirm() {
    if (!nombre.trim() || !file) return
    setUploadError(null)
    setDispatching(true)
    setUploading(true)

    const ext  = file.name.split(".").pop() ?? "pdf"
    const path = `${report.numero}-${report.id}.${ext}`
    const supabase = createClient()

    const { error: uploadErr } = await supabase.storage
      .from("reports-firmados")
      .upload(path, file, { upsert: true })

    setUploading(false)

    if (uploadErr) {
      setUploadError("Error al subir el archivo: " + uploadErr.message)
      setDispatching(false)
      return
    }

    const dispatchErr = await onDispatch(report.id, nombre, path)
    if (dispatchErr) {
      setUploadError(dispatchErr)
      setDispatching(false)
      return
    }
    setDispatching(false)
  }

  const mins = minutosEsperando(report.created_at)
  const canConfirm = nombre.trim().length > 0 && file !== null && !dispatching

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

      <div className="flex items-center gap-2 px-5 pt-0 pb-4">
        <Package className="h-3 w-3 text-muted-foreground" />
        <SeccionTag active={report.sec1_activa} label={`Dep. Contenedor${report.sec1_tipo_contenedor ? ` (${report.sec1_tipo_contenedor})` : ""}`} />
        <SeccionTag active={report.sec2_activa} label="Consol./Otros" />
        <SeccionTag active={report.sec3_activa} label={report.sec3_producto ? `Bodega: ${report.sec3_producto}` : "Bodegaje"} />
        {report.nombre_operador && (
          <span className="text-[10px] text-muted-foreground ml-1">Operador: {report.nombre_operador}</span>
        )}
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 px-5 py-4 space-y-4">
          <p className="text-xs font-semibold text-foreground">Confirmar salida del vehículo</p>

          {/* Paso 1: Documento firmado */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground">1. Report firmado por el conductor</span>
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setUploadError(null) }}
            />
            {file ? (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium truncate flex-1">{file.name}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = "" }}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition-colors select-none",
                  dragOver
                    ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                    : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs font-medium">
                  {dragOver ? "Suelta para adjuntar" : "Arrastra el archivo aquí"}
                </span>
                <span className="text-[10px] text-muted-foreground">o haz clic para seleccionar · PDF, JPG, PNG</span>
              </div>
            )}
            {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
          </div>

          {/* Paso 2: Nombre despachador */}
          <div>
            <label className="block text-xs mb-1.5">
              <span className="font-medium text-foreground">2. Nombre del despachador</span>
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex items-center gap-3">
              <Input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre completo"
                className="h-8 text-xs flex-1"
              />
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm}
                size="sm"
                className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 flex-shrink-0"
              >
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Subiendo...</>
                  : dispatching
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Confirmando...</>
                  : <><CheckCircle2 className="h-3.5 w-3.5" />Confirmar despacho</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DispatchedCard({ report }: { report: DispatchedReport }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-foreground font-mono">#{report.numero}</span>
          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">{report.patente}</span>
          <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">{horaFormateada(report.fecha_despacho)}</span>
        </div>
        <p className="text-[10px] text-foreground font-medium truncate">{report.cliente}</p>
        {report.nombre_despachador && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Por: {report.nombre_despachador}</p>
        )}
      </div>
    </div>
  )
}

function todayStart(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function DespachoPage() {
  const { user } = useAuth()
  const [pending,    setPending]    = useState<PendingReport[]>([])
  const [dispatched, setDispatched] = useState<DispatchedReport[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search,     setSearch]     = useState("")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()

    const [pendingRes, dispatchedRes] = await Promise.all([
      supabase
        .from("reports")
        .select("id, numero, cliente, patente, conductor, created_at, nombre_operador, sec1_activa, sec2_activa, sec3_activa, sec1_tipo_contenedor, sec3_producto")
        .eq("estado", "pendiente_despacho")
        .order("created_at", { ascending: true }),

      supabase
        .from("reports")
        .select("id, numero, cliente, patente, conductor, fecha_despacho, nombre_despachador")
        .eq("estado", "despachado")
        .gte("fecha_despacho", todayStart())
        .order("fecha_despacho", { ascending: false }),
    ])

    if (pendingRes.error ?? dispatchedRes.error) {
      setFetchError((pendingRes.error ?? dispatchedRes.error)!.message)
      setLoading(false)
      return
    }
    if (pendingRes.data)    setPending(pendingRes.data as PendingReport[])
    if (dispatchedRes.data) setDispatched(dispatchedRes.data as DispatchedReport[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handleDispatch(id: string, nombre: string, docPath: string): Promise<string | null> {
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from("reports")
      .update({
        estado:                 "despachado",
        nombre_despachador:     nombre,
        fecha_despacho:         now,
        dispatched_by:          user?.id ?? null,
        documento_firmado_url:  docPath,
      })
      .eq("id", id)

    if (error) return "Error al registrar el despacho: " + error.message

    const r = pending.find(x => x.id === id)
    if (r) {
      setDispatched(prev => [{
        id:                 r.id,
        numero:             r.numero,
        cliente:            r.cliente,
        patente:            r.patente,
        conductor:          r.conductor,
        fecha_despacho:     now,
        nombre_despachador: nombre,
      }, ...prev])
    }
    // fire-and-forget — siempre registrar aunque r no esté en memoria
    logAudit({
      tabla:          "reports",
      registro_id:    id,
      accion:         "report.despachar",
      descripcion:    `Vehículo despachado${r ? ` — ${r.cliente} (${r.patente})` : ""} · doc: ${docPath}`,
      usuario_id:     user?.id,
      usuario_nombre: nombre,
    })
    setPending(prev => prev.filter(x => x.id !== id))
    return null
  }

  const filtered = pending.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.patente.toLowerCase().includes(q) || r.cliente.toLowerCase().includes(q) || String(r.numero).includes(q)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Cola de despacho" subtitle="Vehículos esperando confirmación de salida en portería">
        <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading} className="h-8 w-8 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </PageHeader>

      {fetchError && (
        <div className="mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          Error al cargar la cola: {fetchError}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto px-6 pt-4 pb-4 flex flex-col xl:flex-row gap-4">
        {/* Cola de espera */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 mb-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por patente, cliente o N°..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
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
        <div className="w-full xl:w-72 flex-shrink-0 flex flex-col min-h-0 gap-3">
          {/* Métricas del día */}
          <div className="bg-card rounded-xl border p-4 flex-shrink-0">
            <p className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Resumen de hoy</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Despachados
                </span>
                <span className="font-bold text-emerald-600">{dispatched.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  En espera
                </span>
                <span className="font-bold text-amber-600">{filtered.length}</span>
              </div>
              <div className="flex justify-between items-center text-xs border-t pt-2 mt-1">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold text-foreground">{dispatched.length + filtered.length}</span>
              </div>
            </div>
          </div>

          {/* Lista despachados hoy */}
          <div className="bg-card rounded-xl border flex flex-col min-h-0 overflow-hidden flex-1">
            <div className="px-4 py-3 border-b flex-shrink-0">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">Despachados hoy</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Registros del día actual</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {dispatched.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">Sin registros aún</p>
              ) : (
                dispatched.map(d => <DispatchedCard key={d.id} report={d} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
