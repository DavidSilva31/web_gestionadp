"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save, Send, ChevronRight, Loader2, Eye, Clock, CheckCircle2, History, FilePen, FileCheck2, Truck, FileText, Trash2, ScanLine, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit, accionLabel } from "@/lib/audit"
import type { AuditLog } from "@/lib/audit"
import type { ReportEstado } from "@/types/database"

type TipoMovimiento = "ingreso" | "despacho"
type TipoContenedor = "20ft" | "40ft" | "isotanque"
type SolicitadoPor  = "clientes" | "hds" | "operaciones" | "cuyd"

interface FormData {
  cliente: string; fecha: string; patente: string; conductor: string
  rut_conductor: string; empresa_transporte: string; hds_header: boolean
  sec1_activa: boolean; sec1_tipo_movimiento: TipoMovimiento | ""; sec1_tipo_contenedor: TipoContenedor | ""
  sec1_carga_normal: boolean; sec1_carga_imo: boolean; sec1_clase_imo: string; sec1_nu: string
  sec1_hora_inicio: string; sec1_hora_termino: string; sec1_sigla: string
  sec1_guia_numero: string; sec1_interchange: string; sec1_hds: boolean
  sec2_activa: boolean; sec2_consolidado: boolean; sec2_desconsolidado: boolean
  sec2_picking: boolean; sec2_paletizado: boolean; sec2_etiquetado: boolean; sec2_otro: boolean
  sec2_hora_inicio: string; sec2_hora_termino: string; sec2_sigla_numero: string; sec2_observaciones: string
  sec3_activa: boolean; sec3_producto: string; sec3_clase_imo: string
  sec3_hora_inicio: string; sec3_hora_termino: string; sec3_numero_bodega: string; sec3_nu: string
  sec3_tipo: TipoMovimiento | ""; sec3_numero_pallets: string; sec3_numero_guia: string
  sec3_solicitado_por: SolicitadoPor | ""; sec3_cuyd_detalle: string; sec3_observaciones: string
  nombre_operador: string
}

type Tab = "antecedentes" | "sec1" | "sec2" | "sec3" | "historial"

const TABS: { key: Tab; label: string; subtitle: string }[] = [
  { key: "antecedentes", label: "Antecedentes", subtitle: "Datos del vehículo y conductor"       },
  { key: "sec1",         label: "Sección 1",   subtitle: "Depósito de contenedores"             },
  { key: "sec2",         label: "Sección 2",   subtitle: "Consolidado / Desconsolidado / Otros" },
  { key: "sec3",         label: "Sección 3",   subtitle: "Bodegaje"                             },
  { key: "historial",    label: "Historial",   subtitle: "Registro de actividad"                },
]

