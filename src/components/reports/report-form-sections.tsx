"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { cn }       from "@/lib/utils"
import type { ReportFormData, TipoMovimiento, TipoContenedor, SolicitadoPor } from "./report-form-types"

// ── Setter type ────────────────────────────────────────────────────────────────

export type FormSetter = <K extends keyof ReportFormData>(key: K, value: ReportFormData[K]) => void

// ── Field ──────────────────────────────────────────────────────────────────────

export function Field({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  )
}

// ── RadioGroup ─────────────────────────────────────────────────────────────────

export function RadioGroup<T extends string>({ value, onChange, options, vertical, readOnly }: {
  value: T | ""
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  vertical?: boolean
  readOnly?: boolean
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
            value === opt.value
              ? "border-[oklch(0.35_0.12_240)] bg-[oklch(0.35_0.12_240)]"
              : "border-gray-300",
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

// ── Sec1Content ────────────────────────────────────────────────────────────────

export function Sec1Content({ form, set, readOnly, toUpperCase: uc }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox id="sec1_activa" checked={form.sec1_activa}
          onCheckedChange={v => !readOnly && set("sec1_activa", v === true)}
          className="h-3.5 w-3.5" disabled={readOnly} />
        <label htmlFor="sec1_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">
          Activar Sección 1 — Depósito de Contenedores
        </label>
      </div>

      <div className={cn("space-y-4 transition-opacity", !form.sec1_activa && "opacity-40 pointer-events-none")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Tipo de movimiento">
            <RadioGroup<TipoMovimiento>
              value={form.sec1_tipo_movimiento}
              onChange={v => set("sec1_tipo_movimiento", v)}
              options={[{ value: "ingreso", label: "Ingreso" }, { value: "despacho", label: "Despacho" }]}
              readOnly={readOnly}
            />
          </Field>
          <Field label="Tipo de contenedor">
            <RadioGroup<TipoContenedor>
              value={form.sec1_tipo_contenedor}
              onChange={v => set("sec1_tipo_contenedor", v)}
              options={[{ value: "20ft", label: "20ft" }, { value: "40ft", label: "40ft" }, { value: "isotanque", label: "Isotanque" }]}
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="sec1_carga_normal" checked={form.sec1_carga_normal}
              onCheckedChange={v => !readOnly && set("sec1_carga_normal", v === true)}
              className="h-3.5 w-3.5" disabled={readOnly} />
            <label htmlFor="sec1_carga_normal" className="text-xs text-gray-700 cursor-pointer">Carga normal</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sec1_carga_imo" checked={form.sec1_carga_imo}
              onCheckedChange={v => !readOnly && set("sec1_carga_imo", v === true)}
              className="h-3.5 w-3.5" disabled={readOnly} />
            <label htmlFor="sec1_carga_imo" className="text-xs text-gray-700 cursor-pointer">Carga IMO</label>
          </div>
        </div>

        {form.sec1_carga_imo && (
          <div className="grid grid-cols-2 gap-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <Field label="Clase IMO">
              <Input value={form.sec1_clase_imo} onChange={str("sec1_clase_imo")}
                placeholder="Ej: 3, 6.1, 8..." className="h-8 text-xs" readOnly={readOnly} />
            </Field>
            <Field label="NU">
              <Input value={form.sec1_nu} onChange={str("sec1_nu")}
                className="h-8 text-xs font-mono" readOnly={readOnly} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Hora inicio">
            <Input type="time" value={form.sec1_hora_inicio}
              onChange={e => set("sec1_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Hora término">
            <Input type="time" value={form.sec1_hora_termino}
              onChange={e => set("sec1_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Sigla">
            <Input value={form.sec1_sigla} onChange={str("sec1_sigla")}
              placeholder="Sigla del contenedor" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="N° Guía">
            <Input value={form.sec1_guia_numero} onChange={str("sec1_guia_numero")}
              placeholder="Número de guía" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Interchange">
            <Input value={form.sec1_interchange} onChange={str("sec1_interchange")}
              placeholder="N° Interchange" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="sec1_hds" checked={form.sec1_hds}
            onCheckedChange={v => !readOnly && set("sec1_hds", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec1_hds" className="text-xs text-gray-700 cursor-pointer">HDS adjunto</label>
        </div>
      </div>
    </div>
  )
}

// ── Sec2Content ────────────────────────────────────────────────────────────────

export function Sec2Content({ form, set, readOnly, toUpperCase: uc }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  const checkboxFields: [keyof ReportFormData, string][] = [
    ["sec2_consolidado",    "Consolidado"],
    ["sec2_desconsolidado", "Desconsolidado"],
    ["sec2_picking",        "Picking"],
    ["sec2_paletizado",     "Paletizado"],
    ["sec2_etiquetado",     "Etiquetado"],
    ["sec2_otro",           "Otro"],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox id="sec2_activa" checked={form.sec2_activa}
          onCheckedChange={v => !readOnly && set("sec2_activa", v === true)}
          className="h-3.5 w-3.5" disabled={readOnly} />
        <label htmlFor="sec2_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">
          Activar Sección 2 — Consolidado / Desconsolidado / Otros
        </label>
      </div>

      <div className={cn("space-y-4 transition-opacity", !form.sec2_activa && "opacity-40 pointer-events-none")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
          {checkboxFields.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox id={key} checked={form[key] as boolean}
                onCheckedChange={v => !readOnly && set(key, v === true as ReportFormData[typeof key])}
                className="h-3.5 w-3.5" disabled={readOnly} />
              <label htmlFor={key} className="text-xs text-gray-700 cursor-pointer">{label}</label>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Hora inicio">
            <Input type="time" value={form.sec2_hora_inicio}
              onChange={e => set("sec2_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Hora término">
            <Input type="time" value={form.sec2_hora_termino}
              onChange={e => set("sec2_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Sigla / N°" className="col-span-2">
            <Input value={form.sec2_sigla_numero} onChange={str("sec2_sigla_numero")}
              placeholder="Sigla o número" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Observaciones" className="col-span-2">
            <textarea value={form.sec2_observaciones} onChange={str("sec2_observaciones")}
              placeholder="Observaciones adicionales..." rows={3} readOnly={readOnly}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ── Sec3Content ────────────────────────────────────────────────────────────────

export function Sec3Content({ form, set, readOnly, toUpperCase: uc, productoNode, operadorNode }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
  productoNode: React.ReactNode
  operadorNode?: React.ReactNode
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Checkbox id="sec3_activa" checked={form.sec3_activa}
          onCheckedChange={v => !readOnly && set("sec3_activa", v === true)}
          className="h-3.5 w-3.5" disabled={readOnly} />
        <label htmlFor="sec3_activa" className="text-xs font-semibold text-gray-800 cursor-pointer">
          Activar Sección 3 — Bodegaje
        </label>
      </div>

      <div className={cn("space-y-4 transition-opacity", !form.sec3_activa && "opacity-40 pointer-events-none")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Producto" className="col-span-2">
            {productoNode}
          </Field>
          <Field label="Clase IMO">
            <Input value={form.sec3_clase_imo} onChange={str("sec3_clase_imo")}
              placeholder="Clase IMO si aplica" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="NU">
            <Input value={form.sec3_nu} onChange={str("sec3_nu")}
              className="h-8 text-xs font-mono" readOnly={readOnly} />
          </Field>
          <Field label="Hora inicio">
            <Input type="time" value={form.sec3_hora_inicio}
              onChange={e => set("sec3_hora_inicio", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="Hora término">
            <Input type="time" value={form.sec3_hora_termino}
              onChange={e => set("sec3_hora_termino", e.target.value)} className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="N° Bodega">
            <Input value={form.sec3_numero_bodega} onChange={str("sec3_numero_bodega")}
              placeholder="Número de bodega" className="h-8 text-xs" readOnly={readOnly} />
          </Field>
          <Field label="N° Guía" className="col-span-2">
            <Input value={form.sec3_numero_guia} onChange={str("sec3_numero_guia")}
              placeholder="Número de guía" className="h-8 text-xs" readOnly={readOnly} />
          </Field>

          <div className="col-span-2 flex flex-wrap items-start gap-6 sm:gap-8 pt-1">
            <Field label="Tipo de movimiento">
              <RadioGroup<TipoMovimiento>
                value={form.sec3_tipo}
                onChange={v => set("sec3_tipo", v)}
                options={[{ value: "ingreso", label: "Ingreso" }, { value: "despacho", label: "Despacho" }]}
                vertical
                readOnly={readOnly}
              />
            </Field>
            <Field label="N° Pallets">
              <Input type="number" min={0} value={form.sec3_numero_pallets}
                onChange={e => set("sec3_numero_pallets", e.target.value)}
                placeholder="0" className="h-8 text-xs w-28" readOnly={readOnly} />
            </Field>
            <Field label="Solicitado por">
              <select value={form.sec3_solicitado_por}
                onChange={e => {
                  set("sec3_solicitado_por", e.target.value as SolicitadoPor)
                  if (e.target.value !== "cuyd") set("sec3_cuyd_detalle", "")
                }}
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
                <Input value={form.sec3_cuyd_detalle} onChange={str("sec3_cuyd_detalle")}
                  placeholder="Detalle CUyD..." className="h-7 text-xs mt-1.5 w-36" readOnly={readOnly} />
              )}
            </Field>
          </div>

          <Field label="Observaciones" className="col-span-2">
            <textarea value={form.sec3_observaciones} onChange={str("sec3_observaciones")}
              placeholder="Observaciones adicionales..." rows={3} readOnly={readOnly}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </Field>
        </div>

        {operadorNode && (
          <div className="border-t pt-4">
            <Field label="Nombre operador de carga" required>
              {operadorNode}
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}
