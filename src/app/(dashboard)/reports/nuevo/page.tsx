"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2, Paperclip, FileText, X, Camera } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import { syncPesoTon } from "@/lib/inventario"
import { validateUploadFile, sanitizeExt } from "@/lib/upload-validation"
import type { ReportFormData } from "@/components/reports/report-form-types"
import { Field, RadioGroup, Sec1Content, Sec2Content, Sec3Content, type FormSetter } from "@/components/reports/report-form-sections"
import { ClienteCombobox, ProductoCombobox } from "@/components/reports/report-form-widgets"

interface FormData extends ReportFormData {
  cliente_id:              string
  sec3_inventario_item_id: string
  tarifa_cliente_id:       string
}

const INITIAL: FormData = {
  cliente: "", cliente_id: "", tarifa_cliente_id: "", fecha: new Date().toISOString().split("T")[0], patente: "", conductor: "",
  rut_conductor: "", empresa_transporte: "", transporte_tipo: "externo", hds_header: false,
  sec1_activa: false, sec1_tipo_movimiento: "", sec1_tipo_contenedor: "", sec1_carga_normal: false,
  sec1_carga_imo: false, sec1_clase_imo: "", sec1_nu: "", sec1_hora_inicio: "", sec1_hora_termino: "",
  sec1_sigla: "", sec1_guia_numero: "", sec1_interchange: "", sec1_hds: false,
  sec2_activa: false, sec2_consolidado: false, sec2_desconsolidado: false, sec2_picking: false,
  sec2_paletizado: false, sec2_etiquetado: false, sec2_otro: false, sec2_hora_inicio: "",
  sec2_hora_termino: "", sec2_sigla_numero: "", sec2_observaciones: "",
  sec3_activa: false, sec3_inventario_item_id: "", sec3_producto: "", sec3_clase_imo: "",
  sec3_hora_inicio: "", sec3_hora_termino: "", sec3_numero_bodega: "", sec3_nu: "", sec3_tipo: "",
  sec3_numero_pallets: "", sec3_numero_unidades: "", sec3_numero_guia: "", sec3_solicitado_por: "", sec3_cuyd_detalle: "",
  sec3_lote: "", sec3_cas: "", sec3_orden_compra: "", sec3_fecha_elaboracion: "", sec3_fecha_vencimiento: "",
  sec3_observaciones: "", sec3_servicio_adicional: false,
  nombre_operador: "",
}

