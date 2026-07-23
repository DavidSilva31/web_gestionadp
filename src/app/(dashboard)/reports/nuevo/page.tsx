"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Send, Loader2, Paperclip, FileText, X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import type { ReportFormData } from "@/components/reports/report-form-types"
import { Field, RadioGroup, Sec1Content, Sec2Content, Sec3Content, type FormSetter } from "@/components/reports/report-form-sections"

interface FormData extends ReportFormData {
  cliente_id:              string
  sec3_inventario_item_id: string
}

const INITIAL: FormData = {
  cliente: "", cliente_id: "", fecha: new Date().toISOString().split("T")[0], patente: "", conductor: "",
  rut_conductor: "", empresa_transporte: "", transporte_tipo: "externo", hds_header: false,
  sec1_activa: false, sec1_tipo_movimiento: "", sec1_tipo_contenedor: "", sec1_carga_normal: false,
  sec1_carga_imo: false, sec1_clase_imo: "", sec1_nu: "", sec1_hora_inicio: "", sec1_hora_termino: "",
  sec1_sigla: "", sec1_guia_numero: "", sec1_interchange: "", sec1_hds: false,
  sec2_activa: false, sec2_consolidado: false, sec2_desconsolidado: false, sec2_picking: false,
  sec2_paletizado: false, sec2_etiquetado: false, sec2_otro: false, sec2_hora_inicio: "",
  sec2_hora_termino: "", sec2_sigla_numero: "", sec2_observaciones: "",
  sec3_activa: false, sec3_inventario_item_id: "", sec3_producto: "", sec3_clase_imo: "",
  sec3_hora_inicio: "", sec3_hora_termino: "", sec3_numero_bodega: "", sec3_nu: "", sec3_tipo: "",
  sec3_numero_pallets: "", sec3_numero_guia: "", sec3_solicitado_por: "", sec3_cuyd_detalle: "",
  sec3_observaciones: "",
  nombre_operador: "",
}

interface ClienteOption { id: string; nombre: string; rut: string }