const ACCION_ICON: Record<string, React.ReactNode> = {
  "report.crear_borrador":     <FileText   className="h-4 w-4 text-gray-500"    />,
  "report.actualizar":         <FilePen    className="h-4 w-4 text-blue-500"    />,
  "report.enviar_despacho":    <FileCheck2 className="h-4 w-4 text-amber-500"   />,
  "report.confirmar_despacho": <Truck      className="h-4 w-4 text-emerald-600" />,
  "report.despachar":          <ScanLine   className="h-4 w-4 text-emerald-600" />,
  "report.eliminar":           <Trash2     className="h-4 w-4 text-red-500"     />,
}

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:           { label: "Borrador",       className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pendiente_despacho: { label: "Pend. despacho", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  despachado:         { label: "Despachado",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}

function RadioGroup<T extends string>({ value, onChange, options, vertical, readOnly }: {
  value: T | ""; onChange: (v: T) => void; options: { value: T; label: string }[]; vertical?: boolean; readOnly?: boolean
}) {
  return (
    <div className={vertical ? "flex flex-col gap-2" : "flex gap-3"}>
      {options.map(opt => (
        <label
          key={opt.value}
          onClick={() => !readOnly && onChange(opt.value)}
          className={cn("flex items-center gap-1.5 select-none", readOnly ? "cursor-default" : "cursor-pointer group")}
        >
          <div className={cn(
            "h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors",
            value === opt.value ? "border-[oklch(0.35_0.12_240)] bg-[oklch(0.35_0.12_240)]" : "border-gray-300",
            !readOnly && "group-hover:border-gray-400"
          )}>
            {value === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
          </div>
          <span className="text-xs text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToForm(data: Record<string, any>): FormData {
  const s = (v: unknown) => (v ?? "") as string
  const b = (v: unknown) => Boolean(v)
  return {
    cliente: s(data.cliente), fecha: s(data.fecha), patente: s(data.patente), conductor: s(data.conductor),
    rut_conductor: s(data.rut_conductor), empresa_transporte: s(data.empresa_transporte), hds_header: b(data.hds_header),
    sec1_activa: b(data.sec1_activa), sec1_tipo_movimiento: s(data.sec1_tipo_movimiento) as TipoMovimiento | "",
    sec1_tipo_contenedor: s(data.sec1_tipo_contenedor) as TipoContenedor | "",
    sec1_carga_normal: b(data.sec1_carga_normal), sec1_carga_imo: b(data.sec1_carga_imo),
    sec1_clase_imo: s(data.sec1_clase_imo), sec1_nu: s(data.sec1_nu),
    sec1_hora_inicio: s(data.sec1_hora_inicio), sec1_hora_termino: s(data.sec1_hora_termino),
    sec1_sigla: s(data.sec1_sigla), sec1_guia_numero: s(data.sec1_guia_numero),
    sec1_interchange: s(data.sec1_interchange), sec1_hds: b(data.sec1_hds),
    sec2_activa: b(data.sec2_activa), sec2_consolidado: b(data.sec2_consolidado),
    sec2_desconsolidado: b(data.sec2_desconsolidado), sec2_picking: b(data.sec2_picking),
    sec2_paletizado: b(data.sec2_paletizado), sec2_etiquetado: b(data.sec2_etiquetado), sec2_otro: b(data.sec2_otro),
    sec2_hora_inicio: s(data.sec2_hora_inicio), sec2_hora_termino: s(data.sec2_hora_termino),
    sec2_sigla_numero: s(data.sec2_sigla_numero), sec2_observaciones: s(data.sec2_observaciones),
    sec3_activa: b(data.sec3_activa), sec3_producto: s(data.sec3_producto),
    sec3_clase_imo: s(data.sec3_clase_imo), sec3_hora_inicio: s(data.sec3_hora_inicio),
    sec3_hora_termino: s(data.sec3_hora_termino), sec3_numero_bodega: s(data.sec3_numero_bodega),
    sec3_nu: s(data.sec3_nu), sec3_tipo: s(data.sec3_tipo) as TipoMovimiento | "",
    sec3_numero_pallets: data.sec3_numero_pallets != null ? String(data.sec3_numero_pallets) : "",
    sec3_numero_guia: s(data.sec3_numero_guia),
    sec3_solicitado_por: s(data.sec3_solicitado_por) as SolicitadoPor | "",
    sec3_cuyd_detalle: s(data.sec3_cuyd_detalle), sec3_observaciones: s(data.sec3_observaciones),
    nombre_operador: s(data.nombre_operador),
  }
}

export default function ReportDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const { user, profile } = useAuth()
  const id = params.id as string

  const [tab,     setTab]     = useState<Tab>("antecedentes")
  const [form,    setForm]    = useState<FormData | null>(null)
  const [estado,  setEstado]  = useState<ReportEstado>("borrador")
  const [numero,  setNumero]  = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notFound,      setNotFound]      = useState(false)
  const [auditLogs,    setAuditLogs]    = useState<AuditLog[]>([])
  const [loadingLogs,  setLoadingLogs]  = useState(false)
  const [docPath,      setDocPath]      = useState<string | null>(null)
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null)
  const [docExpanded,  setDocExpanded]  = useState(false)

  const readOnly = estado !== "borrador"

  useEffect(() => {
    if (tab !== "historial") return
    async function fetchLogs() {
      setLoadingLogs(true)
      const supabase = createClient()
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tabla", "reports")
        .eq("registro_id", id)
        .order("created_at", { ascending: false })
      if (data) setAuditLogs(data as AuditLog[])
      setLoadingLogs(false)

      // Generar URL firmada si hay documento
      if (docPath && !signedDocUrl) {
        const { data: signed } = await supabase.storage
          .from("reports-firmados")
          .createSignedUrl(docPath, 3600)
        if (signed?.signedUrl) setSignedDocUrl(signed.signedUrl)
      }
    }
    fetchLogs()
  }, [tab, id, docPath, signedDocUrl])

  useEffect(() => {
    async function fetchReport() {
      const supabase = createClient()
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setEstado(data.estado as ReportEstado)
      setNumero(data.numero)
      setForm(dbToForm(data as Record<string, unknown>))
      if (data.documento_firmado_url) setDocPath(data.documento_firmado_url as string)
      setLoading(false)
    }
    fetchReport()
  }, [id])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => prev ? { ...prev, [key]: value } : prev)
  }

  const tabIndex = TABS.findIndex(t => t.key === tab)

  function nextTab() {
    if (tabIndex < TABS.length - 1) setTab(TABS[tabIndex + 1].key)
  }

  function buildPayload(newEstado: ReportEstado) {
    if (!form) return {}
    return {
      estado:             newEstado,
      cliente:            form.cliente,
      fecha:              form.fecha,
      patente:            form.patente,
      conductor:          form.conductor,
      rut_conductor:      form.rut_conductor      || null,
      empresa_transporte: form.empresa_transporte  || null,
      hds_header:         form.hds_header,
      sec1_activa:          form.sec1_activa,
      sec1_tipo_movimiento: form.sec1_tipo_movimiento || null,
      sec1_tipo_contenedor: form.sec1_tipo_contenedor || null,
      sec1_carga_normal:    form.sec1_carga_normal,
      sec1_carga_imo:       form.sec1_carga_imo,
      sec1_clase_imo:       form.sec1_clase_imo    || null,
      sec1_nu:              form.sec1_nu            || null,
      sec1_hora_inicio:     form.sec1_hora_inicio   || null,
      sec1_hora_termino:    form.sec1_hora_termino  || null,
      sec1_sigla:           form.sec1_sigla         || null,
      sec1_guia_numero:     form.sec1_guia_numero   || null,
      sec1_interchange:     form.sec1_interchange   || null,
      sec1_hds:             form.sec1_hds,
      sec2_activa:         form.sec2_activa,
      sec2_consolidado:    form.sec2_consolidado,
      sec2_desconsolidado: form.sec2_desconsolidado,
      sec2_picking:        form.sec2_picking,
      sec2_paletizado:     form.sec2_paletizado,
      sec2_etiquetado:     form.sec2_etiquetado,
      sec2_otro:           form.sec2_otro,
      sec2_hora_inicio:    form.sec2_hora_inicio    || null,
      sec2_hora_termino:   form.sec2_hora_termino   || null,
      sec2_sigla_numero:   form.sec2_sigla_numero   || null,
      sec2_observaciones:  form.sec2_observaciones  || null,
      sec3_activa:         form.sec3_activa,
      sec3_producto:       form.sec3_producto       || null,
      sec3_clase_imo:      form.sec3_clase_imo      || null,
      sec3_hora_inicio:    form.sec3_hora_inicio    || null,
      sec3_hora_termino:   form.sec3_hora_termino   || null,
      sec3_numero_bodega:  form.sec3_numero_bodega  || null,
      sec3_nu:             form.sec3_nu             || null,
      sec3_tipo:           form.sec3_tipo           || null,
      sec3_numero_pallets: form.sec3_numero_pallets ? Number(form.sec3_numero_pallets) : null,
      sec3_numero_guia:    form.sec3_numero_guia    || null,
      sec3_solicitado_por: form.sec3_solicitado_por || null,
      sec3_cuyd_detalle:   form.sec3_cuyd_detalle   || null,
      sec3_observaciones:  form.sec3_observaciones  || null,
      nombre_operador:     form.nombre_operador     || null,
      updated_at:          new Date().toISOString(),
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from("reports").delete().eq("id", id)
    await logAudit({
      tabla:          "reports",
      registro_id:    id,
      accion:         "report.eliminar",
      descripcion:    `Report #${numero} — ${form?.cliente} (${form?.patente}) eliminado`,
      usuario_id:     user?.id,
      usuario_nombre: profile?.nombre ?? user?.email,
    })
    router.push("/reports")
  }

  async function handleSave(newEstado: ReportEstado) {
    if (!form) return
    if (!form.cliente || !form.patente || !form.conductor) {
      setError("Cliente, patente y conductor son obligatorios.")
      setTab("antecedentes")
      return
    }
    setError(null)
    setSaving(true)
    const supabase = createClient()
    const { error: err } = await supabase.from("reports").update(buildPayload(newEstado)).eq("id", id)
    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      await logAudit({
        tabla:          "reports",
        registro_id:    id,
        accion:         newEstado === "pendiente_despacho" ? "report.enviar_despacho" : "report.actualizar",
        descripcion:    `Report #${numero} — ${form.cliente} (${form.patente})`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      router.push("/reports")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-muted-foreground">Report no encontrado</p>
        <Link href="/reports"><Button variant="outline" size="sm">Volver</Button></Link>
      </div>
    )
  }

  const currentTabInfo = TABS[tabIndex]

  return (
    <>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este report?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar el report <strong>#{numero}</strong> ({form?.cliente}). Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleDelete}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">
                Report #{numero}
              </h1>
              <Badge className={cn("text-[10px] font-semibold border-0", ESTADO_STYLE[estado].className)}>
                {ESTADO_STYLE[estado].label}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">{form.cliente} · {form.patente}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error && <p className="text-xs text-red-500 max-w-xs truncate">{error}</p>}

          <Button
            variant="ghost" size="sm"
            className="gap-1.5 h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
            disabled={deleting || saving}
            onClick={() => setConfirmDelete(true)}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar
          </Button>

          {estado === "borrador" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" disabled={saving} onClick={() => handleSave("borrador")}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar borrador
              </Button>
              <Button size="sm" className="gap-1.5 h-8 text-xs bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white" disabled={saving} onClick={() => handleSave("pendiente_despacho")}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar a despacho
              </Button>
            </>
          )}

          {estado === "pendiente_despacho" && (
            <Link href="/reports/despacho">
              <Button size="sm" className="gap-1.5 h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                <Clock className="h-3.5 w-3.5" />
                Ver cola de despacho
              </Button>
            </Link>
          )}

          {estado === "despachado" && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Report despachado
            </div>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 border-b text-xs text-amber-700 flex-shrink-0">
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          Este report está en modo lectura — solo los borradores pueden editarse.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-end gap-0 px-6 pt-3 border-b bg-gray-50 flex-shrink-0 overflow-x-hidden">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
              tab === t.key
                ? "border-[oklch(0.35_0.12_240)] text-[oklch(0.35_0.12_240)]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <span className={cn(
              "h-4 w-4 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0",
              tab === t.key ? "bg-[oklch(0.35_0.12_240)] text-white" : "bg-gray-200 text-gray-500"
            )}>
              {i + 1}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Form area */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        <div className={cn("mx-auto px-6 py-5", tab === "historial" ? "max-w-5xl" : "max-w-3xl")}>
          <div className="bg-white rounded-xl border p-5">
            <div className="mb-4 pb-3 border-b">
              <h2 className="text-sm font-bold text-gray-900">{currentTabInfo.label}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{currentTabInfo.subtitle}</p>
            </div>

            {tab === "antecedentes" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Cliente" required className="col-span-2">
                  <Input value={form.cliente} onChange={e => set("cliente", e.target.value)} placeholder="Nombre del cliente" className="h-8 text-xs" readOnly={readOnly} />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
                </Field>
                <Field label="Patente camión" required>
                  <Input value={form.patente} onChange={e => set("patente", e.target.value.toUpperCase())} placeholder="XXXX-00" className="h-8 text-xs font-mono" readOnly={readOnly} />
                </Field>
                <Field label="Conductor" required>
                  <Input value={form.conductor} onChange={e => set("conductor", e.target.value)} placeholder="Nombre completo" className="h-8 text-xs" readOnly={readOnly} />
                </Field>
                <Field label="RUT conductor">
                  <Input value={form.rut_conductor} onChange={e => set("rut_conductor", e.target.value)} placeholder="12.345.678-9" className="h-8 text-xs" readOnly={readOnly} />
                </Field>
                <Field label="Empresa de transporte" className="col-span-2">
                  <Input value={form.empresa_transporte} onChange={e => set("empresa_transporte", e.target.value)} placeholder="Razón social" className="h-8 text-xs" readOnly={readOnly} />
                </Field>
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <Checkbox id="hds_header" checked={form.hds_header} onCheckedChange={v => !readOnly && set("hds_header", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="hds_header" className="text-xs text-gray-700 cursor-pointer">HDS (Hoja de datos de seguridad presente)</label>
                </div>
              </div>
            )}

            {tab === "sec1" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="sec1_activa" checked={form.sec1_activa} onCheckedChange={v => !readOnly && set("sec1_activa", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="sec1_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">Activar Sección 1 — Depósito de Contenedores</label>
                </div>
                <div className={cn("space-y-4 transition-opacity", !form.sec1_activa && "opacity-40 pointer-events-none")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tipo de movimiento">
                      <RadioGroup<TipoMovimiento> value={form.sec1_tipo_movimiento} onChange={v => set("sec1_tipo_movimiento", v)} options={[{ value: "ingreso", label: "Ingreso" }, { value: "despacho", label: "Despacho" }]} readOnly={readOnly} />
                    </Field>
                    <Field label="Tipo de contenedor">
                      <RadioGroup<TipoContenedor> value={form.sec1_tipo_contenedor} onChange={v => set("sec1_tipo_contenedor", v)} options={[{ value: "20ft", label: "20ft" }, { value: "40ft", label: "40ft" }, { value: "isotanque", label: "Isotanque" }]} readOnly={readOnly} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Checkbox id="sec1_carga_normal" checked={form.sec1_carga_normal} onCheckedChange={v => !readOnly && set("sec1_carga_normal", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                      <label htmlFor="sec1_carga_normal" className="text-xs text-gray-700 cursor-pointer">Carga normal</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="sec1_carga_imo" checked={form.sec1_carga_imo} onCheckedChange={v => !readOnly && set("sec1_carga_imo", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                      <label htmlFor="sec1_carga_imo" className="text-xs text-gray-700 cursor-pointer">Carga IMO</label>
                    </div>
                  </div>
                  {form.sec1_carga_imo && (
                    <div className="grid grid-cols-2 gap-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <Field label="Clase IMO">
                        <Input value={form.sec1_clase_imo} onChange={e => set("sec1_clase_imo", e.target.value)} placeholder="Ej: 3, 6.1, 8..." className="h-8 text-xs" readOnly={readOnly} />
                      </Field>
                      <Field label="NU">
                        <Input value={form.sec1_nu} onChange={e => set("sec1_nu", e.target.value)} className="h-8 text-xs font-mono" readOnly={readOnly} />
                      </Field>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Hora inicio"><Input type="time" value={form.sec1_hora_inicio} onChange={e => set("sec1_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Hora término"><Input type="time" value={form.sec1_hora_termino} onChange={e => set("sec1_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Sigla"><Input value={form.sec1_sigla} onChange={e => set("sec1_sigla", e.target.value)} placeholder="Sigla del contenedor" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="N° Guía"><Input value={form.sec1_guia_numero} onChange={e => set("sec1_guia_numero", e.target.value)} placeholder="Número de guía" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Interchange"><Input value={form.sec1_interchange} onChange={e => set("sec1_interchange", e.target.value)} placeholder="N° Interchange" className="h-8 text-xs" readOnly={readOnly} /></Field>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="sec1_hds" checked={form.sec1_hds} onCheckedChange={v => !readOnly && set("sec1_hds", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                    <label htmlFor="sec1_hds" className="text-xs text-gray-700 cursor-pointer">HDS adjunto</label>
                  </div>
                </div>
              </div>
            )}

            {tab === "sec2" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="sec2_activa" checked={form.sec2_activa} onCheckedChange={v => !readOnly && set("sec2_activa", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="sec2_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">Activar Sección 2 — Consolidado / Desconsolidado / Otros</label>
                </div>
                <div className={cn("space-y-4 transition-opacity", !form.sec2_activa && "opacity-40 pointer-events-none")}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                    {([
                      ["sec2_consolidado", "Consolidado"], ["sec2_desconsolidado", "Desconsolidado"],
                      ["sec2_picking", "Picking"], ["sec2_paletizado", "Paletizado"],
                      ["sec2_etiquetado", "Etiquetado"], ["sec2_otro", "Otro"],
                    ] as [keyof FormData, string][]).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox id={key} checked={form[key] as boolean} onCheckedChange={v => !readOnly && set(key, v === true as FormData[typeof key])} className="h-3.5 w-3.5" disabled={readOnly} />
                        <label htmlFor={key} className="text-xs text-gray-700 cursor-pointer">{label}</label>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Hora inicio"><Input type="time" value={form.sec2_hora_inicio} onChange={e => set("sec2_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Hora término"><Input type="time" value={form.sec2_hora_termino} onChange={e => set("sec2_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Sigla / N°" className="col-span-2"><Input value={form.sec2_sigla_numero} onChange={e => set("sec2_sigla_numero", e.target.value)} placeholder="Sigla o número" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Observaciones" className="col-span-2">
                      <textarea value={form.sec2_observaciones} onChange={e => set("sec2_observaciones", e.target.value)} placeholder="Observaciones adicionales..." rows={3} readOnly={readOnly}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {tab === "sec3" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="sec3_activa" checked={form.sec3_activa} onCheckedChange={v => !readOnly && set("sec3_activa", v === true)} className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="sec3_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">Activar Sección 3 — Bodegaje</label>
                </div>
                <div className={cn("space-y-4 transition-opacity", !form.sec3_activa && "opacity-40 pointer-events-none")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Producto" className="col-span-2 sm:col-span-2"><Input value={form.sec3_producto} onChange={e => set("sec3_producto", e.target.value)} placeholder="Nombre del producto" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Clase IMO"><Input value={form.sec3_clase_imo} onChange={e => set("sec3_clase_imo", e.target.value)} placeholder="Clase IMO si aplica" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="NU"><Input value={form.sec3_nu} onChange={e => set("sec3_nu", e.target.value)} className="h-8 text-xs font-mono" readOnly={readOnly} /></Field>
                    <Field label="Hora inicio"><Input type="time" value={form.sec3_hora_inicio} onChange={e => set("sec3_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="Hora término"><Input type="time" value={form.sec3_hora_termino} onChange={e => set("sec3_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="N° Bodega"><Input value={form.sec3_numero_bodega} onChange={e => set("sec3_numero_bodega", e.target.value)} placeholder="Número de bodega" className="h-8 text-xs" readOnly={readOnly} /></Field>
                    <Field label="N° Guía" className="col-span-2"><Input value={form.sec3_numero_guia} onChange={e => set("sec3_numero_guia", e.target.value)} placeholder="Número de guía" className="h-8 text-xs" readOnly={readOnly} /></Field>

                    <div className="col-span-2 flex flex-wrap items-start gap-6 sm:gap-8 pt-1">
                      <Field label="Tipo de movimiento">
                        <RadioGroup<TipoMovimiento> value={form.sec3_tipo} onChange={v => set("sec3_tipo", v)}
                          options={[{ value: "ingreso", label: "Ingreso" }, { value: "despacho", label: "Despacho" }]} vertical readOnly={readOnly} />
                      </Field>
                      <Field label="N° Pallets">
                        <Input type="number" min={0} value={form.sec3_numero_pallets} onChange={e => set("sec3_numero_pallets", e.target.value)} placeholder="0" className="h-8 text-xs w-28" readOnly={readOnly} />
                      </Field>
                      <Field label="Solicitado por">
                        <select value={form.sec3_solicitado_por}
                          onChange={e => { set("sec3_solicitado_por", e.target.value as SolicitadoPor); if (e.target.value !== "cuyd") set("sec3_cuyd_detalle", "") }}
                          disabled={readOnly}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-default"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="clientes">Clientes</option>
                          <option value="hds">HDS</option>
                          <option value="operaciones">Operaciones</option>
                          <option value="cuyd">CUyD</option>
                        </select>
                        {form.sec3_solicitado_por === "cuyd" && (
                          <Input value={form.sec3_cuyd_detalle} onChange={e => set("sec3_cuyd_detalle", e.target.value)}
                            placeholder="Detalle CUyD..." className="h-7 text-xs mt-1.5 w-36" readOnly={readOnly} />
                        )}
                      </Field>
                    </div>

                    <Field label="Observaciones" className="col-span-2">
                      <textarea value={form.sec3_observaciones} onChange={e => set("sec3_observaciones", e.target.value)}
                        placeholder="Observaciones adicionales..." rows={3} readOnly={readOnly}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                    </Field>
                  </div>
                  <div className="border-t pt-4">
                    <Field label="Nombre operador de carga" required>
                      <Input value={form.nombre_operador} onChange={e => set("nombre_operador", e.target.value)} placeholder="Nombre completo del operador" className="h-8 text-xs" readOnly={readOnly} />
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Tab Historial ── */}
          {tab === "historial" && (
            <div className="space-y-4 mt-4">

              {/* Documento firmado — si existe */}
              {docPath && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDocExpanded(v => !v)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <ScanLine className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <div className="text-left">
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Documento firmado por el conductor</p>
                        <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 font-mono">{docPath}</p>
                      </div>
                    </div>
                    {docExpanded
                      ? <ChevronUp className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      : <ChevronDown className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                    }
                  </button>

                  {docExpanded && (
                    <div className="border-t border-emerald-200 dark:border-emerald-800 bg-gray-50 dark:bg-gray-900">
                      {!signedDocUrl ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : /\.(pdf)$/i.test(docPath) ? (
                        <iframe
                          src={signedDocUrl}
                          className="w-full"
                          style={{ height: "600px", border: "none" }}
                          title="Documento firmado"
                        />
                      ) : (
                        <div className="flex items-center justify-center p-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signedDocUrl}
                            alt="Documento firmado"
                            className="max-w-full max-h-[600px] object-contain rounded-lg shadow"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Timeline de auditoría */}
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <History className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Sin actividad registrada aún</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-3">
                    {auditLogs.map((log, i) => (
                      <div key={log.id} className="relative flex gap-4 pl-1">
                        <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-background border-2 border-border shadow-sm">
                          {ACCION_ICON[log.accion] ?? <History className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className={cn(
                          "flex-1 rounded-xl border bg-card px-4 py-3.5 space-y-1",
                          i === 0 && "border-[oklch(0.35_0.12_240)]/30 bg-[oklch(0.35_0.12_240)]/5"
                        )}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-semibold text-foreground leading-tight">
                              {accionLabel(log.accion)}
                            </p>
                            <time className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                              {new Date(log.created_at).toLocaleString("es-CL", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit"
                              })}
                            </time>
                          </div>
                          {log.descripcion && !/doc:/.test(log.descripcion) && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{log.descripcion}</p>
                          )}
                          {log.usuario_nombre && (
                            <p className="text-[10px] text-muted-foreground/60">por {log.usuario_nombre}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation footer — solo en tabs de formulario */}
          {tab !== "historial" && (
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => tabIndex > 0 && setTab(TABS[tabIndex - 1].key)} disabled={tabIndex === 0}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
              ← Anterior
            </button>
            <div className="flex gap-1.5">
              {TABS.filter(t => t.key !== "historial").map(t => (
                <div key={t.key} className={cn("h-1.5 rounded-full transition-all", tab === t.key ? "w-6 bg-[oklch(0.35_0.12_240)]" : "w-1.5 bg-gray-300")} />
              ))}
            </div>
            {tabIndex < TABS.length - 2 ? (
              <button onClick={nextTab} className="text-xs text-[oklch(0.35_0.12_240)] hover:text-[oklch(0.30_0.12_240)] flex items-center gap-1 font-medium">
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="w-16" />
            )}
          </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
