"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Send, ChevronRight, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import type { ReportFormData } from "@/components/reports/report-form-types"
import { Field, Sec1Content, Sec2Content, Sec3Content, type FormSetter } from "@/components/reports/report-form-sections"

interface FormData extends ReportFormData {
  cliente_id:              string
  sec3_inventario_item_id: string
}

const INITIAL: FormData = {
  cliente: "", cliente_id: "", fecha: new Date().toISOString().split("T")[0], patente: "", conductor: "",
  rut_conductor: "", empresa_transporte: "", hds_header: false,
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

type Tab = "antecedentes" | "sec1" | "sec2" | "sec3"

const TABS: { key: Tab; label: string; subtitle: string }[] = [
  { key: "antecedentes", label: "Antecedentes",           subtitle: "Datos del vehículo y conductor"         },
  { key: "sec1",         label: "Sección 1",              subtitle: "Depósito de contenedores"               },
  { key: "sec2",         label: "Sección 2",              subtitle: "Consolidado / Desconsolidado / Otros"   },
  { key: "sec3",         label: "Sección 3",              subtitle: "Bodegaje"                               },
]

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
  const [tab,     setTab]     = useState<Tab>("antecedentes")
  const [form,    setForm]    = useState<FormData>(INITIAL)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

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

  const tabIndex = TABS.findIndex(t => t.key === tab)

  function nextTab() {
    if (tabIndex < TABS.length - 1) setTab(TABS[tabIndex + 1].key)
  }

  const currentTabInfo = TABS[tabIndex]

  function buildPayload(estado: "borrador" | "pendiente_despacho") {
    return {
      estado,
      cliente:            form.cliente,
      fecha:              form.fecha,
      patente:            form.patente,
      conductor:          form.conductor,
      rut_conductor:      form.rut_conductor   || null,
      empresa_transporte: form.empresa_transporte || null,
      hds_header:         form.hds_header,
      // Sección 1
      sec1_activa:          form.sec1_activa,
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
      sec2_activa:         form.sec2_activa,
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
      sec3_activa:              form.sec3_activa,
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
      setTab("antecedentes")
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

    // Actualizar stock solo al enviar a despacho, con ítem y tipo definidos
    if (
      estado === "pendiente_despacho" &&
      form.sec3_activa &&
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
          <Button size="sm" className="gap-1.5 h-8 text-xs bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white" disabled={saving || !form.nombre_operador.trim()} onClick={() => handleSave("pendiente_despacho")}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar a despacho
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-end gap-0 px-6 pt-3 border-b bg-muted/30 flex-shrink-0 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
              tab === t.key
                ? "border-primary text-primary bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background/60"
            )}
          >
            <span className={cn(
              "h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0",
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {i + 1}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Form area */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="bg-card rounded-xl border p-5">
            <div className="mb-4 pb-3 border-b">
              <h2 className="text-sm font-bold text-foreground">{currentTabInfo.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{currentTabInfo.subtitle}</p>
            </div>

            {tab === "antecedentes" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Cliente" required className="col-span-2">
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
                <Field label="Empresa de transporte" className="col-span-2">
                  <Input value={form.empresa_transporte} onChange={e => setUpper("empresa_transporte", e.target.value)} placeholder="Razón social" className="h-8 text-xs" />
                </Field>
                <div className="col-span-2 flex items-center gap-2 pt-1">
                  <Checkbox
                    id="hds_header"
                    checked={form.hds_header}
                    onCheckedChange={v => set("hds_header", v === true)}
                    className="h-3.5 w-3.5"
                  />
                  <label htmlFor="hds_header" className="text-xs text-foreground/80 cursor-pointer">
                    HDS (Hoja de datos de seguridad presente)
                  </label>
                </div>
              </div>
            )}

            {tab === "sec1" && (
              <Sec1Content form={form} set={set as unknown as FormSetter} readOnly={false} toUpperCase />
            )}

            {tab === "sec2" && (
              <Sec2Content form={form} set={set as unknown as FormSetter} readOnly={false} toUpperCase />
            )}

            {tab === "sec3" && (
              <Sec3Content
                form={form}
                set={set as unknown as FormSetter}
                readOnly={false}
                toUpperCase
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
            )}
          </div>

          {/* Navigation footer */}
          <div className="flex items-center justify-between mt-4">
            {tabIndex > 0 ? (
              <button
                onClick={() => setTab(TABS[tabIndex - 1].key)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                ← Anterior
              </button>
            ) : (
              <div className="w-16" />
            )}
            <div className="flex gap-1.5">
              {TABS.map((t, i) => (
                <div key={t.key} className={cn("h-1.5 rounded-full transition-all", tab === t.key ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
              ))}
            </div>
            {tabIndex < TABS.length - 1 ? (
              <button onClick={nextTab} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
                Siguiente <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="w-16" />
            )}
          </div>
          {/* Operador de carga — flotante, siempre visible */}
          <div className="mt-4 bg-card rounded-xl border shadow-md px-5 py-4 flex items-center gap-4">
            <div className="flex-shrink-0">
              <p className="text-xs font-semibold text-foreground">Operador de carga <span className="text-red-500">*</span></p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Requerido para enviar a despacho</p>
            </div>
            <div className="flex-1 max-w-sm">
              <Input
                value={form.nombre_operador}
                onChange={e => setUpper("nombre_operador", e.target.value)}
                placeholder="Nombre completo del operador"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
