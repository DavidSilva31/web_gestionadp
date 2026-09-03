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
import type { AuditLog } from "@/lib/audit"
import type { ReportEstado } from "@/types/database"
import { dbToForm } from "@/components/reports/report-form-types"
import type { ReportFormData } from "@/components/reports/report-form-types"
import { Field, RadioGroup, Sec1Content, Sec2Content, Sec3Content, type FormSetter } from "@/components/reports/report-form-sections"
import { EstadoSemaforo } from "@/components/reports/report-estado-semaforo"
import { ClienteCombobox, ProductoCombobox, FirmaCanvas, type InventarioItemOption, type ServicioSeleccionado, type TarifaOption } from "@/components/reports/report-form-widgets"
import { ReportPreviewModal } from "@/components/reports/report-preview-modal"
import { downloadReportPDF } from "@/lib/download-report-pdf"

interface FormData extends ReportFormData {
  cliente_id:              string
  sec3_inventario_item_id: string
  tarifa_cliente_id:       string
}

const ACCION_ICON: Record<string, React.ReactNode> = {
  "report.crear_borrador":     <FileText   className="h-4 w-4 text-gray-500"    />,
  "report.actualizar":         <FilePen    className="h-4 w-4 text-blue-500"    />,
  "report.enviar_operaciones": <Send       className="h-4 w-4 text-orange-500"  />,
  "report.enviar_despacho":    <FileCheck2 className="h-4 w-4 text-amber-500"   />,
  "report.confirmar_despacho": <Truck      className="h-4 w-4 text-emerald-600" />,
  "report.despachar":          <ScanLine   className="h-4 w-4 text-emerald-600" />,
  "report.eliminar":           <Trash2     className="h-4 w-4 text-red-500"     />,
}

// La Clase IMO de un ítem de inventario es un valor suelto ("2.2", "8"...),
// pero la de una tarifa/contrato agrupa varias en un solo texto libre ("Clases
// 2.1, 2.2, 2.3 y 3", "Clase 8"...) — tokeniza ese texto y compara contra el
// valor exacto del ítem en vez de un match literal de todo el string.
function tarifaCubreClase(tarifaClase: string | null, itemClase: string | null): boolean {
  if (!tarifaClase || !itemClase) return false
  const tokens = tarifaClase.replace(/clases?/gi, "").split(/,| y /i).map(t => t.trim()).filter(Boolean)
  return tokens.includes(itemClase.trim())
}