export default function NuevoReportPage() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [form,    setForm]    = useState<FormData>(INITIAL)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [hdsFiles,    setHdsFiles]    = useState<File[]>([])
  const [dragOver,    setDragOver]    = useState(false)
  const [previewFile, setPreviewFile] = useState<File | null>(null)
  const hdsFileRef = useRef<HTMLInputElement>(null)

  // Evidencia fotográfica de consolidado/desconsolidado — mismo patrón que
  // los archivos HDS (se suben recién después de crear el report, porque
  // el path del archivo usa el número/id ya asignado).
  const [sec2EvidenciaFiles, setSec2EvidenciaFiles] = useState<File[]>([])
  const [sec2DragOver,       setSec2DragOver]       = useState(false)
  const sec2EvidenciaFileRef = useRef<HTMLInputElement>(null)


  const previewUrl = useMemo(() => previewFile ? URL.createObjectURL(previewFile) : null, [previewFile])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function addHdsFiles(list: FileList | File[]) {
    setHdsFiles(prev => [...prev, ...Array.from(list)])
  }

  function removeHdsFile(index: number) {
    setHdsFiles(prev => prev.filter((_, i) => i !== index))
  }

  function onHdsDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) addHdsFiles(e.dataTransfer.files)
  }

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

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function setUpper(key: keyof FormData, value: string) {
    setForm(prev => ({ ...prev, [key]: value.toUpperCase() }))
  }

  function setRut(value: string) {
    const clean = value.replace(/[^0-9kK]/g, "").toUpperCase()
    if (clean.length <= 1) { set("rut_conductor", clean); return }
    const body     = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    const verifier = clean.slice(-1)
    set("rut_conductor", `${body}-${verifier}`)
  }

  // Sin el checkbox "Activar Sección", se infiere sola: activa si algún campo
  // propio de esa sección quedó con contenido.
  //
  // Antes esta página ingresaba el report como "borrador" y alguien tenía
  // que reabrirlo en reports/[id] y clickear "Enviar a Operaciones" a mano
  // para recién destrabar la columna de Operaciones — un paso intermedio
  // que no aportaba nada (Recepción ya completó todo lo que le corresponde
  // acá) y solo demoraba a Operaciones. Ahora al guardar queda directo en
  // "pendiente_operaciones".
  function buildPayload() {
    const estado = "pendiente_operaciones" as const
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
      estado,
      cliente:            form.cliente,
      tarifa_cliente_id:  form.tarifa_cliente_id || null,
      fecha:              form.fecha,
      patente:            form.patente,
      conductor:          form.conductor,
      rut_conductor:      form.rut_conductor   || null,
      empresa_transporte: form.transporte_tipo === "propio" ? null : (form.empresa_transporte || null),
      transporte_tipo:    form.transporte_tipo,
      hds_header:         form.hds_header,
      // Sección 1
      sec1_activa:          sec1Activa,
      sec1_tipo_movimiento: form.sec1_tipo_movimiento || null,
      sec1_tipo_contenedor: form.sec1_tipo_contenedor || null,
      sec1_carga_normal:    form.sec1_carga_normal,
      sec1_carga_imo:       form.sec1_carga_imo,
      sec1_clase_imo:       form.sec1_clase_imo   || null,
      sec1_nu:              form.sec1_nu           || null,
      sec1_hora_inicio:     form.sec1_hora_inicio  || null,
      sec1_hora_termino:    form.sec1_hora_termino || null,
      sec1_sigla:           form.sec1_sigla        || null,
      sec1_guia_numero:     form.sec1_guia_numero  || null,
      sec1_interchange:     form.sec1_interchange  || null,
      sec1_hds:             form.sec1_hds,
      // Sección 2
      sec2_activa:         sec2Activa,
      sec2_consolidado:    form.sec2_consolidado,
      sec2_desconsolidado: form.sec2_desconsolidado,
      sec2_picking:        form.sec2_picking,
      sec2_paletizado:     form.sec2_paletizado,
      sec2_etiquetado:     form.sec2_etiquetado,
      sec2_otro:           form.sec2_otro,
      sec2_hora_inicio:    form.sec2_hora_inicio   || null,
      sec2_hora_termino:   form.sec2_hora_termino  || null,
      sec2_sigla_numero:   form.sec2_sigla_numero  || null,
      sec2_observaciones:  form.sec2_observaciones || null,
      // Sección 3
      sec3_activa:              sec3Activa,
      sec3_inventario_item_id:  form.sec3_inventario_item_id || null,
      sec3_producto:            form.sec3_producto      || null,
      sec3_clase_imo:      form.sec3_clase_imo     || null,
      sec3_hora_inicio:    form.sec3_hora_inicio   || null,
      sec3_hora_termino:   form.sec3_hora_termino  || null,
      sec3_numero_bodega:  form.sec3_numero_bodega || null,
      sec3_nu:             form.sec3_nu            || null,
      sec3_tipo:           form.sec3_tipo          || null,
      sec3_numero_pallets: form.sec3_numero_pallets ? Number(form.sec3_numero_pallets) : null,
      sec3_numero_unidades: form.sec3_numero_unidades ? Number(form.sec3_numero_unidades) : null,
      sec3_numero_guia:    form.sec3_numero_guia   || null,
      sec3_solicitado_por: form.sec3_solicitado_por || null,
      sec3_cuyd_detalle:   form.sec3_cuyd_detalle  || null,
      sec3_lote:               form.sec3_lote              || null,
      sec3_cas:                form.sec3_cas               || null,
      sec3_orden_compra:       form.sec3_orden_compra      || null,
      sec3_fecha_elaboracion:  form.sec3_fecha_elaboracion || null,
      sec3_fecha_vencimiento:  form.sec3_fecha_vencimiento || null,
      sec3_observaciones:  form.sec3_observaciones || null,
      sec3_servicio_adicional: form.sec3_servicio_adicional,
      nombre_operador:     form.nombre_operador    || null,
      created_by:          user?.id ?? null,
      // Servicios asociados y firma del conductor se completan al reabrir el
      // report (son parte del trabajo del operador) — acá siempre van vacíos.
      servicios_ids:       [],
      servicios_manual:    [],
    }
  }

  async function handleSave() {
    if (!form.cliente || !form.patente || !form.conductor || !form.rut_conductor || !form.sec3_numero_guia) {
      setError("Cliente, patente, conductor, RUT conductor y N° Guía son obligatorios.")
      return
    }
    // La tarifa/contrato ahora la elige Operaciones (columna derecha, bloqueada
    // acá) — no bloquear el guardado de Recepción por no tenerla todavía.
    setError(null)
    setSaving(true)
    // try/finally envolviendo todo: antes, una excepción real (no un error
    // devuelto por Supabase, ej. un corte de red a mitad de los uploads)
    // dejaba "saving" en true para siempre — botón pegado sin mensaje ni
    // forma de reintentar salvo recargar la página.
    try {
    const supabase = createClient()

    const { data: inserted, error: err } = await supabase
      .from("reports").insert(buildPayload()).select("id, numero").single()

    if (err) {
      setError(err.message)
      return
    }

    // Subir los documentos HDS adjuntos, si el usuario seleccionó alguno.
    // No bloquea la creación del report en sí, pero si falla se detiene acá
    // (sin redirigir) para no perder el aviso — el report #inserted.numero ya
    // quedó guardado de todas formas.
    let hdsFailed = false
    if (form.hds_header && hdsFiles.length > 0) {
      if (hdsFiles.some(f => validateUploadFile(f))) hdsFailed = true
      const uploadedPaths: string[] = []
      for (let i = 0; i < hdsFiles.length && !hdsFailed; i++) {
        const file = hdsFiles[i]
        const ext  = sanitizeExt(file.name)
        const path = `hds-${inserted.numero}-${inserted.id}-${i}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("reports-firmados")
          .upload(path, file, { upsert: true })

        if (uploadErr) {
          console.error("[reports/nuevo] error subiendo documento HDS:", uploadErr)
          hdsFailed = true
        } else {
          uploadedPaths.push(path)
        }
      }

      if (uploadedPaths.length > 0) {
        const { error: hdsUpdateErr } = await supabase
          .from("reports")
          .update({ hds_archivos: uploadedPaths })
          .eq("id", inserted.id)
        if (hdsUpdateErr) {
          console.error("[reports/nuevo] error guardando referencia de los HDS:", hdsUpdateErr)
          hdsFailed = true
        }
      }

      if (hdsFailed) {
        setError(`Report #${inserted.numero} guardado, pero ${uploadedPaths.length < hdsFiles.length ? "algunos de los documentos HDS no se pudieron subir" : "no se pudo asociar los documentos HDS"}. Vuelve a la lista e ingresa al report para revisarlo.`)
      }
    }

    // Subir la evidencia fotográfica de consolidado/desconsolidado, si se
    // adjuntó alguna — mismo patrón de dos fases que los HDS.
    let evidenciaFailed = false
    if (sec2EvidenciaFiles.length > 0) {
      if (sec2EvidenciaFiles.some(f => validateUploadFile(f))) evidenciaFailed = true
      const uploadedPaths: string[] = []
      for (let i = 0; i < sec2EvidenciaFiles.length && !evidenciaFailed; i++) {
        const file = sec2EvidenciaFiles[i]
        const ext  = sanitizeExt(file.name, "jpg")
        const path = `sec2-evidencia-${inserted.numero}-${inserted.id}-${i}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("reports-firmados")
          .upload(path, file, { upsert: true })

        if (uploadErr) {
          console.error("[reports/nuevo] error subiendo evidencia fotográfica:", uploadErr)
          evidenciaFailed = true
        } else {
          uploadedPaths.push(path)
        }
      }

      if (uploadedPaths.length > 0) {
        const { error: evidenciaUpdateErr } = await supabase
          .from("reports")
          .update({ sec2_evidencia_archivos: uploadedPaths })
          .eq("id", inserted.id)
        if (evidenciaUpdateErr) {
          console.error("[reports/nuevo] error guardando referencia de la evidencia:", evidenciaUpdateErr)
          evidenciaFailed = true
        }
      }

      if (evidenciaFailed) {
        setError(`Report #${inserted.numero} guardado, pero ${uploadedPaths.length < sec2EvidenciaFiles.length ? "algunas fotos de evidencia no se pudieron subir" : "no se pudo asociar la evidencia fotográfica"}. Vuelve a la lista e ingresa al report para revisarlo.`)
      }
    }

    // La firma del conductor se captura al reabrir el report (es parte del
    // trabajo del operador) — nada que subir acá todavía.
    if (hdsFailed || evidenciaFailed) {
      return
    }

    // stock_actual solo lo mueve el trigger de BD reports_sync_inventario
    // cuando el report queda en estado 'despachado' — llamar update_stock acá
    // duplicaría el ajuste. syncPesoTon igual corre siempre que haya ítem
    // vinculado para no dejar peso_ton desactualizado. La Sección 3 (Bodegaje)
    // está bloqueada en esta página (la llena Operaciones más adelante), así
    // que la validación de pallets>0 corre recién al enviar a despacho desde
    // reports/[id], no acá.
    if (form.sec3_inventario_item_id) {
      await syncPesoTon(supabase, form.sec3_inventario_item_id)
    }

    // fire-and-forget
    logAudit({
      tabla:          "reports",
      registro_id:    inserted.id,
      accion:         "report.crear_borrador",
      descripcion:    `Report #${inserted.numero} — ${form.cliente} (${form.patente})`,
      usuario_id:     user?.id,
      usuario_nombre: profile?.nombre ?? user?.email,
    })

    router.push("/reports")
    } catch (err) {
      console.error("[reports/nuevo] error inesperado al guardar:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  return (
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
            <h1 className="text-base font-bold text-foreground">Nuevo Report de Servicio</h1>
            <p className="text-xs text-muted-foreground">Número se asignará automáticamente al guardar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && <p className="text-xs text-red-500 max-w-xs truncate">{error}</p>}
          <Button size="sm" className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/85 text-primary-foreground" disabled={saving} onClick={() => handleSave()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Ingreso Report
          </Button>
        </div>
      </div>

      {/* Form area — un solo formulario, sin scroll de página */}
      <div className="flex-1 min-h-0 overflow-hidden bg-muted/30 p-3">
        <div className="bg-card rounded-xl border h-full p-4 overflow-y-auto">
          <div className="flex flex-col lg:flex-row gap-x-6 gap-y-3">
            {/* Columna izquierda: Antecedentes + Sección 1 (independiente de la derecha, evita que un archivo HDS adjunto desplace la Sección 2/3) */}
            <div className="flex-1 min-w-0 flex flex-col gap-y-3">

            {/* Antecedentes */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">Antecedentes</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Cliente" required className="col-span-1 sm:col-span-3">
                  <ClienteCombobox
                    value={form.cliente}
                    onChange={v => set("cliente", v)}
                    onChangeId={id => {
                      setForm(prev => ({
                        ...prev,
                        cliente_id: id,
                        tarifa_cliente_id: "",
                        sec3_inventario_item_id: "",
                        sec3_producto: "",
                        sec3_clase_imo: "",
                        sec3_nu: "",
                      }))
                    }}
                  />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Patente camión" required>
                  <Input value={form.patente} onChange={e => setUpper("patente", e.target.value)} placeholder="XXXX-00" className="h-8 text-xs font-mono" />
                </Field>
                <Field label="Conductor" required>
                  <Input value={form.conductor} onChange={e => setUpper("conductor", e.target.value)} placeholder="Nombre completo" className="h-8 text-xs" />
                </Field>
                <Field label="RUT conductor" required>
                  <Input value={form.rut_conductor} onChange={e => setRut(e.target.value)} placeholder="12.345.678-9" className="h-8 text-xs font-mono" />
                </Field>
                <Field label="N° Guía" required>
                  <Input value={form.sec3_numero_guia} onChange={e => setUpper("sec3_numero_guia", e.target.value)} placeholder="Número de guía" className="h-8 text-xs" />
                </Field>
                <Field label="Solicitado por">
                  <select value={form.sec3_solicitado_por}
                    onChange={e => set("sec3_solicitado_por", e.target.value as FormData["sec3_solicitado_por"])}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
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
                        set("transporte_tipo", v)
                        if (v === "propio") set("empresa_transporte", "")
                      }}
                      options={[{ value: "propio", label: "Transporte ADP" }, { value: "externo", label: "Transporte Cliente" }]}
                    />
                  </div>
                </Field>
                {form.transporte_tipo === "externo" && (
                  <Field label="Empresa de transporte" className="col-span-1 sm:col-span-2">
                    <Input value={form.empresa_transporte} onChange={e => setUpper("empresa_transporte", e.target.value)} placeholder="Razón social" className="h-8 text-xs" />
                  </Field>
                )}
                <div className="col-span-1 sm:col-span-3 flex items-center gap-2">
                  <Checkbox
                    id="hds_header"
                    checked={form.hds_header}
                    onCheckedChange={v => {
                      const checked = v === true
                      set("hds_header", checked)
                      if (!checked) {
                        setHdsFiles([])
                        if (hdsFileRef.current) hdsFileRef.current.value = ""
                      }
                    }}
                    className="h-3.5 w-3.5"
                  />
                  <label htmlFor="hds_header" className="text-xs text-foreground/80 cursor-pointer">
                    HDS (Hoja de datos de seguridad presente)
                  </label>
                </div>
                {form.hds_header && (
                  <div className="col-span-1 sm:col-span-3 flex flex-col gap-1.5">
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
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
                      onDrop={onHdsDrop}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-3 text-center cursor-pointer transition-colors ${
                        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/40"
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
                  </div>
                )}
              </div>
            </div>

            {/* Sección 1 */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">1. Depósito de Contenedores</h2>
              <Sec1Content form={form} set={set as unknown as FormSetter} readOnly={false} toUpperCase hideActivation />
            </div>
            </div>

            {/* Columna derecha: Sección 2 + Sección 3 */}
            <div className="flex-1 min-w-0 flex flex-col gap-y-3">

            {/* Tarifa/Contrato ya no se pide acá: se deriva sola de la Clase IMO
                del producto que Operaciones elija en Bodegaje (ver Sec3 más abajo
                en reports/[id]) — en esta página ni siquiera hay producto que elegir. */}

            {/* Sección 2 — bloqueada al crear: la completa Operaciones después de que Recepción guarde */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                2. Consolidado / Desconsolidado / Otros
                <span className="text-[10px] font-normal text-muted-foreground">— la completa Operaciones</span>
              </h2>
              <Sec2Content form={form} set={set as unknown as FormSetter} readOnly toUpperCase hideActivation />

              {(form.sec2_consolidado || form.sec2_desconsolidado) && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Evidencia fotográfica</label>
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
                </div>
              )}
            </div>

            {/* Sección 3 — bloqueada al crear: la completa Operaciones después de que Recepción guarde */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                3. Bodegaje
                <span className="text-[10px] font-normal text-muted-foreground">— la completa Operaciones</span>
              </h2>
              <Sec3Content
                form={form}
                set={set as unknown as FormSetter}
                readOnly
                toUpperCase
                hideActivation
                productoNode={
                  <>
                    <ProductoCombobox
                      clienteId={form.cliente_id}
                      value={form.sec3_producto}
                      onChange={v => set("sec3_producto", v)}
                      onSelect={item => setForm(prev => ({
                        ...prev,
                        sec3_inventario_item_id: item.id,
                        sec3_producto:           item.descripcion,
                        sec3_clase_imo:          item.clase_imo ?? "",
                        sec3_nu:                 item.nu        ?? "",
                      }))}
                      onClear={() => setForm(prev => ({
                        ...prev,
                        sec3_inventario_item_id: "",
                        sec3_clase_imo:          "",
                        sec3_nu:                 "",
                      }))}
                      readOnly
                    />
                    {form.sec3_producto.trim() && !form.sec3_inventario_item_id && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        No vinculado al catálogo — este report no actualizará el stock.
                      </p>
                    )}
                  </>
                }
              />
            </div>
            </div>
          </div>
          {/* Servicios asociados, Firma del conductor y Nombre operador de
              carga no se muestran acá — son parte del trabajo del operador
              (Operaciones), se completan al reabrir el report ya ingresado. */}
        </div>
      </div>

      {/* Visor de archivos HDS */}
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
    </div>
  )
}
