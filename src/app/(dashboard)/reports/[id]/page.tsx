"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save, Send, Loader2, Eye, Clock, CheckCircle2, History, FilePen, FileCheck2, Truck, FileText, Trash2, ScanLine, ChevronDown, ChevronUp, Camera, X, Paperclip, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { syncPesoTon } from "@/lib/inventario"
import { validateUploadFile, sanitizeExt } from "@/lib/upload-validation"
import { ReportArchivosPanel } from "@/components/reports/report-archivos-panel"
import { FirmaStaffBlock } from "@/components/reports/firma-staff-block"
import { firmarReport } from "@/lib/report-firmas"
import type { FirmaEvidencia } from "@/lib/firma-hash"
import type { AuditLog } from "@/lib/audit"
import type { ReportEstado } from "@/types/database"
import { dbToForm, emptyBodegajeItem, bodegajeItemFromDb } from "@/components/reports/report-form-types"
import type { ReportFormData, BodegajeItemFormData } from "@/components/reports/report-form-types"
import { Field, RadioGroup, Sec1Content, Sec2Content, Sec3Content, type FormSetter } from "@/components/reports/report-form-sections"
import { EstadoSemaforo } from "@/components/reports/report-estado-semaforo"
import { ClienteCombobox, FirmaCanvas, ServiciosSection, EmpresaTransporteCombobox, BodegajeItemsList, type ServicioSeleccionado, type TarifaOption } from "@/components/reports/report-form-widgets"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"
import { downloadReportPDF } from "@/lib/download-report-pdf"
import { useCloseOnBack } from "@/hooks/use-close-on-back"

interface FormData extends ReportFormData {
  cliente_id: string
}

