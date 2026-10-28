"use client"

import { useEffect, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { createClient } from "@/lib/supabase"
import { cn }       from "@/lib/utils"
import { formatearSigla } from "@/lib/sigla"
import type { ReportFormData, TipoContenedor } from "./report-form-types"

// ── Setter type ────────────────────────────────────────────────────────────────

export type FormSetter = <K extends keyof ReportFormData>(key: K, value: ReportFormData[K]) => void

// ── Enter → siguiente campo ──────────────────────────────────────────────────
// El form no es un <form> nativo (se guarda con un botón, no con submit), así
// que Enter no hacía nada. Puesto en el contenedor raíz del formulario: salta
// al siguiente input/select visible en vez de someter nada. Deja pasar Enter
// en textarea (salto de línea), checkbox/radio y botones, para no pisar su
// comportamiento normal (p. ej. "+ Agregar producto" o los combobox).
export function handleEnterFocusNext(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Enter") return
  const target = e.target as HTMLElement
  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return
  if (tag === "INPUT") {
    const tipo = (target as HTMLInputElement).type
    if (["checkbox", "radio", "file", "button", "submit"].includes(tipo)) return
  }
  if (tag !== "INPUT" && tag !== "SELECT") return
  e.preventDefault()
  const focusables = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not(:disabled), select:not(:disabled), textarea:not(:disabled)"
    )
  ).filter(el => el.offsetParent !== null)
  const idx = focusables.indexOf(target)
  if (idx === -1) return
  focusables[idx + 1]?.focus()
}

// ── Field ──────────────────────────────────────────────────────────────────────