function ClienteCombobox({ value, onChange, onChangeId }: {
  value: string
  onChange: (nombre: string) => void
  onChangeId: (id: string) => void
}) {
  const [clientes, setClientes] = useState<ClienteOption[]>([])
  const [open,     setOpen]     = useState(false)
  const [query,    setQuery]    = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient()
      .from("clientes")
      .select("id, nombre, rut")
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .then(({ data }) => { if (data) setClientes(data as ClienteOption[]) })
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = query
    ? clientes.filter(c =>
        c.nombre.toLowerCase().includes(query.toLowerCase()) ||
        c.rut.toLowerCase().includes(query.toLowerCase())
      )
    : clientes

  function select(c: ClienteOption) {
    setQuery(c.nombre)
    onChange(c.nombre)
    onChangeId(c.id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { const v = e.target.value.toUpperCase(); setQuery(v); onChange(v); onChangeId(""); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Seleccionar o escribir cliente"
        className="h-8 text-xs"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(c)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted text-left transition-colors"
            >
              <span className="font-medium text-foreground truncate">{c.nombre}</span>
              <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">{c.rut}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface InventarioItemOption { id: string; descripcion: string; clase_imo: string | null; nu: string | null }

function ProductoCombobox({ clienteId, value, onChange, onSelect }: {
  clienteId: string
  value: string
  onChange: (v: string) => void
  onSelect: (item: InventarioItemOption) => void
}) {
  const [items,  setItems]  = useState<InventarioItemOption[]>([])
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setItems([])
    if (!clienteId) return
    createClient()
      .from("inventario_items")
      .select("id, descripcion, clase_imo, nu")
      .eq("cliente_id", clienteId)
      .eq("activo", true)
      .order("descripcion", { ascending: true })
      .then(({ data }) => { if (data) setItems(data as InventarioItemOption[]) })
  }, [clienteId])

  // Sincronizar query si el valor externo cambia (ej: al limpiar)
  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const filtered = query
    ? items.filter(i => i.descripcion.toLowerCase().includes(query.toLowerCase()))
    : items

  function select(item: InventarioItemOption) {
    setQuery(item.descripcion)
    onChange(item.descripcion)
    onSelect(item)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value.toUpperCase()); onChange(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={clienteId ? "Buscar producto en inventario..." : "Selecciona un cliente primero"}
        className="h-8 text-xs"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => select(item)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted text-left transition-colors"
            >
              <span className="font-medium text-foreground truncate">{item.descripcion}</span>
              {item.clase_imo && (
                <span className="text-[10px] font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">
                  Cl. {item.clase_imo}{item.nu ? ` · UN ${item.nu}` : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && clienteId && filtered.length === 0 && query.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-sm px-3 py-2 text-xs text-muted-foreground">
          Sin coincidencias — se usará el texto ingresado
        </div>
      )}
    </div>
  )
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
  function buildPayload(estado: "borrador" | "pendiente_despacho") {
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
    const sec3Activa = !!(
      form.sec3_producto || form.sec3_clase_imo || form.sec3_nu || form.sec3_hora_inicio ||
      form.sec3_hora_termino || form.sec3_numero_bodega || form.sec3_numero_guia || form.sec3_tipo ||
      form.sec3_numero_pallets || form.sec3_solicitado_por || form.sec3_cuyd_detalle || form.sec3_observaciones
    )

    return {
      estado,
      cliente:            form.cliente,
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
      sec3_numero_guia:    form.sec3_numero_guia   || null,
      sec3_solicitado_por: form.sec3_solicitado_por || null,
      sec3_cuyd_detalle:   form.sec3_cuyd_detalle  || null,
      sec3_observaciones:  form.sec3_observaciones || null,
      nombre_operador:     form.nombre_operador    || null,
      created_by:          user?.id ?? null,
    }
  }

  async function handleSave(estado: "borrador" | "pendiente_despacho") {
    if (!form.cliente || !form.patente || !form.conductor) {
      setError("Cliente, patente y conductor son obligatorios.")
      return
    }
    setError(null)
    setSaving(true)
    const supabase = createClient()

    const { data: inserted, error: err } = await supabase
      .from("reports").insert(buildPayload(estado)).select("id, numero").single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    // Subir los documentos HDS adjuntos, si el usuario seleccionó alguno.
    // No bloquea la creación del report en sí, pero si falla se detiene acá
    // (sin redirigir) para no perder el aviso — el report #inserted.numero ya
    // quedó guardado de todas formas.
    let hdsFailed = false
    if (form.hds_header && hdsFiles.length > 0) {
      const uploadedPaths: string[] = []
      for (let i = 0; i < hdsFiles.length; i++) {
        const file = hdsFiles[i]
        const ext  = file.name.split(".").pop() ?? "pdf"
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

    if (hdsFailed) {
      setSaving(false)
      return
    }

    // Actualizar stock solo al enviar a despacho, con ítem y tipo definidos
    // (si ambos están presentes, Sección 3 quedó activa igual en buildPayload)
    if (
      estado === "pendiente_despacho" &&
      form.sec3_inventario_item_id &&
      form.sec3_tipo
    ) {
      const delta = Number(form.sec3_numero_pallets)
      if (!delta || delta <= 0) {
        await supabase.from("reports").delete().eq("id", inserted.id)
        setError("Número de pallets debe ser mayor a 0. El report no fue guardado.")
        setSaving(false)
        return
      }
      const signedDelta = form.sec3_tipo === "ingreso" ? delta : -delta

      const { error: rpcErr } = await supabase.rpc("update_stock", {
        item_id: form.sec3_inventario_item_id,
        delta:   signedDelta,
      })
      if (rpcErr) {
        await supabase.from("reports").delete().eq("id", inserted.id)
        setError("Error al actualizar stock. El report no fue guardado.")
        setSaving(false)
        return
      }

      const invAccion = form.sec3_tipo === "ingreso" ? "inventario.ingreso" : "inventario.despacho"
      const invDesc   = `Stock ${form.sec3_tipo === "ingreso" ? "+" : "-"}${delta} · ${form.sec3_producto}`

      // fire-and-forget — audit failures no bloquean el flujo
      logAudit({
        tabla:          "inventario_items",
        registro_id:    form.sec3_inventario_item_id,
        accion:         invAccion,
        descripcion:    `${invDesc} via Report #${inserted.numero}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      logAudit({
        tabla:          "reports",
        registro_id:    inserted.id,
        accion:         invAccion,
        descripcion:    invDesc,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
    }

    // fire-and-forget
    logAudit({
      tabla:          "reports",
      registro_id:    inserted.id,
      accion:         estado === "borrador" ? "report.crear_borrador" : "report.enviar_despacho",
      descripcion:    `Report #${inserted.numero} — ${form.cliente} (${form.patente})`,
      usuario_id:     user?.id,
      usuario_nombre: profile?.nombre ?? user?.email,
    })

    setSaving(false)
    router.push("/reports")
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
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" disabled={saving} onClick={() => handleSave("borrador")}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar borrador
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs bg-primary hover:bg-primary/85 text-primary-foreground" disabled={saving || !form.nombre_operador.trim()} onClick={() => handleSave("pendiente_despacho")}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar a despacho
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
                    onChangeId={id => setForm(prev => ({
                      ...prev,
                      cliente_id: id,
                      sec3_inventario_item_id: "",
                      sec3_producto: "",
                      sec3_clase_imo: "",
                      sec3_nu: "",
                    }))}
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
                <Field label="RUT conductor">
                  <Input value={form.rut_conductor} onChange={e => setRut(e.target.value)} placeholder="12.345.678-9" className="h-8 text-xs font-mono" />
                </Field>
                <Field label="Transporte" className="col-span-1 sm:col-span-2">
                  <div className="h-8 flex items-center">
                    <RadioGroup
                      value={form.transporte_tipo}
                      onChange={v => {
                        set("transporte_tipo", v)
                        if (v === "propio") set("empresa_transporte", "")
                      }}
                      options={[{ value: "propio", label: "Propio" }, { value: "externo", label: "Externo" }]}
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

            {/* Sección 2 */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">2. Consolidado / Desconsolidado / Otros</h2>
              <Sec2Content form={form} set={set as unknown as FormSetter} readOnly={false} toUpperCase hideActivation />
            </div>

            {/* Sección 3 + Operador de carga */}
            <div>
              <h2 className="text-[13px] font-bold text-foreground mb-1.5">3. Bodegaje</h2>
              <Sec3Content
                form={form}
                set={set as unknown as FormSetter}
                readOnly={false}
                toUpperCase
                hideActivation
                productoNode={
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
                  />
                }
              />
            </div>
            </div>
          </div>

          {/* Cierre del report — nombre del operador, centrado */}
          <div className="border-t mt-3 pt-3 flex justify-center">
            <div className="w-full max-w-xs">
              <Field label="Nombre operador de carga" required className="text-center">
                <Input
                  value={form.nombre_operador}
                  onChange={e => setUpper("nombre_operador", e.target.value)}
                  className="h-8 text-xs text-center"
                />
              </Field>
            </div>
          </div>
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