const ESTADO_STYLE: Record<ReportEstado, { label: string; className: string }> = {
  borrador:              { label: "Ingresado",         className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pendiente_operaciones: { label: "Pend. operaciones", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  pendiente_despacho:    { label: "Pend. despacho",    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  despachado:            { label: "Despachado",        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
}

export default function ReportDetailPage() {
  const router   = useRouter()
  const params   = useParams()
  const { user, profile } = useAuth()
  const id = params.id as string

  const [form,      setForm]     = useState<FormData | null>(null)
  const [estado,    setEstado]   = useState<ReportEstado>("borrador")
  // Tarifa/Contrato ya no se elige a mano — se deriva sola comparando la
  // Clase IMO del producto que Operaciones elige en Bodegaje contra la Clase
  // IMO de cada contrato del cliente (ver ProductoCombobox.onSelect abajo).
  const [tarifasCliente, setTarifasCliente] = useState<TarifaOption[]>([])
  // servicioSeleccion/serviciosManual ya no tienen UI propia (se sacó del
  // formulario) — se siguen cargando y reenviando tal cual en buildPayload
  // para no perder lo que un report viejo ya tenía guardado; el HES sigue
  // leyéndolos exactamente igual que antes.
  const [servicioSeleccion, setServicioSeleccion] = useState<ServicioSeleccionado[]>([])
  const [serviciosManual, setServiciosManual] = useState<string[]>([])
  const [numero,  setNumero]  = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  // Documentos HDS — mismo patrón de dos fases que la evidencia fotográfica.
  // Antes de este fix, reports/[id] no tenía ninguna forma de adjuntar o
  // reemplazar el HDS al editar (solo reports/nuevo lo permitía).
  const [existingHdsPaths, setExistingHdsPaths] = useState<string[]>([])
  const [hdsFiles,         setHdsFiles]         = useState<File[]>([])
  const [hdsDragOver,      setHdsDragOver]      = useState(false)
  const hdsFileRef = useRef<HTMLInputElement>(null)

  // Firma del conductor — firmaPath es lo que ya está guardado en BD (si el
  // report ya fue firmado antes); firmaDataUrl es una firma NUEVA dibujada
  // recién ahora, que se sube al guardar.
  const [firmaPath,      setFirmaPath]      = useState<string | null>(null)
  const [firmaSignedUrl, setFirmaSignedUrl] = useState<string | null>(null)
  const [firmaUrlError,  setFirmaUrlError]  = useState(false)
  const [firmaRetryKey,  setFirmaRetryKey]  = useState(0)
  const [firmaDataUrl,   setFirmaDataUrl]   = useState<string | null>(null)
  const [reFirmando,     setReFirmando]     = useState(false)

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
  function addHdsFiles(list: FileList | File[]) {
    setHdsFiles(prev => [...prev, ...Array.from(list)])
  }
  function removeHdsFile(index: number) {
    setHdsFiles(prev => prev.filter((_, i) => i !== index))
  }
  function onHdsDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setHdsDragOver(false)
    if (e.dataTransfer.files?.length) addHdsFiles(e.dataTransfer.files)
  }
  const [docExpanded,  setDocExpanded]  = useState(false)
  const [showPreview,   setShowPreview]   = useState(false)
  const [previewReport, setPreviewReport] = useState<import("@/types/database").Report | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // El formulario ya no se bloquea todo junto: Recepción llena Antecedentes +
  // Sección 1 mientras es "borrador"; al guardar pasa a "pendiente_operaciones"
  // y esa mitad se congela mientras se habilita la Sección 2 + 3 para que
  // Operaciones las complete. Servicios/Firma/Nombre operador quedan
  // editables en ambas mitades (recién se congelan al entrar a despacho).
  const leftReadOnly   = estado !== "borrador"
  const rightReadOnly  = estado !== "pendiente_operaciones"
  const sharedReadOnly = estado === "pendiente_despacho" || estado === "despachado"

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
      setNumero(data.numero)
      const base = dbToForm(data as Record<string, unknown>)
      setForm({
        ...base,
        cliente_id:              "",
        tarifa_cliente_id:       (data.tarifa_cliente_id as string | null) ?? "",
        sec3_inventario_item_id: (data.sec3_inventario_item_id as string | null) ?? "",
      })
      // servicios_ids es un uuid[] plano — un servicio usado 2 veces quedó
      // repetido 2 veces; se reconstruye la cantidad contando ocurrencias.
      const counts = new Map<string, number>()
      for (const sid of (data.servicios_ids as string[] | null) ?? []) counts.set(sid, (counts.get(sid) ?? 0) + 1)
      setServicioSeleccion([...counts.entries()].map(([sid, cantidad]) => ({ id: sid, cantidad })))
      setServiciosManual((data.servicios_manual as string[] | null) ?? [])
      if (data.documento_firmado_url) setDocPath(data.documento_firmado_url as string)
      setExistingEvidenciaPaths((data.sec2_evidencia_archivos as string[] | null) ?? [])
      setExistingHdsPaths((data.hds_archivos as string[] | null) ?? [])
      if (data.firma_conductor_url) setFirmaPath(data.firma_conductor_url as string)
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
      form.sec3_producto || form.sec3_clase_imo || form.sec3_nu || form.sec3_hora_inicio ||
      form.sec3_hora_termino || form.sec3_numero_bodega || form.sec3_tipo ||
      form.sec3_numero_pallets || form.sec3_numero_unidades ||
      form.sec3_lote || form.sec3_cas || form.sec3_orden_compra ||
      form.sec3_fecha_elaboracion || form.sec3_fecha_vencimiento || form.sec3_observaciones
    )

    return {
      estado:             newEstado,
      cliente:            form.cliente,
      tarifa_cliente_id:  form.tarifa_cliente_id || null,
      fecha:              form.fecha,
      patente:            form.patente,
      conductor:          form.conductor,
      rut_conductor:      form.rut_conductor      || null,
      empresa_transporte: form.transporte_tipo === "propio" ? null : (form.empresa_transporte || null),
      transporte_tipo:    form.transporte_tipo,
      hds_header:         form.hds_header,
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
      sec3_inventario_item_id:  form.sec3_inventario_item_id || null,
      sec3_producto:       form.sec3_producto       || null,
      sec3_clase_imo:      form.sec3_clase_imo      || null,
      sec3_hora_inicio:    form.sec3_hora_inicio    || null,
      sec3_hora_termino:   form.sec3_hora_termino   || null,
      sec3_numero_bodega:  form.sec3_numero_bodega  || null,
      sec3_nu:             form.sec3_nu             || null,
      sec3_tipo:           form.sec3_tipo           || null,
      sec3_numero_pallets: form.sec3_numero_pallets ? Number(form.sec3_numero_pallets) : null,
      sec3_numero_unidades: form.sec3_numero_unidades ? Number(form.sec3_numero_unidades) : null,
      sec3_numero_guia:    form.sec3_numero_guia    || null,
      sec3_solicitado_por: form.sec3_solicitado_por || null,
      sec3_cuyd_detalle:   form.sec3_cuyd_detalle   || null,
      sec3_lote:               form.sec3_lote              || null,
      sec3_cas:                form.sec3_cas               || null,
      sec3_orden_compra:       form.sec3_orden_compra      || null,
      sec3_fecha_elaboracion:  form.sec3_fecha_elaboracion || null,
      sec3_fecha_vencimiento:  form.sec3_fecha_vencimiento || null,
      sec3_observaciones:  form.sec3_observaciones  || null,
      sec3_servicio_adicional: form.sec3_servicio_adicional,
      nombre_operador:     form.nombre_operador     || null,
      servicios_ids:       servicioSeleccion.flatMap(s => Array(s.cantidad).fill(s.id)),
      servicios_manual:    serviciosManual,
      updated_at:          new Date().toISOString(),
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error: delErr } = await supabase.from("reports").delete().eq("id", id)
      if (delErr) {
        setError(`No se pudo eliminar: ${delErr.message}`)
        return
      }
      // El trigger reports_sync_inventario revierte el stock del ítem de sec3 al
      // borrar el report — sincronizar peso_ton para que no quede desactualizado.
      if (form?.sec3_activa && form.sec3_inventario_item_id) {
        await syncPesoTon(supabase, form.sec3_inventario_item_id)
      }
      logAudit({
        tabla:          "reports",
        registro_id:    id,
        accion:         "report.eliminar",
        descripcion:    `Report #${numero} — ${form?.cliente} (${form?.patente}) eliminado`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      router.push("/reports")
    } catch (err) {
      console.error("[reports/id] error inesperado al eliminar:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setDeleting(false)
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

    // Subir documentos HDS nuevos (si se adjuntó alguno) y sumarlos a los que
    // ya tenía el report — mismo patrón de dos fases que en reports/nuevo.
    let hdsFailed = hdsFiles.some(f => validateUploadFile(f))
    if (hdsFiles.length > 0) {
      const uploadedPaths: string[] = []
      for (let i = 0; i < hdsFiles.length && !hdsFailed; i++) {
        const file = hdsFiles[i]
        const ext  = sanitizeExt(file.name)
        const path = `hds-${numero}-${id}-${existingHdsPaths.length + i}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("reports-firmados")
          .upload(path, file, { upsert: true })
        if (uploadErr) {
          console.error("[reports/id] error subiendo documento HDS:", uploadErr)
          hdsFailed = true
        } else {
          uploadedPaths.push(path)
        }
      }
      if (uploadedPaths.length > 0) {
        const nuevosPaths = [...existingHdsPaths, ...uploadedPaths]
        const { error: hdsUpdateErr } = await supabase
          .from("reports")
          .update({ hds_archivos: nuevosPaths })
          .eq("id", id)
        if (hdsUpdateErr) {
          console.error("[reports/id] error guardando referencia de los HDS:", hdsUpdateErr)
          hdsFailed = true
        }
      }
      if (hdsFailed) {
        setError("No se pudo subir el documento HDS. Vuelve a intentarlo antes de guardar.")
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

    // Subir firma nueva del conductor, si se (re)firmó.
    if (firmaDataUrl) {
      const blob = await fetch(firmaDataUrl).then(r => r.blob())
      const path = `firma-${numero}-${id}.png`
      const { error: firmaUploadErr } = await supabase.storage
        .from("reports-firmados")
        .upload(path, blob, { upsert: true, contentType: "image/png" })
      if (firmaUploadErr) {
        console.error("[reports/id] error subiendo firma del conductor:", firmaUploadErr)
        setError("El report se guardó, pero no se pudo guardar la firma del conductor. Vuelve a firmar.")
        return
      }
      const { error: firmaUpdateErr } = await supabase.from("reports").update({ firma_conductor_url: path }).eq("id", id)
      if (firmaUpdateErr) {
        console.error("[reports/id] error guardando referencia de la firma:", firmaUpdateErr)
        setError("El report se guardó, pero no se pudo asociar la firma del conductor. Vuelve a firmar.")
        return
      }
    }

    // stock_actual solo lo mueve el trigger de BD reports_sync_inventario
    // cuando el report queda en estado 'despachado' — una edición mientras
    // sigue en borrador/pendiente_despacho no toca stock. syncPesoTon corre
    // igual siempre que haya ítem vinculado para no dejar peso_ton
    // desactualizado en ediciones que no cambian de estado.
    if (form.sec3_activa && form.sec3_inventario_item_id) {
      await syncPesoTon(supabase, form.sec3_inventario_item_id)
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

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </span>
            ¿Eliminar este report?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar el report <strong>#{numero}</strong> ({form?.cliente}). Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
            onClick={handleDelete}
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Eliminar
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
            disabled={saving || deleting || previewLoading}
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
        </div>
      </div>

      {(estado === "pendiente_despacho" || estado === "despachado") && (
        <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 dark:bg-amber-900/20 border-b text-xs text-amber-700 dark:text-amber-400 flex-shrink-0">
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          Este report está en modo lectura — solo se puede editar mientras Recepción u Operaciones lo están llenando.
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
                      setForm(prev => prev ? {
                        ...prev,
                        cliente_id: cid,
                        tarifa_cliente_id: "",
                        sec3_inventario_item_id: "",
                        sec3_producto: "",
                        sec3_clase_imo: "",
                        sec3_nu: "",
                      } : prev)
                      setServicioSeleccion([])
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
                {form.transporte_tipo === "externo" && (
                  <Field label="Empresa de transporte" className="col-span-1 sm:col-span-2">
                    <Input value={form.empresa_transporte} onChange={e => set("empresa_transporte", e.target.value.toUpperCase())} placeholder="Razón social" className="h-8 text-xs" disabled={leftReadOnly} />
                  </Field>
                )}
                <div className="col-span-1 sm:col-span-3 flex items-center gap-2">
                  <Checkbox id="hds_header" checked={form.hds_header} onCheckedChange={v => !leftReadOnly && set("hds_header", v === true)} className="h-3.5 w-3.5" disabled={leftReadOnly} />
                  <label htmlFor="hds_header" className="text-xs text-foreground/80 cursor-pointer">HDS (Hoja de datos de seguridad presente)</label>
                </div>
                {form.hds_header && (
                  <div className="col-span-1 sm:col-span-3 flex flex-col gap-1.5">
                    {existingHdsPaths.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {existingHdsPaths.map((path, i) => (
                          <EvidenciaExistenteLink key={path} path={path} index={i} label="HDS" />
                        ))}
                      </div>
                    )}

                    {!leftReadOnly && (
                      <>
                        <input
                          ref={hdsFileRef}
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                          className="hidden"
                          onChange={e => { if (e.target.files) addHdsFiles(e.target.files); e.target.value = "" }}
                        />
                        <div
                          onClick={() => hdsFileRef.current?.click()}
                          onDragOver={e => { e.preventDefault(); setHdsDragOver(true) }}
                          onDragLeave={e => { e.preventDefault(); setHdsDragOver(false) }}
                          onDrop={onHdsDrop}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center cursor-pointer transition-colors ${
                            hdsDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/40"
                          }`}
                        >
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Arrastra archivos aquí o <span className="text-primary underline underline-offset-2">selecciona</span>
                          </p>
                        </div>
                        {hdsFiles.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {hdsFiles.map((file, i) => (
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
                                  onClick={() => removeHdsFile(i)}
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
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">1. Depósito de Contenedores</h2>
              <Sec1Content form={form} set={set as unknown as FormSetter} readOnly={leftReadOnly} toUpperCase hideActivation />
            </div>
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
                productoNode={
                  <>
                    <ProductoCombobox
                      clienteId={form.cliente_id}
                      value={form.sec3_producto}
                      onChange={v => set("sec3_producto", v)}
                      onSelect={(item: InventarioItemOption) => setForm(prev => prev ? ({
                        ...prev,
                        sec3_inventario_item_id: item.id,
                        sec3_producto:           item.descripcion,
                        sec3_clase_imo:          item.clase_imo ?? "",
                        sec3_nu:                 item.nu        ?? "",
                        // Tarifa/contrato ya no se elige a mano — se deriva sola
                        // comparando la Clase IMO del producto contra la de cada
                        // contrato del cliente (mismo valor, dos tablas distintas).
                        tarifa_cliente_id: tarifasCliente.find(t => tarifaCubreClase(t.clase_imo, item.clase_imo))?.id ?? "",
                      }) : prev)}
                      onClear={() => setForm(prev => prev ? ({
                        ...prev,
                        sec3_inventario_item_id: "",
                        sec3_clase_imo:          "",
                        sec3_nu:                 "",
                        tarifa_cliente_id:       "",
                      }) : prev)}
                      readOnly={rightReadOnly}
                    />
                    {form.sec3_producto.trim() && !form.sec3_inventario_item_id && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        No vinculado al catálogo — este report no actualizará el stock.
                      </p>
                    )}
                    {form.sec3_inventario_item_id && tarifasCliente.length > 1 && !form.tarifa_cliente_id && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        Ningún contrato de este cliente coincide con la Clase IMO &quot;{form.sec3_clase_imo || "—"}&quot; — revisa antes de enviar a despacho.
                      </p>
                    )}
                  </>
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
                {!sharedReadOnly && (
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
              <FirmaCanvas onChange={setFirmaDataUrl} readOnly={sharedReadOnly} />
            )}
          </div>

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