export function Field({ label, required, children, className }: {
  label: string; required?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">
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
    <div className={vertical ? "flex flex-col gap-2" : "flex gap-2"}>
      {options.map(opt => (
        <label
          key={opt.value}
          onClick={() => !readOnly && onChange(opt.value)}
          className={cn("flex items-center gap-1.5 select-none", readOnly ? "cursor-default" : "cursor-pointer group")}
        >
          <div className={cn(
            "h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors",
            value === opt.value
              ? "border-primary bg-primary"
              : "border-border",
            !readOnly && "group-hover:border-muted-foreground"
          )}>
            {value === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
          </div>
          <span className="text-xs text-foreground/80">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

// ── Sec1Content ────────────────────────────────────────────────────────────────

export function Sec1Content({ form, set, readOnly, toUpperCase: uc, hideActivation }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
  hideActivation?: boolean
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  const esIso = form.sec1_tipo_contenedor === "isotanque"
  // 20ft/40ft con Almacenaje Full/Vacío: el contenedor entero se ingresa o despacha
  // como una unidad con su sigla (SKU), igual que un isotanque — producto "CONTENEDORES".
  const almacenajeEntero = form.sec1_almacenaje === "full" || form.sec1_almacenaje === "vacio"
  const esContenedorUnidad = (form.sec1_tipo_contenedor === "20ft" || form.sec1_tipo_contenedor === "40ft") && almacenajeEntero
  const esUnidad = esIso || esContenedorUnidad
  const productoUnidad = esIso ? { descripcion: "ISOTANQUE", categoria: "Isotanque" } : { descripcion: "CONTENEDORES", categoria: "Contenedor IMO" }
  // El Ingreso/Despacho ya no se pregunta en la Sección 1: se toma del
  // "Tipo de movimiento" de Antecedentes (sec3_tipo). sec1_tipo_movimiento
  // queda como respaldo para reports antiguos que solo lo tenían ahí.
  // Un 20ft/40ft en despacho ofrece siempre la lista de contenedores que están en
  // bodega (aunque no se haya marcado Almacenaje): al elegir uno se marca
  // "Almacenaje Vacío" (ver el select de Sigla), que es lo que hace que el
  // contenedor se descuente del stock y el report se cierre al salir el camión.
  const esContenedor = form.sec1_tipo_contenedor === "20ft" || form.sec1_tipo_contenedor === "40ft"
  const esDespacho = (form.sec3_tipo || form.sec1_tipo_movimiento) === "despacho"
  // Despacho Parcial: el contenedor llegó lleno, se desconsolida en parte y se va con carga — nunca estuvo en
  // bodega, así que la sigla se escribe (no se elige de la lista de contenedores en bodega).
  const esDespachoUnidad = (esIso || esContenedor) && esDespacho && form.sec1_almacenaje !== "parcial"
  const [enBodega, setEnBodega] = useState<string[]>([])
  // Estado de cada contenedor en bodega ("Full" / "Vacío"), según el último ingreso que lo registró.
  const [envaseDe, setEnvaseDe] = useState<Record<string, string>>({})
  const { descripcion: descProducto, categoria: catProducto } = productoUnidad

  useEffect(() => {
    if (!esDespachoUnidad || !form.cliente) return
    let vivo = true
    ;(async () => {
      const supabase = createClient()
      const { data: cli } = await supabase.from("clientes").select("id").eq("nombre", form.cliente).limit(1).maybeSingle()
      if (!cli) { if (vivo) setEnBodega([]); return }
      const { data: items } = await supabase.from("inventario_items").select("id")
        .eq("cliente_id", cli.id).eq("descripcion", descProducto).eq("categoria", catProducto)
      if (!items?.length) { if (vivo) setEnBodega([]); return }
      const { data: movs } = await supabase.from("movimientos").select("codigo, tipo, tipo_envase, fecha")
        .in("inventario_item_id", items.map(i => i.id)).not("codigo", "is", null).order("fecha", { ascending: true })
      const neto = new Map<string, number>()
      const envases: Record<string, string> = {}
      for (const m of movs ?? []) {
        const k = m.codigo as string
        neto.set(k, (neto.get(k) ?? 0) + (m.tipo === "ingreso" ? 1 : -1))
        if (m.tipo === "ingreso" && (m.tipo_envase === "Full" || m.tipo_envase === "Vacío")) envases[k] = m.tipo_envase
      }
      if (vivo) {
        setEnBodega([...neto.entries()].filter(([, n]) => n > 0).map(([k]) => k).sort())
        setEnvaseDe(envases)
      }
    })()
    return () => { vivo = false }
  }, [esDespachoUnidad, form.cliente, descProducto, catProducto])

  // "Despacho Parcial" solo existe en un despacho: si el report pasa a ingreso, se quita.
  useEffect(() => {
    if (!readOnly && !esDespacho && form.sec1_almacenaje === "parcial") set("sec1_almacenaje", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, esDespacho, form.sec1_almacenaje])

  const [agregado, setAgregado] = useState(false)
  // Un camión lleva 2 de 20ft, 1 de 40ft o 1 isotanque: el segundo contenedor
  // solo existe para 20ft.
  const puedeDos = form.sec1_tipo_contenedor === "20ft"
  const hay2 = puedeDos && (agregado || !!form.sec1_sigla_2 || !!form.sec1_interchange_2)

  // Campo de sigla de un contenedor (1 o 2). En despacho de 20ft/40ft/isotanque es
  // una lista de los que están en bodega — sin repetir el que ya eligió el otro
  // campo; sin contenedores en bodega un 20ft/40ft cae al campo libre (puede ser
  // un contenedor que llegó vacío a cargarse y nunca se registró). El isotanque
  // siempre es lista.
  // Con Almacenaje Full o Vacío elegido, un despacho de 20ft/40ft solo ofrece los contenedores que están en ese
  // estado. Los que no tienen el estado registrado (cargas antiguas) se muestran siempre.
  const coincideAlmacenaje = (codigo: string) => {
    if (!esContenedor || !almacenajeEntero) return true
    const env = envaseDe[codigo]
    if (!env) return true
    return form.sec1_almacenaje === "full" ? env === "Full" : env === "Vacío"
  }
  // Al cambiar Full/Vacío, se quitan las siglas ya elegidas que ya no coinciden.
  const cambiarAlmacenaje = (v: "full" | "vacio" | "parcial" | "") => {
    set("sec1_almacenaje", v)
    if (!esDespachoUnidad || !v || v === "parcial") return
    for (const key of ["sec1_sigla", "sec1_sigla_2"] as const) {
      const c = form[key]
      const env = c ? envaseDe[c] : undefined
      if (c && env && (v === "full" ? env !== "Full" : env !== "Vacío")) set(key, "")
    }
  }

  const siglaCampo = (n: 1 | 2) => {
    const key = n === 1 ? "sec1_sigla" : "sec1_sigla_2"
    const valor = form[key]
    const otra = n === 1 ? form.sec1_sigla_2 : form.sec1_sigla
    const base = esDespachoUnidad ? (esIso ? "Isotanque a despachar" : "Contenedor a despachar") : esUnidad ? (esIso ? "Código del isotanque" : "Sigla del contenedor") : "Sigla"
    const opciones = [...new Set(valor ? [valor, ...enBodega] : enBodega)]
      .filter(c => c === valor || c !== otra)
      .filter(c => c === valor || coincideAlmacenaje(c))
    return (
      <Field label={hay2 ? `${base} ${n}` : base}>
        {esDespachoUnidad && (esIso || enBodega.length > 0) ? (
          <select value={valor}
            onChange={e => {
              set(key, e.target.value)
              // Sin Full/Vacío elegido, queda el estado real del contenedor (si no se sabe, Vacío como antes).
              if (esContenedor && e.target.value && !form.sec1_almacenaje) set("sec1_almacenaje", envaseDe[e.target.value] === "Full" ? "full" : "vacio")
            }}
            disabled={readOnly} className="h-8 text-xs rounded-md border bg-background px-2">
            <option value="">— Seleccionar —</option>
            {opciones.map(c => <option key={c} value={c}>{esContenedor && envaseDe[c] ? `${c} · ${envaseDe[c]}` : c}</option>)}
          </select>
        ) : (
          <Input value={valor} onChange={e => set(key, formatearSigla(e.target.value))}
            placeholder={esUnidad ? "Ej: BLKU257599-0" : "Sigla del contenedor"} className="h-8 text-xs" disabled={readOnly} />
        )}
        {esDespachoUnidad && esContenedor && enBodega.length > 0 && almacenajeEntero && opciones.length === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">
            No hay contenedores {form.sec1_almacenaje === "full" ? "Full" : "Vacíos"} en bodega para este cliente.
          </p>
        )}
      </Field>
    )
  }

  return (
    <div className="space-y-2">
      {!hideActivation && (
        <div className="flex items-center gap-2">
          <Checkbox id="sec1_activa" checked={form.sec1_activa}
            onCheckedChange={v => !readOnly && set("sec1_activa", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec1_activa" className="text-xs font-semibold text-foreground cursor-pointer">
            Activar Sección 1 — Depósito de Contenedores
          </label>
        </div>
      )}

      <div className={cn("space-y-2 transition-opacity", !hideActivation && !form.sec1_activa && "opacity-40 pointer-events-none")}>
        <div className="grid grid-cols-1 gap-2">
          <Field label="Tipo de contenedor">
            <RadioGroup<TipoContenedor>
              value={form.sec1_tipo_contenedor}
              onChange={v => {
                set("sec1_tipo_contenedor", v)
                if (v === "isotanque") set("sec1_almacenaje", "")
                if (v !== "20ft") { setAgregado(false); set("sec1_sigla_2", ""); set("sec1_interchange_2", "") }
              }}
              options={[{ value: "20ft", label: "20ft" }, { value: "40ft", label: "40ft" }, { value: "isotanque", label: "Isotanque" }]}
              readOnly={readOnly}
            />
          </Field>
          {/* Con 20ft/40ft: ingresar o despachar el contenedor entero (como un
              isotanque) — full o vacío. Sin marcar ninguno, el contenedor lo
              trabaja Operaciones (consolidado/desconsolidado) después de que el
              camión se vaya. */}
          {(form.sec1_tipo_contenedor === "20ft" || form.sec1_tipo_contenedor === "40ft") && (
            <div className="space-y-1">
              {/* Solo una opción a la vez. En un despacho: Despacho Full, Despacho Vacío o Despacho Parcial. */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox id="sec1_almacenaje_full" checked={form.sec1_almacenaje === "full"}
                    onCheckedChange={v => !readOnly && cambiarAlmacenaje(v === true ? "full" : "")}
                    className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="sec1_almacenaje_full" className="text-xs text-foreground/80 cursor-pointer">{esDespacho ? "Despacho Full" : "Almacenaje Full"}</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sec1_almacenaje_vacio" checked={form.sec1_almacenaje === "vacio"}
                    onCheckedChange={v => !readOnly && cambiarAlmacenaje(v === true ? "vacio" : "")}
                    className="h-3.5 w-3.5" disabled={readOnly} />
                  <label htmlFor="sec1_almacenaje_vacio" className="text-xs text-foreground/80 cursor-pointer">{esDespacho ? "Despacho Vacío" : "Almacenaje Vacío"}</label>
                </div>
                {esDespacho && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="sec1_almacenaje_parcial" checked={form.sec1_almacenaje === "parcial"}
                      onCheckedChange={v => !readOnly && cambiarAlmacenaje(v === true ? "parcial" : "")}
                      className="h-3.5 w-3.5" disabled={readOnly} />
                    <label htmlFor="sec1_almacenaje_parcial" className="text-xs text-foreground/80 cursor-pointer"
                      title="Llega lleno, se desconsolida en parte y se va con carga">Despacho Parcial</label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id="sec1_carga_normal" checked={form.sec1_carga_normal}
              onCheckedChange={v => !readOnly && set("sec1_carga_normal", v === true)}
              className="h-3.5 w-3.5" disabled={readOnly} />
            <label htmlFor="sec1_carga_normal" className="text-xs text-foreground/80 cursor-pointer">Carga normal</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sec1_carga_imo" checked={form.sec1_carga_imo}
              onCheckedChange={v => !readOnly && set("sec1_carga_imo", v === true)}
              className="h-3.5 w-3.5" disabled={readOnly} />
            <label htmlFor="sec1_carga_imo" className="text-xs text-foreground/80 cursor-pointer">Carga IMO</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="sec1_habilitacion" checked={form.sec1_habilitacion}
              onCheckedChange={v => !readOnly && set("sec1_habilitacion", v === true)}
              className="h-3.5 w-3.5" disabled={readOnly} />
            <label htmlFor="sec1_habilitacion" className="text-xs text-foreground/80 cursor-pointer">Habilitación</label>
          </div>
        </div>

        {form.sec1_carga_imo && (
          <div className="grid grid-cols-2 gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <Field label="Clase IMO">
              <Input value={form.sec1_clase_imo} onChange={str("sec1_clase_imo")}
                placeholder="Ej: 3, 6.1, 8..." className="h-8 text-xs" disabled={readOnly} />
            </Field>
            <Field label="NU">
              <Input value={form.sec1_nu} onChange={str("sec1_nu")}
                className="h-8 text-xs font-mono" disabled={readOnly} />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Hora inicio">
            <Input type="time" value={form.sec1_hora_inicio}
              onChange={e => set("sec1_hora_inicio", e.target.value)} className="h-8 text-xs" disabled={readOnly} />
          </Field>
          <Field label="Hora término">
            <Input type="time" value={form.sec1_hora_termino}
              onChange={e => set("sec1_hora_termino", e.target.value)} className="h-8 text-xs" disabled={readOnly} />
          </Field>
          {siglaCampo(1)}
          <Field label={hay2 ? "Interchange 1" : "Interchange"}>
            <Input value={form.sec1_interchange} onChange={str("sec1_interchange")}
              placeholder="N° Interchange" className="h-8 text-xs" disabled={readOnly} />
          </Field>
          {hay2 && (
            <>
              {siglaCampo(2)}
              <Field label="Interchange 2">
                <Input value={form.sec1_interchange_2} onChange={str("sec1_interchange_2")}
                  placeholder="N° Interchange" className="h-8 text-xs" disabled={readOnly} />
              </Field>
            </>
          )}
        </div>

        {/* Un camión puede traer o retirar 1 o 2 contenedores: el segundo lleva su
            propia sigla e interchange; tipo, horas y Almacenaje se comparten. */}
        {!readOnly && puedeDos && (
          hay2 ? (
            <button type="button" className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
              onClick={() => { setAgregado(false); set("sec1_sigla_2", ""); set("sec1_interchange_2", "") }}>
              Quitar segundo contenedor
            </button>
          ) : (
            <button type="button" className="text-xs text-primary hover:underline underline-offset-2"
              onClick={() => setAgregado(true)}>
              + Agregar segundo contenedor
            </button>
          )
        )}

        <div className="flex items-center gap-2">
          <Checkbox id="sec1_hds" checked={form.sec1_hds}
            onCheckedChange={v => !readOnly && set("sec1_hds", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec1_hds" className="text-xs text-foreground/80 cursor-pointer">HDS adjunto</label>
        </div>
      </div>
    </div>
  )
}

// ── Sec2Content ────────────────────────────────────────────────────────────────

export function Sec2Content({ form, set, readOnly, toUpperCase: uc, hideActivation }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
  hideActivation?: boolean
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  // Consolidado/Desconsolidado van en su propia fila para reforzar que son
  // mutuamente excluyentes — el resto se combina libremente en la siguiente.
  const exclusiveFields: [keyof ReportFormData, string][] = [
    ["sec2_consolidado",    "Consolidado"],
    ["sec2_desconsolidado", "Desconsolidado"],
  ]
  const multiFields: [keyof ReportFormData, string][] = [
    ["sec2_picking",    "Picking"],
    ["sec2_paletizado", "Paletizado"],
    ["sec2_etiquetado", "Etiquetado"],
    ["sec2_otro",       "Otro"],
  ]

  function checkboxItem([key, label]: [keyof ReportFormData, string]) {
    return (
      <div key={key} className="flex items-center gap-2">
        <Checkbox id={key} checked={form[key] as boolean}
          onCheckedChange={v => {
            if (readOnly) return
            const checked = v === true
            set(key, checked as ReportFormData[typeof key])
            // Consolidado y Desconsolidado son mutuamente excluyentes — el
            // resto de las opciones sí se pueden combinar libremente.
            if (checked && key === "sec2_consolidado") set("sec2_desconsolidado", false)
            if (checked && key === "sec2_desconsolidado") set("sec2_consolidado", false)
          }}
          className="h-3.5 w-3.5" disabled={readOnly} />
        <label htmlFor={key} className="text-xs text-foreground/80 cursor-pointer">{label}</label>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!hideActivation && (
        <div className="flex items-center gap-2">
          <Checkbox id="sec2_activa" checked={form.sec2_activa}
            onCheckedChange={v => !readOnly && set("sec2_activa", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec2_activa" className="text-xs font-semibold text-foreground cursor-pointer">
            Activar Sección 2 — Consolidado / Desconsolidado / Otros
          </label>
        </div>
      )}

      <div className={cn("space-y-2 transition-opacity", !hideActivation && !form.sec2_activa && "opacity-40 pointer-events-none")}>
        <div className="space-y-1.5 p-3 bg-muted/40 rounded-lg">
          <div className="flex items-center gap-4">
            {exclusiveFields.map(checkboxItem)}
            <span className="h-4 w-px bg-border" />
            {checkboxItem(["sec2_parcial", "Parcial"])}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {multiFields.map(checkboxItem)}
          </div>
        </div>

        {/* Las horas de inicio/término ya no se piden acá: manda la Hora inicio/
            término de la Sección 3 (Operaciones), que cubre todo el report. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Sigla / N°" className="col-span-2">
            <Input value={form.sec2_sigla_numero} onChange={str("sec2_sigla_numero")}
              placeholder="Sigla o número" className="h-8 text-xs" disabled={readOnly} />
          </Field>
          <Field label="Observaciones" className="col-span-2">
            <textarea value={form.sec2_observaciones} onChange={str("sec2_observaciones")}
              placeholder="Observaciones adicionales..." rows={2} disabled={readOnly}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50" />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ── Sec3Content ────────────────────────────────────────────────────────────────

export function Sec3Content({ form, set, readOnly, toUpperCase: uc, itemsNode, operadorNode, serviciosNode, imagenesNode, hideActivation }: {
  form: ReportFormData
  set: FormSetter
  readOnly?: boolean
  toUpperCase?: boolean
  // Lista repetible de productos de Bodegaje (BodegajeItemsList) — los
  // campos por producto (Producto, Clase IMO, NU, N° Bodega, Pallets,
  // Unidades, Lote, CAS, OC, Elab., Venc.) viven ahí, no en este componente.
  itemsNode: React.ReactNode
  operadorNode?: React.ReactNode
  serviciosNode?: React.ReactNode
  // Imágenes de referencia (opcionales), debajo de Observaciones.
  imagenesNode?: React.ReactNode
  hideActivation?: boolean
}) {
  const str = (key: keyof ReportFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, (uc ? e.target.value.toUpperCase() : e.target.value) as ReportFormData[typeof key])

  return (
    <div className="space-y-2">
      {!hideActivation && (
        <div className="flex items-center gap-2">
          <Checkbox id="sec3_activa" checked={form.sec3_activa}
            onCheckedChange={v => !readOnly && set("sec3_activa", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec3_activa" className="text-xs font-semibold text-foreground cursor-pointer">
            Activar Sección 3 — Bodegaje
          </label>
        </div>
      )}

      <div className={cn("space-y-3 transition-opacity", !hideActivation && !form.sec3_activa && "opacity-40 pointer-events-none")}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Hora inicio">
            <Input type="time" value={form.sec3_hora_inicio}
              onChange={e => set("sec3_hora_inicio", e.target.value)} className="h-8 text-xs" disabled={readOnly} />
          </Field>
          <Field label="Hora término">
            <Input type="time" value={form.sec3_hora_termino}
              onChange={e => set("sec3_hora_termino", e.target.value)} className="h-8 text-xs" disabled={readOnly} />
          </Field>
        </div>

        {itemsNode}

        {serviciosNode}

        <div className="flex items-center gap-2">
          <Checkbox id="sec3_servicio_adicional" checked={form.sec3_servicio_adicional}
            onCheckedChange={v => !readOnly && set("sec3_servicio_adicional", v === true)}
            className="h-3.5 w-3.5" disabled={readOnly} />
          <label htmlFor="sec3_servicio_adicional" className="text-xs font-medium text-foreground cursor-pointer">
            Servicio Adicional
          </label>
        </div>

        <Field label="Observaciones">
          <textarea value={form.sec3_observaciones} onChange={str("sec3_observaciones")}
            placeholder="Observaciones adicionales..." rows={2} disabled={readOnly}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50" />
        </Field>

        {imagenesNode}

        {operadorNode && (
          <div className="border-t pt-2">
            <Field label="Nombre operador de carga" required>
              {operadorNode}
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}