const ACCION_ICON: Record<string, React.ReactNode> = {
  "report.crear_borrador":     <FileText   className="h-4 w-4 text-gray-500"    />,
  "report.actualizar":         <FilePen    className="h-4 w-4 text-blue-500"    />,
  "report.enviar_operaciones": <Send       className="h-4 w-4 text-orange-500"  />,
  "report.enviar_despacho":    <FileCheck2 className="h-4 w-4 text-amber-500"   />,
  "report.confirmar_despacho": <Truck      className="h-4 w-4 text-emerald-600" />,
  "report.despachar":          <ScanLine   className="h-4 w-4 text-emerald-600" />,
  "report.anular":             <Trash2     className="h-4 w-4 text-red-500"     />,
  "report.desanular":          <History    className="h-4 w-4 text-blue-500"    />,
}

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:              { label: "Ingresado",         className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pendiente_operaciones: { label: "Pend. operaciones", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  pendiente_despacho:    { label: "Pend. despacho",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  despachado:            { label: "Despachado",        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  anulado:               { label: "Anulado",           className: "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400 line-through" },
}

export default function ReportDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const { user, profile } = useAuth()
  const id = params.id as string

  const [form,      setForm]     = useState<FormData | null>(null)
  const [estado,    setEstado]   = useState<ReportEstado>("borrador")
  // Estado en el que estaba justo antes de anularse — permite a super_admin/
  // Javier Navarro "des-anular" restaurándolo exactamente a donde estaba.
  const [estadoPrevioAnulacion, setEstadoPrevioAnulacion] = useState<ReportEstado | null>(null)
  // Tarifa/Contrato ya no se elige a mano — se deriva sola por cada producto
  // de Bodegaje, comparando su Clase IMO contra la de cada contrato del
  // cliente (ver BodegajeItemsList en report-form-widgets.tsx).
  const [tarifasCliente, setTarifasCliente] = useState<TarifaOption[]>([])
  // Servicios del catálogo del cliente asociados a este report — se
  // muestran arriba de "Servicio Adicional" en Bodegaje (Sec3Content,
  // serviciosNode) para que Operaciones pueda marcar uno o más servicios ya
  // contratados por el cliente en vez de solo escribir texto libre en
  // Observaciones. servicios_ids repite el id tantas veces como la cantidad
  // elegida (ver buildPayload) — el HES cuenta esas repeticiones.
  const [servicioSeleccion, setServicioSeleccion] = useState<ServicioSeleccionado[]>([])
  const [serviciosManual, setServiciosManual] = useState<string[]>([])

  // Productos de Bodegaje — un report puede tener varios, cada uno con su
  // propia tarifa derivada de su Clase IMO (ver BodegajeItemsList). Se
  // cargan/guardan aparte, en report_bodegaje_items — no son parte de `form`.
  const [bodegajeItems, setBodegajeItems] = useState<BodegajeItemFormData[]>([])

  function changeBodegajeItem(index: number, patch: Partial<BodegajeItemFormData>) {
    setBodegajeItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it))
  }
  function addBodegajeItem() {
    setBodegajeItems(prev => [...prev, emptyBodegajeItem()])
  }
  function removeBodegajeItem(index: number) {
    setBodegajeItems(prev => prev.filter((_, i) => i !== index))
  }

  function toggleServicio(id: string) {
    setServicioSeleccion(prev =>
      prev.some(s => s.id === id) ? prev.filter(s => s.id !== id) : [...prev, { id, cantidad: 1 }]
    )
  }
  function cambiarCantidadServicio(id: string, cantidad: number) {
    setServicioSeleccion(prev => prev.map(s => s.id === id ? { ...s, cantidad } : s))
  }
  function agregarServicioManual(nombre: string) {
    setServiciosManual(prev => [...prev, nombre])
  }
  function quitarServicioManual(index: number) {
    setServiciosManual(prev => prev.filter((_, i) => i !== index))
  }
  const [numero,  setNumero]  = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [anulando,      setAnulando]      = useState(false)
  const [confirmAnular, setConfirmAnular] = useState(false)
  const [notFound,      setNotFound]      = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [auditLogs,    setAuditLogs]    = useState<AuditLog[]>([])
  const [loadingLogs,  setLoadingLogs]  = useState(false)
  const [logsLoaded,   setLogsLoaded]   = useState(false)
  const [docPath,      setDocPath]      = useState<string | null>(null)
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null)

  // Evidencia fotográfica de consolidado/desconsolidado — igual que en
  // reports/nuevo: se sube al guardar, path guardado en
  // reports.sec2_evidencia_archivos (bucket "reports-firmados").
  const [existingEvidenciaPaths, setExistingEvidenciaPaths] = useState<string[]>([])
  const [sec2EvidenciaFiles,     setSec2EvidenciaFiles]     = useState<File[]>([])
  const [sec2DragOver,           setSec2DragOver]           = useState(false)
  const [previewFile,            setPreviewFile]            = useState<File | null>(null)
  const sec2EvidenciaFileRef = useRef<HTMLInputElement>(null)

  // Adjuntos de Antecedentes — mismo patrón de dos fases que la evidencia
  // fotográfica, pero HDS y Guía de despacho comparten una sola caja (ver
  // adjuntoFiles): cualquiera de los dos checkboxes la despliega, y los
  // archivos nuevos que se suban quedan referenciados en hds_archivos y/o
  // guia_despacho_archivos según cuál checkbox esté marcado. Los ya
  // existentes se guardan por separado en cada columna (así lo dejó el
  // guardado original) y se muestran acá como una sola lista sin duplicados.
  const [existingHdsPaths,          setExistingHdsPaths]          = useState<string[]>([])
  const [existingGuiaDespachoPaths, setExistingGuiaDespachoPaths] = useState<string[]>([])
  // Archivos adjuntos del report (cualquier estado) — se guardan al instante desde ReportArchivosPanel.
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<string[]>([])
  const [adjuntoFiles,     setAdjuntoFiles]     = useState<File[]>([])
  const [adjuntoDragOver,  setAdjuntoDragOver]  = useState(false)
  const adjuntoFileRef = useRef<HTMLInputElement>(null)
  const existingAdjuntoPaths = useMemo(
    () => Array.from(new Set([...existingHdsPaths, ...existingGuiaDespachoPaths])),
    [existingHdsPaths, existingGuiaDespachoPaths]
  )

  // Firma del conductor — firmaPath es lo que ya está guardado en BD (si el
  // report ya fue firmado antes); firmaDataUrl es una firma NUEVA dibujada
  // recién ahora, que se sube al guardar.
  const [firmaPath,      setFirmaPath]      = useState<string | null>(null)
  const [firmaSignedUrl, setFirmaSignedUrl] = useState<string | null>(null)
  const [firmaUrlError,  setFirmaUrlError]  = useState(false)
  const [firmaRetryKey,  setFirmaRetryKey]  = useState(0)
  const [firmaDataUrl,   setFirmaDataUrl]   = useState<string | null>(null)
  const [reFirmando,     setReFirmando]     = useState(false)
  const [firmandoConductor, setFirmandoConductor] = useState(false)
  const [firmaError,        setFirmaError]        = useState<string | null>(null)
  // Firma electrónica: evidencia (quién/cuándo/huella) y firmas de Recepción y
  // encargado de bodega — se registran desde /api/reports/firmar.
  const [firmaEvidencia,  setFirmaEvidencia]  = useState<FirmaEvidencia>({})
  const [recepcionPath,   setRecepcionPath]   = useState<string | null>(null)
  const [bodegaPath,      setBodegaPath]      = useState<string | null>(null)

  useEffect(() => {
    if (!firmaPath) return
    let cancelled = false
    createClient().storage.from("reports-firmados").createSignedUrl(firmaPath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        // Antes, si fallaba, quedaba girando el spinner para siempre.
        if (error) { console.error("[report] error generando URL de la firma:", error); setFirmaUrlError(true); return }
        if (data?.signedUrl) setFirmaSignedUrl(data.signedUrl)
        else setFirmaUrlError(true)
      })
    return () => { cancelled = true }
  }, [firmaPath, firmaRetryKey])

  const previewUrl = useMemo(() => previewFile ? URL.createObjectURL(previewFile) : null, [previewFile])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  // Contratos del cliente — se usan para derivar sola la tarifa al elegir un
  // producto en Bodegaje (ver ProductoCombobox.onSelect), no para elegirla a mano.
  useEffect(() => {
    const clienteId = form?.cliente_id
    setTarifasCliente([])
    if (!clienteId) return
    createClient()
      .from("tarifas_cliente")
      .select("id, clase_imo, cotizacion_numero")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("clase_imo")
      .then(({ data, error }) => {
        if (error) { console.error("[report] error obteniendo tarifas del cliente:", error); return }
        setTarifasCliente((data as TarifaOption[]) ?? [])
      })
  }, [form?.cliente_id])

  function addSec2EvidenciaFiles(list: FileList | File[]) {
    setSec2EvidenciaFiles(prev => [...prev, ...Array.from(list)])
  }
  function removeSec2EvidenciaFile(index: number) {
    setSec2EvidenciaFiles(prev => prev.filter((_, i) => i !== index))
  }
  function onSec2EvidenciaDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setSec2DragOver(false)
    if (e.dataTransfer.files?.length) addSec2EvidenciaFiles(e.dataTransfer.files)
  }
  function addAdjuntoFiles(list: FileList | File[]) {
    setAdjuntoFiles(prev => [...prev, ...Array.from(list)])
  }
  function removeAdjuntoFile(index: number) {
    setAdjuntoFiles(prev => prev.filter((_, i) => i !== index))
  }
  function onAdjuntoDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setAdjuntoDragOver(false)
    if (e.dataTransfer.files?.length) addAdjuntoFiles(e.dataTransfer.files)
  }
  const [docExpanded,  setDocExpanded]  = useState(false)
  const [showPreview,   setShowPreview]   = useState(false)
  const [previewReport, setPreviewReport] = useState<import("@/types/database").Report | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useCloseOnBack(confirmAnular, () => setConfirmAnular(false))
  useCloseOnBack(previewFile !== null, () => setPreviewFile(null))

  // Javier Navarro (operador) tiene el mismo permiso de edición total que
  // super_admin sobre reports — puede editar cualquier campo sin importar el
  // estado (incluye despachado/anulado). Espejo del bypass es_editor_total_reports()
  // del lado de la base de datos (migration_reports_anular.sql) — si algún día
  // cambia quién tiene este permiso, hay que actualizar los dos lados.
  const JAVIER_NAVARRO_ID = "d0ef84af-0d9b-43b6-83bf-76f5b99b7e6f"
  const editorTotal = profile?.role === "super_admin" || user?.id === JAVIER_NAVARRO_ID

  // El formulario ya no se bloquea todo junto: Recepción llena Antecedentes +
  // Sección 1 mientras es "borrador"; al guardar pasa a "pendiente_operaciones"
  // y esa mitad se congela mientras se habilita la Sección 2 + 3 para que
  // Operaciones las complete. Servicios/Firma/Nombre operador quedan
  // editables en ambas mitades (recién se congelan al entrar a despacho).
  // super_admin y Javier Navarro se saltan todos estos candados.
  const leftReadOnly   = !editorTotal && estado !== "borrador"
  const rightReadOnly  = !editorTotal && estado !== "pendiente_operaciones"
  const sharedReadOnly = !editorTotal && (estado === "pendiente_despacho" || estado === "despachado" || estado === "anulado")
  // Las firmas se pueden aplicar/rehacer hasta que el report se despacha.
  const firmaBloqueada = !editorTotal && (estado === "despachado" || estado === "anulado")

  useEffect(() => {
    if (!historialOpen || logsLoaded) return
    async function fetchLogs() {
      setLoadingLogs(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tabla", "reports")
        .eq("registro_id", id)
        .order("created_at", { ascending: false })
      if (error) console.error("[report] error obteniendo historial de auditoría:", error)
      if (data) setAuditLogs(data as AuditLog[])
      setLoadingLogs(false)
      setLogsLoaded(true)

      // Generar URL firmada si hay documento
      if (docPath && !signedDocUrl) {
        const { data: signed, error: signedErr } = await supabase.storage
          .from("reports-firmados")
          .createSignedUrl(docPath, 3600)
        if (signedErr) console.error("[report] error generando URL del documento firmado:", signedErr)
        if (signed?.signedUrl) setSignedDocUrl(signed.signedUrl)
      }
    }
    fetchLogs()
  }, [historialOpen, logsLoaded, id, docPath, signedDocUrl])

  useEffect(() => {
    async function fetchReport() {
      const supabase = createClient()
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setEstado(data.estado as ReportEstado)
      setEstadoPrevioAnulacion((data.estado_previo_anulacion as ReportEstado | null) ?? null)
      setNumero(data.numero)
      const base = dbToForm(data as Record<string, unknown>)
      setForm({ ...base, cliente_id: "" })

      const { data: items, error: itemsErr } = await supabase
        .from("report_bodegaje_items").select("*").eq("report_id", id).order("orden")
      if (itemsErr) console.error("[reports/id] error obteniendo productos de Bodegaje:", itemsErr)
      setBodegajeItems(((items as Record<string, unknown>[] | null) ?? []).map(bodegajeItemFromDb))
      // servicios_ids es un uuid[] plano — un servicio usado 2 veces quedó
      // repetido 2 veces; se reconstruye la cantidad contando ocurrencias.
      const counts = new Map<string, number>()
      for (const sid of (data.servicios_ids as string[] | null) ?? []) counts.set(sid, (counts.get(sid) ?? 0) + 1)
      setServicioSeleccion([...counts.entries()].map(([sid, cantidad]) => ({ id: sid, cantidad })))
      setServiciosManual((data.servicios_manual as string[] | null) ?? [])
      if (data.documento_firmado_url) setDocPath(data.documento_firmado_url as string)
      setExistingEvidenciaPaths((data.sec2_evidencia_archivos as string[] | null) ?? [])
      setExistingHdsPaths((data.hds_archivos as string[] | null) ?? [])
      setExistingGuiaDespachoPaths((data.guia_despacho_archivos as string[] | null) ?? [])
      setArchivosAdjuntos((data.archivos_pendiente_despacho as string[] | null) ?? [])
      if (data.firma_conductor_url) setFirmaPath(data.firma_conductor_url as string)
      setRecepcionPath((data.firma_recepcion_url as string | null) ?? null)
      setBodegaPath((data.firma_bodega_url as string | null) ?? null)
      setFirmaEvidencia((data.firma_evidencia as FirmaEvidencia | null) ?? {})
      setLoading(false)

      // El report solo guarda el nombre del cliente — resolver su id para que
      // ProductoCombobox/ServiciosSection/tarifasCliente (que filtran por
      // cliente_id) funcionen igual que en reports/nuevo. Si el cliente fue
      // renombrado después de crear este report, el lookup por nombre no
      // encuentra nada y esos selectores quedarían vacíos en silencio —
      // avisar en vez de dejarlo pasar sin explicación.
      if (data.cliente) {
        const { data: cli } = await supabase.from("clientes").select("id").eq("nombre", data.cliente as string).maybeSingle()
        if (cli) {
          setForm(prev => prev ? { ...prev, cliente_id: cli.id } : prev)
        } else {
          setError(`No se encontró el cliente "${data.cliente}" — puede que haya sido renombrado. Tarifa, producto y servicios no cargarán hasta corregirlo.`)
        }
      }
    }
    fetchReport()
  }, [id])

  // Registra la firma del conductor (firma en pantalla) con su evidencia.
  async function firmarConductor(): Promise<boolean> {
    if (!firmaDataUrl) return false
    setFirmandoConductor(true)
    setFirmaError(null)
    try {
      const res = await firmarReport(id, "conductor", firmaDataUrl)
      setFirmaPath(res.path)
      setFirmaEvidencia(res.evidencia)
      setFirmaDataUrl(null)
      setReFirmando(false)
      return true
    } catch (err) {
      console.error("[reports/id] error firmando como conductor:", err)
      const msg = err instanceof Error ? err.message : "No se pudo registrar la firma."
      setFirmaError(msg)
      setError(`El report se guardó, pero la firma del conductor no se registró: ${msg}`)
      return false
    } finally {
      setFirmandoConductor(false)
    }
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => prev ? { ...prev, [key]: value } : prev)
  }

  // Sin el checkbox "Activar Sección", se infiere sola: activa si algún campo
  // propio de esa sección quedó con contenido — misma lógica que reports/nuevo.
  function buildPayload(newEstado: ReportEstado) {
    if (!form) return {}
    const sec1Activa = !!(
      form.sec1_tipo_movimiento || form.sec1_tipo_contenedor || form.sec1_carga_normal ||
      form.sec1_carga_imo || form.sec1_clase_imo || form.sec1_nu || form.sec1_hora_inicio ||
      form.sec1_hora_termino || form.sec1_sigla || form.sec1_guia_numero || form.sec1_interchange ||
      form.sec1_hds
    )
    const sec2Activa = !!(
      form.sec2_consolidado || form.sec2_desconsolidado || form.sec2_picking ||
      form.sec2_paletizado || form.sec2_etiquetado || form.sec2_otro ||
      form.sec2_hora_inicio || form.sec2_hora_termino || form.sec2_sigla_numero || form.sec2_observaciones
    )
    // sec3_numero_guia/sec3_solicitado_por/sec3_cuyd_detalle quedaron fuera:
    // ahora viven en Antecedentes (los llena Recepción en TODO report, incluso
    // sin Bodegaje), así que ya no sirven como señal de que Bodegaje se usó.
    const sec3Activa = !!(
      bodegajeItems.length > 0 || form.sec3_hora_inicio || form.sec3_hora_termino ||
      form.sec3_tipo || form.sec3_observaciones
    )

    return {
      estado:             newEstado,
      cliente:            form.cliente,
      fecha:              form.fecha,
      patente:            form.patente,
      conductor:          form.conductor,
      rut_conductor:      form.rut_conductor      || null,
      empresa_transporte: form.transporte_tipo === "propio" ? null : (form.empresa_transporte || null),
      transporte_tipo:    form.transporte_tipo,
      hds_header:         form.hds_header,
      guia_despacho_header: form.guia_despacho_header,
      observaciones:      form.observaciones || null,
      sec1_activa:          sec1Activa,
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
      sec2_activa:         sec2Activa,
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
      sec3_activa:              sec3Activa,
      sec3_hora_inicio:    form.sec3_hora_inicio    || null,
      sec3_hora_termino:   form.sec3_hora_termino   || null,
      sec3_tipo:           form.sec3_tipo           || null,
      sec3_numero_guia:    form.sec3_numero_guia    || null,
      sec3_solicitado_por: form.sec3_solicitado_por || null,
      sec3_cuyd:           form.sec3_cuyd,
      sec3_cuyd_detalle:   form.sec3_cuyd_detalle   || null,
      sec3_observaciones:  form.sec3_observaciones  || null,
      sec3_servicio_adicional: form.sec3_servicio_adicional,
      nombre_operador:     form.nombre_operador     || null,
      servicios_ids:       servicioSeleccion.flatMap(s => Array(s.cantidad).fill(s.id)),
      servicios_manual:    serviciosManual,
      updated_at:          new Date().toISOString(),
    }
  }

  // Los reports se anulan, nunca se eliminan — así no se pierde nada (queda
  // el registro completo, solo con estado "anulado"). Si el report ya estaba
  // despachado, el trigger sync_bodegaje_stock_on_reports_change revierte el
  // stock que había movido y borra los movimientos que había auto-generado
  // (para que Kardex/HES no los sigan contando) — acá solo hay que
  // resincronizar peso_ton después.
  async function handleAnular() {
    if (!form) return
    setAnulando(true)
    try {
      const supabase = createClient()
      const itemIds = Array.from(new Set(
        bodegajeItems.map(it => it.sec3_inventario_item_id).filter(Boolean)
      ))
      const { error: updErr } = await supabase.from("reports").update({
        estado:                   "anulado",
        estado_previo_anulacion:  estado,
        anulado_at:               new Date().toISOString(),
        anulado_por:              user?.id ?? null,
        updated_at:               new Date().toISOString(),
      }).eq("id", id)
      if (updErr) {
        setError(`No se pudo anular: ${updErr.message}`)
        return
      }
      if (form.sec3_activa) {
        for (const itemId of itemIds) await syncPesoTon(supabase, itemId)
      }
      logAudit({
        tabla:          "reports",
        registro_id:    id,
        accion:         "report.anular",
        descripcion:    `Report #${numero} — ${form.cliente} (${form.patente}) anulado`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      setEstadoPrevioAnulacion(estado)
      setEstado("anulado")
      setConfirmAnular(false)
    } catch (err) {
      console.error("[reports/id] error inesperado al anular:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setAnulando(false)
    }
  }

  // Solo super_admin/Javier Navarro llegan a ver este botón (editorTotal) —
  // restaura el report exactamente al estado en que estaba antes de
  // anularse. Si volvía a "despachado", los mismos triggers que revirtieron
  // el stock al anular lo vuelven a aplicar y regeneran los movimientos.
  async function handleDesanular() {
    if (!form) return
    setAnulando(true)
    try {
      const supabase = createClient()
      const target = estadoPrevioAnulacion ?? "pendiente_despacho"
      const { error: updErr } = await supabase.from("reports").update({
        estado:                   target,
        estado_previo_anulacion:  null,
        anulado_at:               null,
        anulado_por:              null,
        updated_at:               new Date().toISOString(),
      }).eq("id", id)
      if (updErr) {
        setError(`No se pudo restaurar: ${updErr.message}`)
        return
      }
      if (form.sec3_activa) {
        const itemIds = Array.from(new Set(
          bodegajeItems.map(it => it.sec3_inventario_item_id).filter(Boolean)
        ))
        for (const itemId of itemIds) await syncPesoTon(supabase, itemId)
      }
      logAudit({
        tabla:          "reports",
        registro_id:    id,
        accion:         "report.desanular",
        descripcion:    `Report #${numero} — ${form.cliente} (${form.patente}) restaurado desde anulado`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      setEstado(target)
      setEstadoPrevioAnulacion(null)
    } catch (err) {
      console.error("[reports/id] error inesperado al des-anular:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setAnulando(false)
    }
  }

  async function handleSave(newEstado: ReportEstado) {
    if (!form) return
    if (!form.cliente || !form.patente || !form.conductor || !form.rut_conductor || !form.sec3_numero_guia) {
      setError("Cliente, patente, conductor, RUT conductor y N° Guía son obligatorios.")
      return
    }
    // La tarifa/contrato se deriva sola de la Clase IMO del producto elegido
    // en Bodegaje (ver ProductoCombobox.onSelect) — si no hay match, queda
    // sin asignar y solo se avisa con el mensaje ámbar bajo Producto, sin
    // bloquear el envío a despacho.
    setError(null)
    setSaving(true)
    // try/finally envolviendo todo: antes, una excepción real (no un error
    // devuelto por Supabase) dejaba "saving" en true para siempre.
    try {
    const supabase = createClient()
    const payload = buildPayload(newEstado)
    const { error: err } = await supabase.from("reports").update(payload).eq("id", id)
    if (err) {
      setError(err.message)
      return
    }

    // Productos de Bodegaje: reemplazar todo (borrar + reinsertar) es más
    // simple que diferenciar altas/bajas/ediciones para el puñado de
    // productos típico por report — mismo patrón "dos pasos" que ya usan
    // adjuntos/evidencia acá abajo. Solo corre mientras es editable
    // (!rightReadOnly): una vez despachado, report_bodegaje_items_lock
    // rechazaría el intento, y no hay nada que reemplazar de todas formas.
    if (!rightReadOnly) {
      const { error: delItemsErr } = await supabase.from("report_bodegaje_items").delete().eq("report_id", id)
      if (delItemsErr) { setError(delItemsErr.message); return }
      if (bodegajeItems.length > 0) {
        const { error: insItemsErr } = await supabase.from("report_bodegaje_items").insert(
          bodegajeItems.map((it, index) => ({
            report_id: id,
            orden: index,
            sec3_inventario_item_id: it.sec3_inventario_item_id || null,
            sec3_producto:           it.sec3_producto           || null,
            sec3_clase_imo:          it.sec3_clase_imo          || null,
            sec3_nu:                 it.sec3_nu                 || null,
            sec3_numero_bodega:      it.sec3_numero_bodega      || null,
            sec3_numero_pallets:     it.sec3_numero_pallets     ? Number(it.sec3_numero_pallets)  : null,
            sec3_numero_unidades:    it.sec3_numero_unidades    ? Number(it.sec3_numero_unidades) : null,
            sec3_lote:               it.sec3_lote               || null,
            sec3_cas:                it.sec3_cas                || null,
            sec3_orden_compra:       it.sec3_orden_compra       || null,
            sec3_fecha_elaboracion:  it.sec3_fecha_elaboracion  || null,
            sec3_fecha_vencimiento:  it.sec3_fecha_vencimiento  || null,
            tarifa_cliente_id:       it.tarifa_cliente_id       || null,
          }))
        )
        if (insItemsErr) { setError(insItemsErr.message); return }
      }
    }

    // Si se escribió una empresa de transporte nueva, queda guardada en el
    // catálogo para aparecer como sugerencia en los próximos reports — no
    // bloquea el guardado del report si esto falla (ej. nombre duplicado).
    if (form.transporte_tipo === "externo" && form.empresa_transporte.trim()) {
      supabase.from("empresas_transporte")
        .upsert({ nombre: form.empresa_transporte.trim(), created_by: user?.id ?? null }, { onConflict: "nombre", ignoreDuplicates: true })
        .then(({ error: catalogErr }) => { if (catalogErr) console.error("[reports/id] error guardando empresa de transporte en el catálogo:", catalogErr) })
    }

    // Subir adjuntos nuevos de Antecedentes (HDS y/o Guía de despacho
    // comparten la misma caja) y sumarlos a los que ya tenía el report en
    // cada columna correspondiente — mismo patrón de dos fases que en
    // reports/nuevo.
    let adjuntoFailed = adjuntoFiles.some(f => validateUploadFile(f))
    if (adjuntoFiles.length > 0) {
      const uploadedPaths: string[] = []
      for (let i = 0; i < adjuntoFiles.length && !adjuntoFailed; i++) {
        const file = adjuntoFiles[i]
        const ext  = sanitizeExt(file.name)
        const path = `adjunto-${numero}-${id}-${existingAdjuntoPaths.length + i}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("reports-firmados")
          .upload(path, file, { upsert: true })
        if (uploadErr) {
          console.error("[reports/id] error subiendo adjunto de Antecedentes:", uploadErr)
          adjuntoFailed = true
        } else {
          uploadedPaths.push(path)
        }
      }
      if (uploadedPaths.length > 0) {
        const updatePayload: Record<string, string[]> = {}
        if (form.hds_header)           updatePayload.hds_archivos           = [...existingHdsPaths, ...uploadedPaths]
        if (form.guia_despacho_header) updatePayload.guia_despacho_archivos = [...existingGuiaDespachoPaths, ...uploadedPaths]
        const { error: adjuntoUpdateErr } = await supabase
          .from("reports")
          .update(updatePayload)
          .eq("id", id)
        if (adjuntoUpdateErr) {
          console.error("[reports/id] error guardando referencia de los adjuntos:", adjuntoUpdateErr)
          adjuntoFailed = true
        }
      }
      if (adjuntoFailed) {
        setError("No se pudo subir el archivo adjunto. Vuelve a intentarlo antes de guardar.")
        return
      }
    }

    // Subir evidencia fotográfica nueva (si se adjuntó) y sumarla a la que
    // ya tenía el report — mismo patrón que los HDS en reports/nuevo.
    let evidenciaFailed = sec2EvidenciaFiles.some(f => validateUploadFile(f))
    if (sec2EvidenciaFiles.length > 0) {
      const uploadedPaths: string[] = []
      for (let i = 0; i < sec2EvidenciaFiles.length && !evidenciaFailed; i++) {
        const file = sec2EvidenciaFiles[i]
        const ext  = sanitizeExt(file.name, "jpg")
        const path = `sec2-evidencia-${numero}-${id}-${existingEvidenciaPaths.length + i}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("reports-firmados")
          .upload(path, file, { upsert: true })
        if (uploadErr) {
          console.error("[reports/id] error subiendo evidencia fotográfica:", uploadErr)
          evidenciaFailed = true
        } else {
          uploadedPaths.push(path)
        }
      }
      if (uploadedPaths.length > 0) {
        const nuevosPaths = [...existingEvidenciaPaths, ...uploadedPaths]
        const { error: evidenciaUpdateErr } = await supabase
          .from("reports")
          .update({ sec2_evidencia_archivos: nuevosPaths })
          .eq("id", id)
        if (evidenciaUpdateErr) {
          console.error("[reports/id] error guardando referencia de la evidencia:", evidenciaUpdateErr)
          evidenciaFailed = true
        }
      }
      if (evidenciaFailed) {
        setError("No se pudo subir la evidencia fotográfica. Vuelve a intentarlo antes de guardar.")
        return
      }
    }

    // Firma del conductor dibujada y sin confirmar: se registra al guardar.
    if (firmaDataUrl && !firmaBloqueada) {
      if (!(await firmarConductor())) return
    }

    // stock_actual solo lo mueve el trigger de BD reports_sync_inventario
    // cuando el report queda en estado 'despachado' — una edición mientras
    // sigue en borrador/pendiente_despacho no toca stock. syncPesoTon corre
    // igual siempre que haya ítem vinculado para no dejar peso_ton
    // desactualizado en ediciones que no cambian de estado.
    if (form.sec3_activa) {
      const itemIds = Array.from(new Set(
        bodegajeItems.map(it => it.sec3_inventario_item_id).filter(Boolean)
      ))
      for (const itemId of itemIds) await syncPesoTon(supabase, itemId)
    }

    logAudit({
      tabla:          "reports",
      registro_id:    id,
      accion:         newEstado === "pendiente_despacho"    ? "report.enviar_despacho" :
                      newEstado === "pendiente_operaciones" && estado === "borrador" ? "report.enviar_operaciones" :
                      "report.actualizar",
      descripcion:    `Report #${numero} — ${form.cliente} (${form.patente})`,
      usuario_id:     user?.id,
      usuario_nombre: profile?.nombre ?? user?.email,
    })
    router.push("/reports")
    } catch (err) {
      console.error("[reports/id] error inesperado al guardar:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
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

  return (
    <>
    {/* Modal vista previa PDF */}
    {showPreview && previewReport && (
      <ReportPreviewModal
        report={previewReport}
        onClose={() => setShowPreview(false)}
        onDownload={() => downloadReportPDF(previewReport)}
      />
    )}

    <AlertDialog open={confirmAnular} onOpenChange={setConfirmAnular}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </span>
            ¿Anular este report?
          </AlertDialogTitle>
          <AlertDialogDescription>
            El report <strong>#{numero}</strong> ({form?.cliente}) queda marcado como <strong>Anulado</strong> — no se elimina,
            todos sus datos se conservan y queda visible en la pestaña "Anulados".
            {estado === "despachado" && " Como ya estaba despachado, el stock que movió se revierte y sus movimientos generados se eliminan."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={anulando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={anulando}
            className="gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
            onClick={handleAnular}
          >
            {anulando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Anular
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-foreground">
                Report #{numero}
              </h1>
              <EstadoSemaforo estado={estado} />
              <Badge className={cn("text-[10px] font-semibold border-0", ESTADO_STYLE[estado].className)}>
                {ESTADO_STYLE[estado].label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{form.cliente} · {form.patente}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {error && <p className="text-xs text-red-500 max-w-xs truncate">{error}</p>}

          {/* Vista previa PDF */}
          <Button
            variant="outline" size="sm"
            className="gap-1.5 h-8 text-xs"
            disabled={saving || anulando || previewLoading}
            onClick={async () => {
              setPreviewLoading(true)
              setError(null)
              try {
                const supabase = createClient()
                const { data, error } = await supabase.from("reports").select("*").eq("id", id).single()
                if (error) throw error
                if (data) { setPreviewReport(data as import("@/types/database").Report); setShowPreview(true) }
              } catch (err) {
                console.error("[report] error generando vista previa:", err)
                setError("No se pudo generar la vista previa.")
              } finally {
                setPreviewLoading(false)
              }
            }}
          >
            {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Vista previa
          </Button>

          {estado === "anulado" ? (
            editorTotal && (
              <Button
                variant="outline" size="sm"
                className="gap-1.5 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                disabled={anulando || saving}
                onClick={handleDesanular}
              >
                {anulando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                Des-anular
              </Button>
            )
          ) : (
            <Button
              variant="ghost" size="sm"
              className="gap-1.5 h-8 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
              disabled={anulando || saving}
              onClick={() => setConfirmAnular(true)}
            >
              {anulando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Anular
            </Button>
          )}

          {estado === "borrador" && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" disabled={saving} onClick={() => handleSave("borrador")}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Ingreso Report
              </Button>
              <Button size="sm" className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/85 text-primary-foreground" disabled={saving} onClick={() => handleSave("pendiente_operaciones")}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar a Operaciones
              </Button>
            </>
          )}

          {estado === "pendiente_operaciones" && (
            <Button size="sm" className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/85 text-primary-foreground" disabled={saving || !form.nombre_operador.trim()} onClick={() => handleSave("pendiente_despacho")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar a despacho
            </Button>
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

          {/* super_admin y Javier Navarro pueden guardar ediciones en
              cualquier estado, incluidos despachado/anulado donde nadie más
              tiene un botón de guardar disponible. */}
          {editorTotal && (estado === "despachado" || estado === "anulado" || estado === "pendiente_despacho") && (
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" disabled={saving} onClick={() => handleSave(estado)}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar cambios
            </Button>
          )}
        </div>
      </div>

      {!editorTotal && (estado === "pendiente_despacho" || estado === "despachado") && (
        <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 dark:bg-amber-900/20 border-b text-xs text-amber-700 dark:text-amber-400 flex-shrink-0">
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          Este report está en modo lectura — solo se puede editar mientras Recepción u Operaciones lo están llenando.
        </div>
      )}

      {estado === "anulado" && (
        <div className="flex items-center gap-2 px-6 py-2 bg-gray-100 dark:bg-gray-800/40 border-b text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
          <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
          Este report está anulado{!editorTotal && " — modo lectura"}.
        </div>
      )}

      {editorTotal && estado !== "borrador" && estado !== "pendiente_operaciones" && estado !== "anulado" && (
        <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 dark:bg-blue-900/20 border-b text-xs text-blue-700 dark:text-blue-400 flex-shrink-0">
          <FilePen className="h-3.5 w-3.5 flex-shrink-0" />
          Edición habilitada para tu rol — este report normalmente estaría bloqueado en este estado.
        </div>
      )}

      {/* Form area — misma vista de una sola página que reports/nuevo */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 p-3">
        <div className="bg-card rounded-xl border h-full p-4 overflow-y-auto">
          <div className="flex flex-col lg:flex-row gap-x-6 gap-y-3">
            {/* Columna izquierda: Antecedentes + Sección 1 */}
            <div className="flex-1 min-w-0 flex flex-col gap-y-3">

            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">Antecedentes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Cliente" required className="col-span-1 sm:col-span-3">
                  <ClienteCombobox
                    value={form.cliente}
                    onChange={v => set("cliente", v)}
                    onChangeId={cid => {
                      setForm(prev => prev ? { ...prev, cliente_id: cid } : prev)
                      setServicioSeleccion([])
                      // El catálogo de productos es por cliente — si cambia,
                      // los productos ya elegidos ya no aplican.
                      setBodegajeItems([])
                    }}
                    readOnly={leftReadOnly}
                  />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} className="h-8 text-xs" disabled={leftReadOnly} />
                </Field>
                <Field label="Patente camión" required>
                  <Input value={form.patente} onChange={e => set("patente", e.target.value.toUpperCase())} placeholder="XXXX-00" className="h-8 text-xs font-mono" disabled={leftReadOnly} />
                </Field>
                <Field label="Conductor" required>
                  <Input value={form.conductor} onChange={e => set("conductor", e.target.value.toUpperCase())} placeholder="Nombre completo" className="h-8 text-xs" disabled={leftReadOnly} />
                </Field>
                <Field label="RUT conductor" required>
                  <Input value={form.rut_conductor} onChange={e => set("rut_conductor", e.target.value)} placeholder="12.345.678-9" className="h-8 text-xs font-mono" disabled={leftReadOnly} />
                </Field>
                <Field label="N° Guía" required>
                  <Input value={form.sec3_numero_guia} onChange={e => set("sec3_numero_guia", e.target.value.toUpperCase())} placeholder="Número de guía" className="h-8 text-xs" disabled={leftReadOnly} />
                </Field>
                <Field label="Solicitado por">
                  <select value={form.sec3_solicitado_por}
                    onChange={e => set("sec3_solicitado_por", e.target.value as FormData["sec3_solicitado_por"])}
                    disabled={leftReadOnly}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-default"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="clientes">Clientes</option>
                    <option value="operaciones">Operaciones</option>
                  </select>
                </Field>
                <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                  <Checkbox
                    id="sec3_cuyd"
                    checked={form.sec3_cuyd}
                    disabled={leftReadOnly}
                    onCheckedChange={v => {
                      const checked = v === true
                      set("sec3_cuyd", checked)
                      if (!checked) set("sec3_cuyd_detalle", "")
                    }}
                  />
                  <label htmlFor="sec3_cuyd" className="text-xs text-foreground/80 cursor-pointer">CUyD</label>
                  {form.sec3_cuyd && (
                    <Input value={form.sec3_cuyd_detalle} onChange={e => set("sec3_cuyd_detalle", e.target.value)} placeholder="Detalle" className="h-7 text-xs flex-1 max-w-[220px]" disabled={leftReadOnly} />
                  )}
                </div>
                <Field label="Transporte" className="col-span-1 sm:col-span-2">
                  <div className="h-8 flex items-center">
                    <RadioGroup
                      value={form.transporte_tipo}
                      onChange={v => {
                        if (leftReadOnly) return
                        set("transporte_tipo", v)
                        if (v === "propio") set("empresa_transporte", "")
                      }}
                      options={[{ value: "propio", label: "Transporte ADP" }, { value: "externo", label: "Transporte Cliente" }]}
                      readOnly={leftReadOnly}
                    />
                  </div>
                </Field>
                <Field label="Tipo de movimiento">
                  <div className="h-8 flex items-center">
                    <RadioGroup
                      value={form.sec3_tipo}
                      onChange={v => !leftReadOnly && set("sec3_tipo", v)}
                      options={[{ value: "ingreso", label: "Ingreso" }, { value: "despacho", label: "Despacho" }]}
                      readOnly={leftReadOnly}
                    />
                  </div>
                </Field>
                {form.transporte_tipo === "externo" && (
                  <Field label="Empresa de transporte" className="col-span-1 sm:col-span-2">
                    <EmpresaTransporteCombobox value={form.empresa_transporte} onChange={v => set("empresa_transporte", v)} readOnly={leftReadOnly} />
                  </Field>
                )}
                <div className="col-span-1 sm:col-span-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox id="hds_header" checked={form.hds_header} onCheckedChange={v => {
                      if (leftReadOnly) return
                      const checked = v === true
                      set("hds_header", checked)
                      if (!checked && !form.guia_despacho_header) {
                        setAdjuntoFiles([])
                        if (adjuntoFileRef.current) adjuntoFileRef.current.value = ""
                      }
                    }} className="h-3.5 w-3.5" disabled={leftReadOnly} />
                    <label htmlFor="hds_header" className="text-xs font-bold text-foreground cursor-pointer">HDS (Hoja de datos de seguridad presente)</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="guia_despacho_header"
                      checked={form.guia_despacho_header}
                      onCheckedChange={v => {
                        if (leftReadOnly) return
                        const checked = v === true
                        set("guia_despacho_header", checked)
                        if (!checked && !form.hds_header) {
                          setAdjuntoFiles([])
                          if (adjuntoFileRef.current) adjuntoFileRef.current.value = ""
                        }
                      }}
                      className="h-3.5 w-3.5"
                      disabled={leftReadOnly}
                    />
                    <label htmlFor="guia_despacho_header" className="text-xs font-bold text-foreground cursor-pointer">Guía de despacho</label>
                  </div>
                </div>
                {(form.hds_header || form.guia_despacho_header) && (
                  <div className="col-span-1 sm:col-span-3 flex flex-col gap-1.5">
                    {existingAdjuntoPaths.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {existingAdjuntoPaths.map((path, i) => (
                          <EvidenciaExistenteLink key={path} path={path} index={i} label="Adjunto" />
                        ))}
                      </div>
                    )}

                    {!leftReadOnly && (
                      <>
                        <input
                          ref={adjuntoFileRef}
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                          className="hidden"
                          onChange={e => { if (e.target.files) addAdjuntoFiles(e.target.files); e.target.value = "" }}
                        />
                        <div
                          onClick={() => adjuntoFileRef.current?.click()}
                          onDragOver={e => { e.preventDefault(); setAdjuntoDragOver(true) }}
                          onDragLeave={e => { e.preventDefault(); setAdjuntoDragOver(false) }}
                          onDrop={onAdjuntoDrop}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center cursor-pointer transition-colors ${
                            adjuntoDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/40"
                          }`}
                        >
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Arrastra archivos aquí o <span className="text-primary underline underline-offset-2">selecciona</span>
                          </p>
                        </div>
                        {adjuntoFiles.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {adjuntoFiles.map((file, i) => (
                              <div key={i} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5">
                                <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile(file)}
                                  className="text-xs text-emerald-700 dark:text-emerald-400 truncate flex-1 text-left hover:underline underline-offset-2"
                                >
                                  {file.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeAdjuntoFile(i)}
                                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <Field label="Observaciones" className="col-span-1 sm:col-span-3">
                  <textarea
                    value={form.observaciones}
                    onChange={e => set("observaciones", e.target.value)}
                    placeholder="Observaciones generales del report..."
                    rows={2}
                    disabled={leftReadOnly}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
                  />
                </Field>
              </div>
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">1. Depósito de Contenedores</h2>
              <Sec1Content form={form} set={set as unknown as FormSetter} readOnly={leftReadOnly} toUpperCase hideActivation />
            </div>

            {numero !== null && (
              <ReportArchivosPanel reportId={id} numero={numero} initial={archivosAdjuntos} />
            )}
            </div>

            {/* Columna derecha: Sección 2 + Sección 3 */}
            <div className="flex-1 min-w-0 flex flex-col gap-y-3">

            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">2. Consolidado / Desconsolidado / Otros</h2>
              <Sec2Content form={form} set={set as unknown as FormSetter} readOnly={rightReadOnly} toUpperCase hideActivation />

              {(form.sec2_consolidado || form.sec2_desconsolidado) && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Evidencia fotográfica</label>

                  {existingEvidenciaPaths.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {existingEvidenciaPaths.map((path, i) => (
                        <EvidenciaExistenteLink key={path} path={path} index={i} />
                      ))}
                    </div>
                  )}

                  {!rightReadOnly && (
                    <>
                      <input
                        ref={sec2EvidenciaFileRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,application/pdf"
                        className="hidden"
                        onChange={e => { if (e.target.files) addSec2EvidenciaFiles(e.target.files); e.target.value = "" }}
                      />
                      <div
                        onClick={() => sec2EvidenciaFileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setSec2DragOver(true) }}
                        onDragLeave={e => { e.preventDefault(); setSec2DragOver(false) }}
                        onDrop={onSec2EvidenciaDrop}
                        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center cursor-pointer transition-colors ${
                          sec2DragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/40"
                        }`}
                      >
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Toma una foto o <span className="text-primary underline underline-offset-2">adjunta un archivo</span>
                        </p>
                      </div>
                      {sec2EvidenciaFiles.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {sec2EvidenciaFiles.map((file, i) => (
                            <div key={i} className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5">
                              <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                              <button
                                type="button"
                                onClick={() => setPreviewFile(file)}
                                className="text-xs text-emerald-700 dark:text-emerald-400 truncate flex-1 text-left hover:underline underline-offset-2"
                              >
                                {file.name}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSec2EvidenciaFile(i)}
                                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">3. Bodegaje</h2>
              <Sec3Content
                form={form}
                set={set as unknown as FormSetter}
                readOnly={rightReadOnly}
                toUpperCase
                hideActivation
                itemsNode={
                  <BodegajeItemsList
                    clienteId={form.cliente_id}
                    items={bodegajeItems}
                    onChange={changeBodegajeItem}
                    onAdd={addBodegajeItem}
                    onRemove={removeBodegajeItem}
                    tarifasCliente={tarifasCliente}
                    readOnly={rightReadOnly}
                  />
                }
                serviciosNode={
                  <ServiciosSection
                    clienteId={form.cliente_id}
                    selected={servicioSeleccion}
                    onToggle={toggleServicio}
                    onCantidadChange={cambiarCantidadServicio}
                    manual={serviciosManual}
                    onAddManual={agregarServicioManual}
                    onRemoveManual={quitarServicioManual}
                    readOnly={rightReadOnly}
                  />
                }
              />
              {/* Nombre operador de carga: un solo input, más abajo junto a
                  la Firma — acá no hace falta otro (quedaba duplicado). */}
            </div>
            </div>
          </div>

          {/* Servicios adicionales: ya no tiene sección propia — se registran
              directamente en Observaciones de Sección 2 y/o Sección 3, que ya
              existían. El módulo Servicios Adicionales lee esos campos. */}

          {/* Firma del conductor — tablet/lápiz óptico */}
          <div className="border-t mt-3 pt-3">
            <h2 className="text-[13px] font-bold text-foreground mb-1.5">Firma del conductor</h2>
            {firmaPath && !reFirmando ? (
              <div className="flex flex-col gap-1.5">
                <div className="rounded-lg border bg-white overflow-hidden h-[170px] flex items-center justify-center">
                  {firmaSignedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firmaSignedUrl} alt="Firma del conductor" className="max-w-full max-h-full object-contain" />
                  ) : firmaUrlError ? (
                    <button
                      type="button"
                      onClick={() => { setFirmaUrlError(false); setFirmaRetryKey(k => k + 1) }}
                      className="flex flex-col items-center gap-1 text-[11px] text-destructive hover:underline"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      No se pudo cargar — reintentar
                    </button>
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  )}
                </div>
                {!firmaBloqueada && (
                  <button
                    type="button"
                    onClick={() => { setReFirmando(true); setFirmaDataUrl(null) }}
                    className="self-end text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Volver a firmar
                  </button>
                )}
              </div>
            ) : (
              <FirmaCanvas onChange={setFirmaDataUrl} readOnly={firmaBloqueada} />
            )}
            {!firmaBloqueada && firmaDataUrl && (
              <div className="mt-1.5 flex items-center gap-2">
                <Button type="button" size="sm" onClick={firmarConductor} disabled={firmandoConductor} className="h-7 gap-1.5 text-[11px]">
                  {firmandoConductor ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePen className="h-3 w-3" />}
                  Confirmar firma
                </Button>
                <span className="text-[10.5px] text-muted-foreground">Si no la confirmas, se registra al guardar el report.</span>
              </div>
            )}
            {firmaError && <p className="mt-1 text-[11px] text-destructive">{firmaError}</p>}
            {firmaPath && firmaEvidencia.conductor && !reFirmando && (
              <p className="mt-1.5 text-[10.5px] text-muted-foreground leading-snug">
                Firmado electrónicamente por {firmaEvidencia.conductor.user_nombre} · {new Date(firmaEvidencia.conductor.at).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Cód. {firmaEvidencia.conductor.hash.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>

          {/* Firma electrónica del personal, según la etapa: el encargado de
              bodega firma mientras el report está en Operaciones; Recepción
              firma al confirmar el despacho (cola de despacho) — acá solo se
              muestra si ya firmó. */}
          {(estado === "pendiente_operaciones" || bodegaPath || recepcionPath) && (
            <div className="border-t mt-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(estado === "pendiente_operaciones" || bodegaPath) && (
                <FirmaStaffBlock
                  reportId={id}
                  rol="bodega"
                  titulo="Firma del encargado de bodega"
                  path={bodegaPath}
                  evidencia={firmaEvidencia.bodega}
                  bloqueada={estado !== "pendiente_operaciones"}
                  tieneFirmaPerfil={!!profile?.firma_url}
                  onSigned={res => { setBodegaPath(res.path); setFirmaEvidencia(res.evidencia) }}
                />
              )}
              {recepcionPath && (
                <FirmaStaffBlock
                  reportId={id}
                  rol="recepcion"
                  titulo="Firma de Recepción"
                  path={recepcionPath}
                  evidencia={firmaEvidencia.recepcion}
                  bloqueada
                  tieneFirmaPerfil={!!profile?.firma_url}
                  onSigned={res => { setRecepcionPath(res.path); setFirmaEvidencia(res.evidencia) }}
                />
              )}
            </div>
          )}

          {/* Nombre del operador, centrado */}
          <div className="border-t mt-3 pt-3 flex justify-center">
            <div className="w-full max-w-xs">
              <Field label="Nombre operador de carga" required className="text-center">
                <Input
                  value={form.nombre_operador}
                  onChange={e => set("nombre_operador", e.target.value.toUpperCase())}
                  className="h-8 text-xs text-center"
                  disabled={sharedReadOnly}
                />
              </Field>
            </div>
          </div>

          {/* Historial — colapsado, se carga al abrirlo */}
          <div className="border-t mt-3 pt-3">
            <button
              type="button"
              onClick={() => setHistorialOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2 text-[13px] font-bold text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-muted-foreground" /> Historial
              </span>
              {historialOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>

            {historialOpen && (
              <div className="space-y-4 mt-3">
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
                      <div className="border-t border-emerald-200 dark:border-emerald-800 bg-muted/40">
                        {!signedDocUrl ? (
                          <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
                            i === 0 && "border-primary/30 bg-primary/5"
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
          </div>
        </div>
      </div>
    </div>

    {/* Visor de evidencia fotográfica recién adjuntada (sin guardar aún) */}
    {previewFile && previewUrl && (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={() => setPreviewFile(null)}
      >
        <div
          className="bg-background rounded-xl border shadow-xl w-full max-w-3xl h-[85vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0">
            <span className="text-xs font-medium truncate">{previewFile.name}</span>
            <button type="button" onClick={() => setPreviewFile(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-center justify-center">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <iframe src={previewUrl} className="w-full h-full" title={previewFile.name} />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// Evidencia fotográfica ya guardada (bucket privado "reports-firmados") —
// resuelve una URL firmada y la muestra como link, igual que el documento
// firmado de más arriba en esta misma página.
function EvidenciaExistenteLink({ path, index, label = "Evidencia" }: { path: string; index: number; label?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    createClient().storage.from("reports-firmados").createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        // Antes, si esto fallaba, el link quedaba con cursor-wait para
        // siempre — indistinguible de "todavía está cargando".
        if (error) { console.error("[reports/id] error generando URL firmada:", error); setFailed(true); return }
        if (data) setUrl(data.signedUrl)
        else setFailed(true)
      })
    return () => { cancelled = true }
  }, [path, retryKey])
  return (
    <a
      href={failed ? "#" : url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      title={failed ? "No se pudo cargar el archivo — clic para reintentar" : undefined}
      onClick={failed ? (e) => { e.preventDefault(); setFailed(false); setUrl(null); setRetryKey(k => k + 1) } : undefined}
      className={cn(
        "flex items-center gap-2 bg-muted/40 border border-border/40 rounded-lg px-2.5 py-1.5 text-xs",
        url ? "hover:bg-muted/60 cursor-pointer" : failed ? "opacity-80 cursor-pointer hover:bg-muted/60 text-destructive" : "opacity-60 cursor-wait pointer-events-none"
      )}
    >
      <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="truncate flex-1">{label} {index + 1}{failed && " — no se pudo cargar, clic para reintentar"}</span>
    </a>
  )
}
