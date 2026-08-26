"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import ExcelJS from "exceljs"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  FileSpreadsheet, Search, Settings2, CheckCircle2,
  AlertCircle, Loader2, ChevronRight, ChevronLeft, ChevronDown, FileText, RefreshCw, Download, Wrench,
  Calendar as CalendarIcon, Trash2, Pencil, Mail,
} from "lucide-react"
import type { Cliente, TarifaCliente, TarifaClienteInsert, ServicioCliente, ServicioClienteInsert, HesFolio, TransporteIncomex } from "@/types/database"
import { computeHES, computeBilling, getPeriodRange, type MovRaw, type HesResult, type BillingResult } from "@/lib/hes-calc"

// ── Constants ──────────────────────────────────────────────────────────────────
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

const CURRENT_YEAR  = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i)

function todayIsoLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const TODAY_ISO = todayIsoLocal()

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtUF(v: number) { return v.toFixed(4) }
function fmtCLP(v: number) { return `$${Math.round(v).toLocaleString("es-CL")}` }
function fmtDateDisplay(iso: string) { return iso.split("-").reverse().join("/") }

// ── Render del .xlsx real (vista previa fiel al archivo descargado) ────────────
interface PreviewCell {
  key:     string
  value:   string
  rowSpan: number
  colSpan: number
  style:   React.CSSProperties
}
interface PreviewRow { height: number; cells: PreviewCell[] }
interface PreviewLogo { dataUrl: string; width: number; height: number; leftPx: number; topPx: number }
interface PreviewSheet { colWidths: number[]; rows: PreviewRow[]; logo: PreviewLogo | null }

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function argbToCss(argb?: string): string | undefined {
  if (!argb || argb.length < 6) return undefined
  return `#${argb.length === 8 ? argb.slice(2) : argb}`
}

function fmtCellValue(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ""
  if (typeof v === "number") {
    const fmt = cell.numFmt ?? ""
    if (fmt.includes("$"))  return `$${Math.round(v).toLocaleString("es-CL")}`
    if (fmt === "0.0000")   return v.toFixed(4)
    if (fmt === "0.00")     return v.toFixed(2)
    return v.toLocaleString("es-CL")
  }
  if (v instanceof Date) return v.toLocaleDateString("es-CL")
  if (typeof v === "object") {
    if ("richText" in v) return (v.richText as { text: string }[]).map(r => r.text).join("")
    if ("result"   in v) return String((v as { result?: unknown }).result ?? "")
  }
  return String(v)
}

async function buildPreviewSheet(buffer: ArrayBuffer): Promise<PreviewSheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return renderSheet(wb, wb.worksheets[0])
}

// Modo unificado: el .xlsx trae una hoja por tarifa/CI + "Resumen general" —
// se parsean todas para poder cambiar entre ellas en la vista previa.
async function buildAllPreviewSheets(buffer: ArrayBuffer): Promise<{ name: string; sheet: PreviewSheet }[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb.worksheets.map(ws => ({ name: ws.name, sheet: renderSheet(wb, ws) }))
}

function renderSheet(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): PreviewSheet {
  const colToNum = (s: string) => s.split("").reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0)

  type Span = { rowSpan: number; colSpan: number }
  const masterSpan = new Map<string, Span>()
  const covered    = new Set<string>()

  for (const range of (ws.model.merges ?? []) as string[]) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    if (!m) continue
    const c1 = colToNum(m[1]), r1 = parseInt(m[2]), c2 = colToNum(m[3]), r2 = parseInt(m[4])
    masterSpan.set(`${r1},${c1}`, { rowSpan: r2 - r1 + 1, colSpan: c2 - c1 + 1 })
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (!(r === r1 && c === c1)) covered.add(`${r},${c}`)
  }

  const colCount   = ws.columnCount
  const colWidths  = Array.from({ length: colCount }, (_, i) => (ws.getColumn(i + 1).width ?? 9) * 7)

  // Logo embebido (imagen flotante, no viaja en las celdas al iterar filas)
  let logo: PreviewLogo | null = null
  const images = ws.getImages()
  if (images.length > 0) {
    const img   = images[0] as (typeof images)[number] & { range: { ext?: { width: number; height: number } } }
    const media = wb.model.media[Number(img.imageId)] as
      | { buffer: ArrayBuffer | Uint8Array; extension: string }
      | undefined
    if (media?.buffer) {
      const bytes = media.buffer instanceof Uint8Array ? media.buffer : new Uint8Array(media.buffer)
      const anchorCol = img.range.tl.nativeCol
      const anchorRow = img.range.tl.nativeRow
      let topPx = 0
      for (let i = 1; i <= anchorRow; i++) topPx += (ws.getRow(i).height ?? 15) * 1.15
      logo = {
        dataUrl: `data:image/${media.extension};base64,${bytesToBase64(bytes)}`,
        width:   img.range.ext?.width  ?? 200,
        height:  img.range.ext?.height ?? 70,
        leftPx:  colWidths.slice(0, anchorCol).reduce((a, b) => a + b, 0),
        topPx,
      }
    }
  }

  const rows: PreviewRow[] = []

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: PreviewCell[] = []
    for (let c = 1; c <= colCount; c++) {
      if (covered.has(`${r},${c}`)) continue
      const cell   = row.getCell(c)
      const span   = masterSpan.get(`${r},${c}`)
      const align  = cell.alignment
      const font   = cell.font
      const fill   = cell.fill as ExcelJS.FillPattern | undefined
      const border = cell.border

      const bd = (side?: Partial<ExcelJS.Border>) =>
        side ? `1px solid ${argbToCss(side.color?.argb) ?? "#ccc"}` : "1px solid transparent"

      cells.push({
        key: `${r}-${c}`,
        value: fmtCellValue(cell),
        rowSpan: span?.rowSpan ?? 1,
        colSpan: span?.colSpan ?? 1,
        style: {
          textAlign:      (align?.horizontal as React.CSSProperties["textAlign"]) ?? "left",
          verticalAlign:  align?.vertical === "middle" ? "middle" : "top",
          whiteSpace:     align?.wrapText ? "pre-line" : "nowrap",
          fontWeight:     font?.bold ? 700 : 400,
          fontStyle:      font?.italic ? "italic" : "normal",
          textDecoration: font?.underline ? "underline" : "none",
          fontSize:       font?.size ? `${Math.round(font.size * 0.9)}px` : "11px",
          color:          argbToCss(font?.color?.argb) ?? "#000",
          backgroundColor: fill?.type === "pattern" ? argbToCss(fill.fgColor?.argb) : undefined,
          borderTop:    bd(border?.top),
          borderBottom: bd(border?.bottom),
          borderLeft:   bd(border?.left),
          borderRight:  bd(border?.right),
        },
      })
    }
    rows.push({ height: (row.height ?? 15) * 1.15, cells })
  }

  return { colWidths, rows, logo }
}

// ── Tarifa Dialog ──────────────────────────────────────────────────────────────
function TarifaDialog({
  clienteId, clienteNombre, existing, onClose, onSaved,
}: {
  clienteId: string; clienteNombre: string
  existing: TarifaCliente | null   // null = nueva tarifa
  onClose: () => void
  onSaved: (t: TarifaCliente) => void
}) {
  const { user, profile } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<TarifaClienteInsert>>({
    cliente_id:            clienteId,
    cotizacion_numero:     existing?.cotizacion_numero     ?? "",
    clase_imo:             existing?.clase_imo             ?? "",
    moneda:                existing?.moneda                ?? "UF",
    tarifa_almacenaje_uf:  existing?.tarifa_almacenaje_uf  ?? null,
    tarifa_inout_uf:       existing?.tarifa_inout_uf       ?? 0.06,
    tarifa_almacenaje_clp: existing?.tarifa_almacenaje_clp ?? null,
    tarifa_inout_clp:      existing?.tarifa_inout_clp      ?? null,
    tarifa_descons_20_uf:  existing?.tarifa_descons_20_uf  ?? null,
    tarifa_descons_40_uf:  existing?.tarifa_descons_40_uf  ?? null,
    tarifa_consolid_40_uf: existing?.tarifa_consolid_40_uf ?? null,
    tarifa_porteo_uf:      existing?.tarifa_porteo_uf      ?? null,
    tarifa_palletizado_uf: existing?.tarifa_palletizado_uf ?? null,
    facturacion_minima_uf: existing?.facturacion_minima_uf ?? null,
    activo: true,
  })
  const isClp = form.moneda === "CLP"

  function setField<K extends keyof TarifaClienteInsert>(k: K, v: TarifaClienteInsert[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function num(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    // cotizacion_numero vacío → lo genera el trigger de la BD
    const payload = { ...form, cliente_id: clienteId, activo: true }
    let data, error
    if (existing) {
      ;({ data, error } = await supabase.from("tarifas_cliente").update(payload).eq("id", existing.id).select().single())
    } else {
      ;({ data, error } = await supabase.from("tarifas_cliente").insert(payload).select().single())
    }
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    if (data) {
      logAudit({
        tabla:          "tarifas_cliente",
        registro_id:    data.id,
        accion:         existing ? "tarifa.actualizar" : "tarifa.crear",
        descripcion:    `Tarifa ${(data as TarifaCliente).cotizacion_numero} ${existing ? "actualizada" : "creada"} — ${clienteNombre}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      onSaved(data as TarifaCliente)
    }
  }

  const fieldCls = "h-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1"
  const labelCls = "text-[11px] text-muted-foreground"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background rounded-xl border border-border/60 shadow-xl w-[520px] max-w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h2 className="text-[14px] font-semibold">{existing ? "Editar tarifa" : "Nueva tarifa"}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Cotización N° <span className="text-muted-foreground/60">(auto si se deja vacío)</span></Label>
              <Input className={fieldCls} value={form.cotizacion_numero ?? ""} onChange={e => setField("cotizacion_numero", e.target.value)} placeholder="COT-2026-001" />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Clase IMO</Label>
              <Input className={fieldCls} value={form.clase_imo ?? ""} onChange={e => setField("clase_imo", e.target.value)} placeholder="Ej: 8, 3, 2.2, Normal" />
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <div className="space-y-1 mb-3">
              <Label className={labelCls}>Moneda de almacenaje / in-out</Label>
              <div className="inline-flex rounded-md border border-border/50 overflow-hidden">
                {(["UF", "CLP"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setField("moneda", m)}
                    className={cn(
                      "px-3 py-1.5 text-[12px] font-medium transition-colors",
                      form.moneda === m ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "UF" ? "UF" : "Pesos ($)"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                {isClp
                  ? "Este cliente factura almacenaje e in/out en pesos fijos, no indexados a la UF (ej. BASF)."
                  : "La mayoría de los clientes factura en UF — cambia a Pesos solo si el contrato es en $ fijos."}
              </p>
            </div>

            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tarifas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isClp ? (
                <>
                  <div className="space-y-1">
                    <Label className={labelCls}>Almacenaje ($/pallet/día)</Label>
                    <Input className={fieldCls} type="number" step="1"
                      value={form.tarifa_almacenaje_clp ?? ""}
                      onChange={e => setField("tarifa_almacenaje_clp", num(e.target.value))}
                      placeholder="Ej: 842" />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>IN / OUT ($/pallet)</Label>
                    <Input className={fieldCls} type="number" step="1"
                      value={form.tarifa_inout_clp ?? ""}
                      onChange={e => setField("tarifa_inout_clp", num(e.target.value))}
                      placeholder="Ej: 2806" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className={labelCls}>Almacenaje (UF/pallet/día)</Label>
                    <Input className={fieldCls} type="number" step="0.0001"
                      value={form.tarifa_almacenaje_uf ?? ""}
                      onChange={e => setField("tarifa_almacenaje_uf", num(e.target.value))}
                      placeholder="Ej: 0.0045" />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelCls}>IN / OUT (UF/pallet)</Label>
                    <Input className={fieldCls} type="number" step="0.0001"
                      value={form.tarifa_inout_uf ?? ""}
                      onChange={e => setField("tarifa_inout_uf", num(e.target.value))}
                      placeholder="Ej: 0.06" />
                  </div>
                </>
              )}
              {[
                { label: "Desconsolidación 20\" (UF/cont)", key: "tarifa_descons_20_uf",  ph: "Ej: 3.5"    },
                { label: "Desconsolidación 40\" (UF/cont)", key: "tarifa_descons_40_uf",  ph: "Ej: 5.0"    },
                { label: "Consolidación 40\" (UF/cont)",    key: "tarifa_consolid_40_uf", ph: "Ej: 4.0"    },
                { label: "Porteo (UF/operación)",            key: "tarifa_porteo_uf",      ph: "Ej: 10.19"  },
                { label: "Palletizado (UF/pallet)",          key: "tarifa_palletizado_uf", ph: "Ej: 0.321"  },
                { label: "Facturación mínima (UF/mes)",      key: "facturacion_minima_uf", ph: "Ej: 5.0"    },
              ].map(({ label, key, ph }) => (
                <div key={key} className="space-y-1">
                  <Label className={labelCls}>{label}</Label>
                  <Input className={fieldCls} type="number" step="0.0001"
                    value={(form[key as keyof typeof form] ?? "") as string | number}
                    onChange={e => setField(key as keyof TarifaClienteInsert, num(e.target.value) as never)}
                    placeholder={ph}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border/40">
          {saveError && <p className="text-[11px] text-destructive flex-1">{saveError}</p>}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px]">Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-[12px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {existing ? "Guardar cambios" : "Crear tarifa"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Servicio Dialog ────────────────────────────────────────────────────────────
function ServicioDialog({
  clienteId, clienteNombre, existing, onClose, onSaved, onDeleted,
}: {
  clienteId: string; clienteNombre: string
  existing: ServicioCliente | null
  onClose: () => void
  onSaved: (s: ServicioCliente) => void
  onDeleted?: (id: string) => void
}) {
  const { user, profile } = useAuth()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<ServicioClienteInsert>>({
    cliente_id:  clienteId,
    nombre:      existing?.nombre      ?? "",
    descripcion: existing?.descripcion ?? "",
    tarifa_uf:   existing?.tarifa_uf   ?? null,
    unidad:      existing?.unidad      ?? "unidad",
    orden:       existing?.orden       ?? 0,
    activo:      true,
  })

  function setField<K extends keyof ServicioClienteInsert>(k: K, v: ServicioClienteInsert[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }
  function num(v: string) { const n = parseFloat(v); return isNaN(n) ? null : n }

  async function handleSave() {
    if (!form.nombre?.trim()) return
    setSaving(true); setSaveError(null)
    const supabase = createClient()
    const payload = { ...form, cliente_id: clienteId, activo: true }
    let data, error
    if (existing) {
      ;({ data, error } = await supabase.from("servicios_cliente").update(payload).eq("id", existing.id).select().single())
    } else {
      ;({ data, error } = await supabase.from("servicios_cliente").insert(payload).select().single())
    }
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    if (data) {
      logAudit({
        tabla:          "servicios_cliente",
        registro_id:    data.id,
        accion:         existing ? "servicio.actualizar" : "servicio.crear",
        descripcion:    `Servicio ${(data as ServicioCliente).nombre} ${existing ? "actualizado" : "creado"} — ${clienteNombre}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      onSaved(data as ServicioCliente)
    }
  }

  async function handleDelete() {
    if (!existing) return
    setDeleting(true)
    const supabase = createClient()
    const { data, error } = await supabase.from("servicios_cliente")
      .update({ activo: false }).eq("id", existing.id).select("id").single()
    setDeleting(false)
    if (!error && data) {
      logAudit({
        tabla:          "servicios_cliente",
        registro_id:    existing.id,
        accion:         "servicio.eliminar",
        descripcion:    `Servicio ${existing.nombre} eliminado — ${clienteNombre}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      onDeleted?.(existing.id)
    }
  }

  const fieldCls = "h-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1"
  const labelCls = "text-[11px] text-muted-foreground"

  const UNIDAD_OPTS = ["contenedor", "contenedor 20ft", "contenedor 40ft", "pallet", "operación", "mes", "unidad", "hora"]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background rounded-xl border border-border/60 shadow-xl w-[460px] max-w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h2 className="text-[14px] font-semibold">{existing ? "Editar servicio" : "Nuevo servicio"}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1">
            <Label className={labelCls}>Nombre del servicio <span className="text-destructive">*</span></Label>
            <Input className={fieldCls} value={form.nombre ?? ""}
              onChange={e => setField("nombre", e.target.value)}
              placeholder="Ej: Desconsolidación 40ft, Porteo, Palletizado" />
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Descripción <span className="text-muted-foreground/50">(opcional)</span></Label>
            <Input className={fieldCls} value={form.descripcion ?? ""}
              onChange={e => setField("descripcion", e.target.value)}
              placeholder="Detalle del servicio para la HES" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className={labelCls}>Tarifa (UF / unidad)</Label>
              <Input className={fieldCls} type="number" step="0.0001"
                value={form.tarifa_uf ?? ""}
                onChange={e => setField("tarifa_uf", num(e.target.value))}
                placeholder="Ej: 3.5" />
            </div>
            <div className="space-y-1">
              <Label className={labelCls}>Unidad de medida</Label>
              <div className="relative">
                <Input className={fieldCls} list="unidad-opts" value={form.unidad ?? ""}
                  onChange={e => setField("unidad", e.target.value)}
                  placeholder="contenedor, pallet…" />
                <datalist id="unidad-opts">
                  {UNIDAD_OPTS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className={labelCls}>Orden de aparición en HES</Label>
            <Input className={`${fieldCls} w-24`} type="number" min="0" step="1"
              value={form.orden ?? 0}
              onChange={e => setField("orden", parseInt(e.target.value) || 0)} />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border/40">
          <div>
            {existing && (
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
                className="h-8 text-[12px] text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saveError && <p className="text-[11px] text-destructive mr-1">{saveError}</p>}
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px]">Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nombre?.trim()} className="h-8 text-[12px]">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {existing ? "Guardar cambios" : "Crear servicio"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Preview Dialog (Resumen en PDF · Detalle = render fiel del .xlsx real) ────
function PreviewDialog({
  clienteNombre, activeTab, onTabChange,
  resumenLoading, resumenError, resumenUrl,
  loading, error, sheet,
  onClose, onDownload, downloading, onOpenSend, folioNumero, folioIsFinal,
  isUnificado, unifiedResults, unifiedServiciosBilling, unifiedTotalCLP, unifiedLoading, unifiedError,
  previewSheets, activeSheetIdx, onActiveSheetChange,
}: {
  clienteNombre: string
  activeTab: "resumen" | "detalle"
  onTabChange: (tab: "resumen" | "detalle") => void
  isUnificado: boolean
  unifiedResults: { tarifa: TarifaCliente; hes: HesResult; billing: BillingResult }[]
  unifiedServiciosBilling: BillingResult | null
  unifiedTotalCLP: number
  unifiedLoading: boolean
  unifiedError: string | null
  previewSheets: { name: string; sheet: PreviewSheet }[]
  activeSheetIdx: number
  onActiveSheetChange: (i: number) => void
  resumenLoading: boolean
  resumenError:   string | null
  resumenUrl:     string | null
  loading:  boolean
  error:    string | null
  sheet:    PreviewSheet | null
  onClose:  () => void
  onDownload: () => void
  onOpenSend: () => void
  downloading: boolean
  folioNumero: number | null
  folioIsFinal: boolean
}) {
  const activeSheet = previewSheets[activeSheetIdx]?.sheet ?? sheet
  const ready = activeTab === "resumen"
    ? (!resumenLoading && !!resumenUrl)
    : (!loading && !!activeSheet)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background rounded-xl border border-border/60 shadow-xl w-[95vw] max-w-6xl h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40 flex-shrink-0 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <h2 className="text-[14px] font-semibold">Vista previa — HES {clienteNombre}</h2>
            {folioNumero != null && (
              <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">
                N° HES-{String(folioNumero).padStart(6, "0")}{!folioIsFinal && " (provisorio)"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => onTabChange("resumen")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeTab === "resumen" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="h-3.5 w-3.5" /> Resumen
              </button>
              <button
                onClick={() => onTabChange("detalle")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeTab === "detalle" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Detalle
              </button>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5 bg-muted/10">
          {activeTab === "resumen" ? (
            resumenLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-[12px]">Generando resumen…</p>
              </div>
            ) : resumenError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <AlertCircle className="h-8 w-8 text-amber-500/60" />
                <p className="text-[12px]">{resumenError}</p>
              </div>
            ) : resumenUrl ? (
              <iframe
                src={resumenUrl}
                title={`Resumen HES ${clienteNombre}`}
                className="w-full h-full border-0 rounded-lg bg-white"
              />
            ) : null
          ) : (
            loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-[12px]">Generando y cargando el archivo…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <AlertCircle className="h-8 w-8 text-amber-500/60" />
                <p className="text-[12px]">{error}</p>
              </div>
            ) : activeSheet ? (
              <div className="space-y-3">
                {previewSheets.length > 1 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {previewSheets.map((s, i) => (
                      <button
                        key={s.name}
                        onClick={() => onActiveSheetChange(i)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border",
                          i === activeSheetIdx
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border/50 hover:text-foreground"
                        )}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bg-card rounded-lg border border-border/40 shadow-sm inline-block p-2 max-w-full overflow-auto">
                <div className="relative" style={{ width: "fit-content" }}>
                  {activeSheet.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeSheet.logo.dataUrl}
                      alt="Logo ADP"
                      className="absolute pointer-events-none"
                      style={{ left: activeSheet.logo.leftPx, top: activeSheet.logo.topPx, width: activeSheet.logo.width, height: activeSheet.logo.height }}
                    />
                  )}
                  <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup>
                      {activeSheet.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <tbody>
                      {activeSheet.rows.map((row, i) => (
                        <tr key={i} style={{ height: row.height }}>
                          {row.cells.map(cell => (
                            <td key={cell.key} rowSpan={cell.rowSpan} colSpan={cell.colSpan}
                              style={{ ...cell.style, padding: "2px 4px", overflow: "hidden" }}>
                              {cell.value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            ) : null
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border/40 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px]">Cerrar</Button>
          <Button variant="outline" size="sm" onClick={onOpenSend} className="h-8 gap-1.5 text-[12px]">
            <Mail className="h-3.5 w-3.5" /> Enviar HES
          </Button>
          <Button size="sm" onClick={onDownload} disabled={downloading || !ready}
            className="h-8 gap-1.5 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white">
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {activeTab === "resumen" ? "Descargar PDF" : "Descargar Excel"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Popup para enviar el HES por correo al email de contacto del cliente ────
function EnviarHesDialog({ clienteNombre, emails, onClose, onSend, onSent }: {
  clienteNombre: string
  emails: string[]
  onClose: () => void
  onSend: (adjuntos: { resumen: boolean; detalle: boolean }) => Promise<{ success: boolean; error?: string; enviadoA?: string[] }>
  onSent: (enviadoA: string[]) => void
}) {
  const [resumen, setResumen] = useState(true)
  const [detalle, setDetalle] = useState(true)
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [sentTo,  setSentTo]  = useState<string[] | null>(null)

  async function handleSend() {
    setSending(true); setError(null)
    const res = await onSend({ resumen, detalle })
    setSending(false)
    if (res.success) {
      setSentTo(res.enviadoA ?? emails)
      onSent(res.enviadoA ?? emails)
    } else {
      setError(res.error ?? "No se pudo enviar el correo.")
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-background rounded-xl border border-border/60 shadow-xl w-[420px] max-w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h2 className="text-[14px] font-semibold">Enviar HES por correo</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        {sentTo ? (
          <div className="p-6 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-[12px]">Correo enviado a {sentTo.join(", ")}.</p>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {emails.length === 0 ? (
              <p className="text-[12px] text-amber-600">Este cliente no tiene un email de contacto registrado.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Destinatario(s): <span className="text-foreground">{emails.join(", ")}</span>
              </p>
            )}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={resumen} onChange={e => setResumen(e.target.checked)} />
                Resumen (PDF)
              </label>
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={detalle} onChange={e => setDetalle(e.target.checked)} />
                Detalle (Excel)
              </label>
            </div>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[12px]">
            {sentTo ? "Cerrar" : "Cancelar"}
          </Button>
          {!sentTo && (
            <Button size="sm" onClick={handleSend} disabled={sending || emails.length === 0 || (!resumen && !detalle)}
              className="h-8 gap-1.5 text-[12px]">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Enviar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Vista apilada del modo "Ver todas" — una tarjeta de cobro por tarifa/CI
// + servicios a nivel cliente + total general. Se usa en la pantalla
// principal y dentro de la pestaña "Resumen" de la vista previa. ──────────────
function UnifiedResumenCards({ results, serviciosBilling, transporteOps, transporteError, onRetryTransporte, transporteTotalCLP, totalCLP, hasMin, minimoCLP, loading, error }: {
  results: { tarifa: TarifaCliente; hes: HesResult; billing: BillingResult }[]
  serviciosBilling: BillingResult | null
  transporteOps: TransporteIncomex[]
  transporteError: string | null
  onRetryTransporte: () => void
  transporteTotalCLP: number
  totalCLP: number
  hasMin: boolean
  minimoCLP: number
  loading: boolean
  error:   string | null
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">{error}</p>
      )}
      {results.filter(r => r.billing.totalUF > 0 || r.billing.totalCLP > 0).map(({ tarifa: t, hes: h, billing: b }) => (
        <div key={t.id} className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
            <span className="text-[12px] font-semibold">{t.clase_imo ?? t.cotizacion_numero}</span>
            <span className="text-[11px] text-muted-foreground">{h.palletDays.toLocaleString("es-CL")} pallet-días · {h.totalIngresos} in · {h.totalDespachos} out</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[480px]">
              <thead>
                <tr className="border-b border-border/30 bg-muted/10">
                  <th className="text-left px-4 py-1.5 font-medium text-muted-foreground">Descripción</th>
                  <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Cantidad</th>
                  <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Tarifa</th>
                  <th className="text-right px-4 py-1.5 font-medium text-muted-foreground">Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {b.rows.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-3 text-center text-muted-foreground text-[11px]">Sin movimientos este período</td></tr>
                ) : b.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="px-4 py-1.5">{r.label}</td>
                    <td className="text-right px-3 py-1.5 font-mono">{r.qty.toLocaleString("es-CL")} <span className="text-muted-foreground text-[10px]">{r.unit}</span></td>
                    <td className="text-right px-3 py-1.5 font-mono">{r.moneda === "CLP" ? fmtCLP(r.tarifa) : `${fmtUF(r.tarifa)} UF`}</td>
                    <td className="text-right px-4 py-1.5 font-mono">{fmtCLP(r.totalCLP)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-primary/5 font-bold">
                  <td colSpan={3} className="px-4 py-2 text-[12px]">TOTAL {t.clase_imo ?? ""}</td>
                  <td className="text-right px-4 py-2 font-mono text-[12px] text-primary">{fmtCLP(b.totalCLP)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {serviciosBilling && serviciosBilling.rows.length > 0 && (
        <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-muted/20">
            <span className="text-[12px] font-semibold">Servicios adicionales (a nivel cliente)</span>
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {serviciosBilling.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/20">
                  <td className="px-4 py-1.5">{r.label}</td>
                  <td className="text-right px-3 py-1.5 font-mono">{r.qty.toLocaleString("es-CL")} <span className="text-muted-foreground text-[10px]">{r.unit}</span></td>
                  <td className="text-right px-4 py-1.5 font-mono">{fmtCLP(r.totalCLP)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {transporteError && (
        <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex items-center justify-between gap-2">
          {transporteError}
          <Button variant="ghost" size="sm" onClick={onRetryTransporte} className="h-6 text-[10px] px-2">Reintentar</Button>
        </div>
      )}

      {transporteOps.length > 0 && (
        <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-muted/20 flex items-center justify-between">
            <span className="text-[12px] font-semibold">Transporte (Incomex)</span>
            <span className="text-[11px] text-muted-foreground">{transporteOps.length} viajes</span>
          </div>
          <table className="w-full text-[12px]">
            <tbody>
              {transporteOps.map(op => (
                <tr key={op.id} className="border-b border-border/20">
                  <td className="px-4 py-1.5">{fmtDateDisplay(op.fecha)} — {op.tipo_movimiento ?? op.detalle_carga ?? "Viaje"}</td>
                  <td className="text-right px-3 py-1.5 font-mono text-muted-foreground">{op.guia_numero ?? ""}</td>
                  <td className="text-right px-4 py-1.5 font-mono">{fmtUF(op.factura_cliente_uf ?? 0)} UF</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border/60 bg-primary/5 font-bold">
                <td colSpan={2} className="px-4 py-2 text-[12px]">TOTAL TRANSPORTE</td>
                <td className="text-right px-4 py-2 font-mono text-[12px] text-primary">{fmtCLP(transporteTotalCLP)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {hasMin && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-300 dark:border-amber-700 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">Facturación mínima aplicada (una vez por cliente)</span>
          <span className="text-[12px] font-bold text-amber-700 dark:text-amber-400 font-mono">{fmtCLP(minimoCLP)}</span>
        </div>
      )}

      <div className="bg-primary/5 rounded-xl border-2 border-primary/30 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-bold">TOTAL GENERAL</span>
        <span className="text-lg font-bold text-primary font-mono">{fmtCLP(totalCLP)}</span>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function HesPage() {
  const [clientes,         setClientes]         = useState<Cliente[]>([])
  const [search,           setSearch]           = useState("")
  const [selectedId,       setSelectedId]       = useState<string | null>(null)
  const [tarifas,          setTarifas]          = useState<TarifaCliente[]>([])
  const [selectedTarifaId, setSelectedTarifaId] = useState<string | null>(null)
  const [servicios,        setServicios]        = useState<ServicioCliente[]>([])
  const [serviciosOpen,    setServiciosOpen]    = useState(true)
  const [srvCantidades,    setSrvCantidades]    = useState<Record<string, number>>({})
  const [movs,             setMovs]             = useState<MovRaw[]>([])
  const [selectedMonth,    setSelectedMonth]    = useState(CURRENT_MONTH)
  const [selectedYear,     setSelectedYear]     = useState(CURRENT_YEAR)
  const [ufValue,          setUfValue]          = useState<string>("")
  const [ufLoading,        setUfLoading]        = useState(true)
  const [ufError,          setUfError]          = useState<string | null>(null)
  const [ufDate,           setUfDate]           = useState<string>(TODAY_ISO)
  const [ufRetryTick,      setUfRetryTick]      = useState(0)
  const ufDateInputRef = useRef<HTMLInputElement>(null)
  // tarifaDialog: undefined=cerrado | null=nueva tarifa | TarifaCliente=editar existente
  const [tarifaDialog,     setTarifaDialog]     = useState<TarifaCliente | null | undefined>(undefined)
  // servicioDialog: undefined=cerrado | null=nuevo | ServicioCliente=editar existente
  const [servicioDialog,   setServicioDialog]   = useState<ServicioCliente | null | undefined>(undefined)
  const [srvChecked,       setSrvChecked]       = useState<Record<string, boolean>>({})
  const [loading,          setLoading]          = useState(false)
  const [tarifasLoading,   setTarifasLoading]   = useState(false)
  const [exporting,        setExporting]        = useState(false)
  const ensureFolioPromiseRef = useRef<Promise<{ numero: number; id: string } | null> | null>(null)
  const [showPreview,      setShowPreview]      = useState(false)
  const [showSendDialog,   setShowSendDialog]   = useState(false)
  const [toast,            setToast]            = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const [folioNumero,      setFolioNumero]      = useState<number | null>(null)
  const [folioId,          setFolioId]          = useState<string | null>(null)
  const [existingFolios,   setExistingFolios]   = useState<HesFolio[]>([])
  const [transporteOps,    setTransporteOps]    = useState<TransporteIncomex[]>([])
  const [transporteError,  setTransporteError]  = useState<string | null>(null)
  const [rangoPersonalizado, setRangoPersonalizado] = useState(false)
  const [customStart,       setCustomStart]       = useState("")
  const [customEnd,         setCustomEnd]         = useState("")
  const [previewTab,       setPreviewTab]       = useState<"resumen" | "detalle">("resumen")
  const [previewLoading,   setPreviewLoading]   = useState(false)
  const [previewError,     setPreviewError]     = useState<string | null>(null)
  const [previewSheet,     setPreviewSheet]     = useState<PreviewSheet | null>(null)
  const [previewBlob,      setPreviewBlob]      = useState<Blob | null>(null)
  // Modo unificado: varias hojas (una por tarifa/CI + resumen general) en el mismo archivo
  const [previewSheets,    setPreviewSheets]    = useState<{ name: string; sheet: PreviewSheet }[]>([])
  const [activeSheetIdx,   setActiveSheetIdx]   = useState(0)
  const [resumenLoading,   setResumenLoading]   = useState(false)
  const [resumenError,     setResumenError]     = useState<string | null>(null)
  const [resumenUrl,       setResumenUrl]       = useState<string | null>(null)
  const [resumenBlob,      setResumenBlob]      = useState<Blob | null>(null)
  const [clientesLoaded,   setClientesLoaded]   = useState(false)
  const [tarifaMap,        setTarifaMap]        = useState<Record<string, boolean>>({})
  const [unifiedResults,   setUnifiedResults]   = useState<{ tarifa: TarifaCliente; hes: HesResult; billing: BillingResult }[]>([])
  const [unifiedLoading,   setUnifiedLoading]   = useState(false)
  const [unifiedError,     setUnifiedError]     = useState<string | null>(null)

  const TODAS = "__todas__"
  const isUnificado = selectedTarifaId === TODAS

  // Tarifa actualmente seleccionada (derivada) — null en modo "Ver todas"
  const tarifa = useMemo<TarifaCliente | null>(
    () => isUnificado ? null : (tarifas.find(t => t.id === selectedTarifaId) ?? tarifas[0] ?? null),
    [tarifas, selectedTarifaId, isUnificado]
  )

  const selectedCliente = useMemo(() => clientes.find(c => c.id === selectedId) ?? null, [clientes, selectedId])

  // Ciclo de facturación del cliente (por defecto mes calendario). Clientes
  // como PROQUIMIN facturan en ciclos rodantes (ej. 26 de un mes a 25 del
  // siguiente) — ver dia_corte_facturacion en la tabla clientes. Un rango
  // personalizado (ej. el cliente solo usó bodegaje una parte del mes) pisa
  // el período calculado — el resto del flujo (cálculo, preview, export,
  // envío) sigue igual, solo cambia la ventana de fechas que se usa.
  const periodo = useMemo(() => {
    if (rangoPersonalizado && customStart && customEnd && customStart <= customEnd) {
      return { start: customStart, end: customEnd }
    }
    return getPeriodRange(selectedYear, selectedMonth, selectedCliente?.dia_corte_facturacion ?? 1)
  }, [rangoPersonalizado, customStart, customEnd, selectedYear, selectedMonth, selectedCliente])

  // ── Fetch UF de la fecha seleccionada ───────────────────────────────────────
  // 1) caché en Supabase (uf_valores) — la UF de un día pasado nunca cambia,
  //    así que una vez obtenida no se vuelve a pedir a ninguna API externa.
  // 2) mindicador.cl (histórico por fecha) con un reintento ante fallas
  //    transitorias — es una API pública gratuita, a veces lenta/inestable.
  // 3) si falla y la fecha es HOY, respaldo con api.gael.cloud (otro proveedor,
  //    sin key, pero solo entrega el valor del día actual).
  // Si todo falla, se avisa y el input de UF queda editable a mano.
  useEffect(() => {
    let cancelled = false
    let activeController: AbortController | null = null
    setUfLoading(true)
    setUfError(null)
    setUfValue("")

    const supabase = createClient()
    const [y, m, d] = ufDate.split("-")
    const mindicadorUrl = `https://mindicador.cl/api/uf/${d}-${m}-${y}`

    async function fetchFromMindicador(): Promise<number> {
      const controller = new AbortController()
      activeController = controller
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const r = await fetch(mindicadorUrl, { signal: controller.signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        const val = data?.serie?.[0]?.valor
        if (typeof val !== "number") throw new Error("Respuesta inesperada de mindicador.cl")
        return val
      } finally {
        clearTimeout(timeout)
      }
    }

    async function fetchFromGaelCloud(): Promise<number> {
      const controller = new AbortController()
      activeController = controller
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const r = await fetch("https://api.gael.cloud/general/public/monedas", { signal: controller.signal })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        const raw = Array.isArray(data) ? data.find((i: { Codigo?: string }) => i.Codigo === "UF")?.Valor : null
        const val = typeof raw === "string" ? parseFloat(raw.replace(/\./g, "").replace(",", ".")) : NaN
        if (!Number.isFinite(val)) throw new Error("Respuesta inesperada de gael.cloud")
        return val
      } finally {
        clearTimeout(timeout)
      }
    }

    function cacheValue(val: number) {
      supabase.from("uf_valores").upsert({ fecha: ufDate, valor: val }, { onConflict: "fecha" })
        .then(({ error }) => { if (error) console.error("[hes] error cacheando UF:", error) })
    }

    async function run() {
      try {
        const { data: cached } = await supabase.from("uf_valores").select("valor").eq("fecha", ufDate).maybeSingle()
        if (cancelled) return
        if (cached?.valor != null) {
          setUfValue(Number(cached.valor).toFixed(2))
          setUfLoading(false)
          return
        }

        try {
          const val = await fetchFromMindicador()
          if (cancelled) return
          setUfValue(val.toFixed(2))
          cacheValue(val)
          return
        } catch {
          if (cancelled) return
          await new Promise(res => setTimeout(res, 1500))
          if (cancelled) return
          try {
            const val = await fetchFromMindicador()
            if (cancelled) return
            setUfValue(val.toFixed(2))
            cacheValue(val)
            return
          } catch (err) {
            console.error("[hes] error obteniendo UF de mindicador.cl:", err)
          }
        }

        if (ufDate === TODAY_ISO) {
          try {
            const val = await fetchFromGaelCloud()
            if (cancelled) return
            setUfValue(val.toFixed(2))
            cacheValue(val)
            return
          } catch (err) {
            console.error("[hes] error obteniendo UF de gael.cloud:", err)
          }
        }

        if (!cancelled) setUfError("No se pudo obtener la UF automáticamente. Ingrésala manualmente o reintenta.")
      } finally {
        if (!cancelled) setUfLoading(false)
      }
    }

    run()

    return () => { cancelled = true; activeController?.abort() }
  }, [ufDate, ufRetryTick])

  function openUfDatePicker() {
    const el = ufDateInputRef.current
    if (!el) return
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return } catch { /* fall through */ }
    }
    el.click()
  }

  // ── Load clientes + tarifa map ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("clientes").select("id, nombre, rut, emails, contacto, dia_corte_facturacion").eq("activo", true).order("nombre"),
      supabase.from("tarifas_cliente").select("cliente_id").eq("activo", true),
    ]).then(([{ data: cls, error: clsErr }, { data: tars, error: tarsErr }]) => {
      if (clsErr) console.error("[hes] error cargando clientes:", clsErr)
      if (tarsErr) console.error("[hes] error cargando tarifas_cliente:", tarsErr)
      setClientes((cls ?? []) as unknown as Cliente[])
      const map: Record<string, boolean> = {}
      for (const t of tars ?? []) map[t.cliente_id] = true
      setTarifaMap(map)
      setClientesLoaded(true)
    })
  }, [])

  // ── Load tarifas for selected client ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setTarifas([]); setSelectedTarifaId(null); return }
    setTarifasLoading(true)
    const supabase = createClient()
    supabase.from("tarifas_cliente").select("*").eq("cliente_id", selectedId).eq("activo", true).order("cotizacion_numero")
      .then(({ data, error }) => {
        if (error) console.error("[hes] error cargando tarifas:", error)
        const list = (data ?? []) as TarifaCliente[]
        setTarifas(list)
        setSelectedTarifaId(list.length > 1 ? TODAS : (list[0]?.id ?? null))
        setTarifasLoading(false)
      })
  }, [selectedId])

  // ── Load servicios for selected client ──────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setServicios([]); setSrvCantidades({}); setSrvChecked({}); return }
    const supabase = createClient()
    supabase.from("servicios_cliente").select("*")
      .eq("cliente_id", selectedId).eq("activo", true)
      .order("orden").order("nombre")
      .then(({ data, error }) => {
        if (error) console.error("[hes] error cargando servicios:", error)
        const list = (data ?? []) as ServicioCliente[]
        setServicios(list)
        setSrvCantidades({})
        // Todos los servicios comienzan marcados (incluidos en cobro)
        const checked: Record<string, boolean> = {}
        for (const s of list) checked[s.id] = true
        setSrvChecked(checked)
      })
  }, [selectedId])

  // ── Load movimientos for selected client + year ────────────────────────────
  const loadMovimientos = useCallback(async () => {
    if (!selectedId || !tarifa) { setMovs([]); return }
    setLoading(true)
    setMovs([])  // reset to prevent stale prior-client data during fetch
    const supabase = createClient()
    // Use first instant of the day after the period's last day with .lt() to
    // include the entire last day (el período puede no coincidir con el mes
    // calendario si el cliente tiene un día de corte propio, ej. PROQUIMIN).
    const [endY, endM, endD] = periodo.end.split("-").map(Number)
    const nextDay = new Date(endY, endM - 1, endD + 1)
    let query = supabase
      .from("movimientos")
      .select("id, numero, tipo, unidades, operador, fecha, report_id, reports(numero, sec1_guia_numero, sec3_numero_guia)")
      .eq("cliente_id", selectedId)
      .lt("fecha", nextDay.toISOString())
    // Clientes con más de una tarifa en paralelo (ej. PROQUIMIN) deben tener
    // sus movimientos etiquetados con a cuál pertenecen — de lo contrario se
    // mezclarían pallets de productos distintos en un mismo HES. Con una sola
    // tarifa activa, se incluyen también movimientos viejos sin etiquetar.
    query = tarifas.length > 1
      ? query.eq("tarifa_cliente_id", tarifa.id)
      : query.or(`tarifa_cliente_id.eq.${tarifa.id},tarifa_cliente_id.is.null`)
    const { data } = await query.order("fecha")
    setMovs((data as unknown as MovRaw[]) ?? [])
    setLoading(false)
  }, [selectedId, periodo, tarifa, tarifas.length])

  useEffect(() => { loadMovimientos() }, [loadMovimientos])

  // ── Modo "Ver todas" — calcula HES+cobro para cada tarifa del cliente ──────
  const loadUnificado = useCallback(async () => {
    if (!selectedId || !isUnificado || tarifas.length === 0) { setUnifiedResults([]); return }
    setUnifiedLoading(true)
    setUnifiedError(null)
    const supabase = createClient()
    const [endY, endM, endD] = periodo.end.split("-").map(Number)
    const nextDay = new Date(endY, endM - 1, endD + 1)
    try {
      // Un solo query para todos los movimientos del período, particionado por
      // tarifa en memoria — antes era 1 query por tarifa (N+1 innecesario, cada
      // una repitiendo el mismo rango de fecha sobre la misma tabla).
      const { data, error } = await supabase
        .from("movimientos")
        .select("id, numero, tipo, unidades, operador, fecha, report_id, tarifa_cliente_id, reports(numero, sec1_guia_numero, sec3_numero_guia)")
        .eq("cliente_id", selectedId)
        .lt("fecha", nextDay.toISOString())
        .order("fecha")
      if (error) throw error
      const allMovs = (data as unknown as (MovRaw & { tarifa_cliente_id: string | null })[]) ?? []
      const results = tarifas.map(t => {
        const movs = tarifas.length > 1
          ? allMovs.filter(m => m.tarifa_cliente_id === t.id)
          : allMovs.filter(m => m.tarifa_cliente_id === t.id || m.tarifa_cliente_id == null)
        const tarifaAlmacenaje = t.moneda === "CLP" ? (t.tarifa_almacenaje_clp ?? 0) : (t.tarifa_almacenaje_uf ?? 0)
        const hesResult = computeHES(movs, periodo.start, periodo.end, tarifaAlmacenaje)
        // Los servicios adicionales son a nivel cliente, no por tarifa — no se
        // duplican en cada tarjeta, se muestran una sola vez en el total general.
        const billingResult = computeBilling(hesResult, t, parseFloat(ufValue) || 0, [], {})
        return { tarifa: t, hes: hesResult, billing: billingResult }
      })
      setUnifiedResults(results)
    } catch {
      setUnifiedError("No se pudieron calcular todas las tarifas.")
    } finally {
      setUnifiedLoading(false)
    }
  }, [selectedId, periodo, tarifas, isUnificado, ufValue])

  useEffect(() => { loadUnificado() }, [loadUnificado])

  // ── HES ya generados este mes para este cliente (indicador, evita
  // generar/enviar dos veces sin darse cuenta) ────────────────────────────
  const loadExistingFolios = useCallback(async () => {
    setExistingFolios([]) // evita mostrar folios del cliente anterior mientras carga
    if (!selectedId) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from("hes_folios")
      .select("*")
      .eq("cliente_id", selectedId)
      .eq("mes", selectedMonth)
      .eq("anio", selectedYear)
      .order("numero", { ascending: false })
    if (error) { console.error("[hes] error cargando folios existentes:", error); return }
    setExistingFolios((data ?? []) as HesFolio[])
  }, [selectedId, selectedMonth, selectedYear])

  useEffect(() => { loadExistingFolios() }, [loadExistingFolios])

  // ── Viajes de transporte subcontratado (Incomex) del cliente en el período —
  // solo lectura acá: el servidor vuelve a consultarlos él solo al generar.
  const loadTransporteOps = useCallback(async () => {
    setTransporteOps([]) // evita atribuir viajes del cliente/periodo anterior mientras carga
    setTransporteError(null)
    if (!selectedId) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from("transporte_incomex")
      .select("*")
      .eq("cliente_id", selectedId)
      .eq("activo", true)
      .gte("fecha", periodo.start)
      .lte("fecha", periodo.end)
      .order("fecha")
    if (error) { setTransporteError("No se pudo cargar transporte Incomex: " + error.message); return }
    setTransporteOps((data ?? []) as TransporteIncomex[])
  }, [selectedId, periodo])

  useEffect(() => { loadTransporteOps() }, [loadTransporteOps])

  const transporteTotalUF = useMemo(
    () => transporteOps.reduce((sum, t) => sum + (t.factura_cliente_uf ?? 0), 0),
    [transporteOps]
  )
  const transporteTotalCLP = useMemo(
    () => transporteTotalUF * (parseFloat(ufValue) || 0),
    [transporteTotalUF, ufValue]
  )

  // ── Compute HES ────────────────────────────────────────────────────────────
  const hes = useMemo<HesResult | null>(() => {
    if (!selectedId || movs.length === 0) return null
    const tarifaAlmacenaje = tarifa?.moneda === "CLP" ? (tarifa?.tarifa_almacenaje_clp ?? 0) : (tarifa?.tarifa_almacenaje_uf ?? 0)
    return computeHES(movs, periodo.start, periodo.end, tarifaAlmacenaje)
  }, [movs, selectedId, periodo, tarifa])

  // ── Billing summary ────────────────────────────────────────────────────────
  const billing = useMemo(() => {
    if (!hes || !tarifa) return null
    const seleccion: Record<string, { cantidad: number; checked: boolean }> = {}
    for (const srv of servicios) {
      seleccion[srv.id] = { cantidad: srvCantidades[srv.id] ?? 0, checked: srvChecked[srv.id] ?? true }
    }
    return computeBilling(hes, tarifa, parseFloat(ufValue) || 0, servicios, seleccion)
  }, [hes, tarifa, ufValue, servicios, srvCantidades, srvChecked])

  // Total real: la facturación mínima debe aplicar sobre bodegaje+servicios+transporte
  // sumados, no solo sobre bodegaje con transporte agregado después del piso
  // (eso sobrecobraría cuando bodegaje solo queda bajo el mínimo).
  const grandTotal = useMemo(() => {
    if (!billing || !tarifa) return null
    const uf = parseFloat(ufValue) || 0
    const minCLP = (tarifa.facturacion_minima_uf ?? 0) * uf
    const subtotalCLP = billing.totalCLP + transporteTotalCLP
    const totalCLP = Math.max(subtotalCLP, minCLP)
    return { totalCLP, totalUF: uf > 0 ? totalCLP / uf : 0, minCLP, hasMin: totalCLP > subtotalCLP }
  }, [billing, tarifa, ufValue, transporteTotalCLP])

  // ── Modo "Ver todas" — servicios (a nivel cliente) + total general ─────────
  const unifiedServiciosBilling = useMemo(() => {
    if (!isUnificado) return null
    const seleccion: Record<string, { cantidad: number; checked: boolean }> = {}
    for (const srv of servicios) {
      seleccion[srv.id] = { cantidad: srvCantidades[srv.id] ?? 0, checked: srvChecked[srv.id] ?? true }
    }
    const emptyHes: HesResult = { palletDays: 0, totalIngresos: 0, totalDespachos: 0, dailyLog: [] }
    // Tipado completo (sin "as unknown as") a propósito: si TarifaCliente gana
    // un campo nuevo que computeBilling llegue a leer, esto deja de compilar
    // en vez de devolver undefined en silencio.
    const dummyTarifa: TarifaCliente = {
      id: "", cliente_id: "", cotizacion_numero: "", clase_imo: null, moneda: "UF",
      tarifa_almacenaje_uf: null, tarifa_inout_uf: null, tarifa_almacenaje_clp: null, tarifa_inout_clp: null,
      tarifa_descons_20_uf: null, tarifa_descons_40_uf: null, tarifa_consolid_40_uf: null,
      tarifa_porteo_uf: null, tarifa_palletizado_uf: null, facturacion_minima_uf: null,
      activo: true, created_at: "",
    }
    return computeBilling(emptyHes, dummyTarifa, parseFloat(ufValue) || 0, servicios, seleccion)
  }, [isUnificado, servicios, srvCantidades, srvChecked, ufValue])

  // La facturación mínima es un piso por CLIENTE (el mayor mínimo entre sus
  // tarifas activas), no por cada clase IMO — se aplica una sola vez acá
  // contra la suma real de todas las clases + servicios + transporte,
  // nunca dentro de cada tarjeta/hoja individual (ver billing.totalCLP,
  // no finalCLP, usado abajo y en UnifiedResumenCards/el PDF).
  const unifiedMinimoUnicoUF = useMemo(
    () => Math.max(0, ...unifiedResults.map(r => r.tarifa.facturacion_minima_uf ?? 0)),
    [unifiedResults]
  )
  const unifiedSubtotalCLP = useMemo(
    () => unifiedResults.reduce((s, r) => s + r.billing.totalCLP, 0) + (unifiedServiciosBilling?.finalCLP ?? 0) + transporteTotalCLP,
    [unifiedResults, unifiedServiciosBilling, transporteTotalCLP]
  )
  const unifiedSubtotalUF = useMemo(
    () => unifiedResults.reduce((s, r) => s + r.billing.totalUF, 0) + (unifiedServiciosBilling?.finalUF ?? 0) + transporteTotalUF,
    [unifiedResults, unifiedServiciosBilling, transporteTotalUF]
  )
  const unifiedMinimoUnicoCLP = unifiedMinimoUnicoUF * (parseFloat(ufValue) || 0)
  const unifiedHasMin = unifiedMinimoUnicoCLP > unifiedSubtotalCLP

  const unifiedTotalCLP = Math.max(unifiedSubtotalCLP, unifiedMinimoUnicoCLP)
  const unifiedTotalUF  = Math.max(unifiedSubtotalUF,  unifiedMinimoUnicoUF)

  // ── Filtered clients ───────────────────────────────────────────────────────
  const filteredClientes = useMemo(() =>
    clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()) || (c.rut?.includes(search) ?? false)),
    [clientes, search]
  )



  // ── Export Excel ───────────────────────────────────────────────────────────
  // Cuando hay un rango personalizado activo, se manda también al servidor
  // — de lo contrario el servidor recalcularía el período completo del mes
  // (o del ciclo de facturación del cliente) e ignoraría la selección.
  function periodOverride() {
    return rangoPersonalizado && customStart && customEnd && customStart <= customEnd
      ? { periodStart: customStart, periodEnd: customEnd }
      : {}
  }

  async function fetchHesExcel(folioOverride?: number | null): Promise<Blob> {
    // El servidor relee cliente/tarifa/servicios/movimientos de la base y
    // recalcula todo — solo se manda la selección (qué servicios opcionales
    // incluir y en qué cantidad), que es una decisión real del usuario, no
    // un total fabricable.
    const servicioSeleccion: Record<string, { cantidad: number; checked: boolean }> = {}
    for (const s of servicios) {
      servicioSeleccion[s.id] = { cantidad: srvCantidades[s.id] ?? 0, checked: srvChecked[s.id] ?? true }
    }
    const folioNum = folioOverride ?? folioNumero
    const res = await fetch("/api/hes/export", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(isUnificado ? {
        clienteId: selectedCliente!.id,
        tarifaIds: tarifas.map(t => t.id),
        mes:       selectedMonth,
        anio:      selectedYear,
        ufValue,
        servicioSeleccion,
        folioNumero: folioNum,
        ...periodOverride(),
      } : {
        clienteId: selectedCliente!.id,
        tarifaId:  tarifa!.id,
        mes:       selectedMonth,
        anio:      selectedYear,
        ufValue,
        servicioSeleccion,
        folioNumero: folioNum,
        ...periodOverride(),
      }),
    })
    if (!res.ok) throw new Error("Error al generar Excel")
    return res.blob()
  }

  // ── Enviar HES por correo al email de contacto del cliente ─────────────────
  // El folio se asigna recién acá (si no se asignó ya por una descarga previa
  // en esta misma vista previa) — solo abrir la vista previa no debe consumir
  // un número de folio, solo descargar o enviar de verdad.
  async function handleSendEmail(adjuntos: { resumen: boolean; detalle: boolean }) {
    if (!selectedCliente) return { success: false, error: "Sin cliente seleccionado." }
    if (!(parseFloat(ufValue) > 0)) return { success: false, error: "Falta un valor de UF válido para generar el HES." }
    const folio = await ensureFolio()
    const servicioSeleccion: Record<string, { cantidad: number; checked: boolean }> = {}
    for (const s of servicios) {
      servicioSeleccion[s.id] = { cantidad: srvCantidades[s.id] ?? 0, checked: srvChecked[s.id] ?? true }
    }
    try {
      const res = await fetch("/api/hes/send-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(isUnificado ? {
          clienteId: selectedCliente.id,
          tarifaIds: tarifas.map(t => t.id),
          mes: selectedMonth, anio: selectedYear, ufValue, ufDate,
          servicioSeleccion, adjuntos, folioNumero: folio?.numero ?? null, folioId: folio?.id ?? null,
          ...periodOverride(),
        } : {
          clienteId: selectedCliente.id,
          tarifaId:  tarifa!.id,
          mes: selectedMonth, anio: selectedYear, ufValue, ufDate,
          servicioSeleccion, adjuntos, folioNumero: folio?.numero ?? null, folioId: folio?.id ?? null,
          ...periodOverride(),
        }),
      })
      const json = await res.json()
      if (!res.ok) return { success: false, error: json.error ?? "No se pudo enviar el correo." }
      loadExistingFolios() // refresca para reflejar el enviado_a/enviado_at
      return { success: true, enviadoA: json.enviadoA as string[] }
    } catch {
      return { success: false, error: "No se pudo enviar el correo." }
    }
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a   = document.createElement("a")
    a.href    = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Resumen (PDF): datos de cliente + cobro, sin el detalle día a día — se
  // genera 100% en el cliente, no requiere ida y vuelta al servidor.
  // En modo "Ver todas" el PDF trae una fila por CI + servicios + total general,
  // con el mismo formato que el resumen de una sola tarifa.
  async function generateResumen(folioOverride?: number | null): Promise<Blob | null> {
    if (!selectedCliente) return null
    if (isUnificado ? tarifas.length === 0 : (!tarifa || (!billing && transporteOps.length === 0))) return null
    const folioNum = folioOverride ?? folioNumero
    setResumenLoading(true)
    setResumenError(null)
    try {
      const { pdf } = await import("@react-pdf/renderer")
      const clienteData = {
        nombre:   selectedCliente.nombre,
        rut:      selectedCliente.rut ?? "",
        emails:   selectedCliente.emails,
        contacto: selectedCliente.contacto,
      }
      let blob: Blob
      if (isUnificado) {
        const { HesResumenUnificadoPDF } = await import("@/components/hes/hes-resumen-unificado-pdf")
        const filas: { label: string; cotizacion: string | null; totalUF: number; totalCLP: number }[] = unifiedResults
          .filter(r => r.billing.totalUF > 0 || r.billing.totalCLP > 0)
          .map(r => ({
            label:      r.tarifa.clase_imo ?? r.tarifa.cotizacion_numero,
            cotizacion: r.tarifa.cotizacion_numero,
            totalUF:    r.billing.totalUF,
            totalCLP:   r.billing.totalCLP,
          }))
        for (const sr of unifiedServiciosBilling?.rows ?? []) {
          filas.push({
            label:      `Servicio: ${sr.label}`,
            cotizacion: null,
            totalUF:    sr.moneda === "CLP" ? 0 : sr.totalCLP / (parseFloat(ufValue) || 1),
            totalCLP:   sr.totalCLP,
          })
        }
        if (transporteOps.length > 0) {
          filas.push({ label: "Transporte", cotizacion: null, totalUF: transporteTotalUF, totalCLP: transporteTotalCLP })
        }
        if (unifiedHasMin) {
          filas.push({ label: "Facturación mínima aplicada (una vez por cliente)", cotizacion: null, totalUF: unifiedMinimoUnicoUF, totalCLP: unifiedMinimoUnicoCLP })
        }
        blob = await pdf(
          <HesResumenUnificadoPDF data={{
            cliente: clienteData,
            filas,
            totalUF:  unifiedTotalUF,
            totalCLP: unifiedTotalCLP,
            mes: selectedMonth,
            anio: selectedYear,
            ufValue,
            ufDate,
            logoSrc: `${window.location.origin}/adp_logo_hd.png`,
            folioNumero: folioNum,
          }} />
        ).toBlob()
      } else {
        const { HesResumenPDF } = await import("@/components/hes/hes-resumen-pdf")
        const baseBilling = billing ?? { rows: [], finalUF: 0, finalCLP: 0, hasMin: false }
        const billingConTransporte = transporteOps.length === 0 ? baseBilling : {
          ...baseBilling,
          rows: [...baseBilling.rows, { label: "Transporte", qty: transporteOps.length, unit: "viaje", moneda: "UF" as const, tarifa: 0, totalCLP: transporteTotalCLP }],
          // La mínima debe aplicar sobre bodegaje+transporte sumados, no solo
          // sobre bodegaje con transporte agregado después del piso.
          finalUF:  grandTotal?.totalUF  ?? baseBilling.finalUF,
          finalCLP: grandTotal?.totalCLP ?? baseBilling.finalCLP,
          hasMin:   grandTotal?.hasMin   ?? baseBilling.hasMin,
        }
        blob = await pdf(
          <HesResumenPDF data={{
            cliente: clienteData,
            tarifa: { cotizacion_numero: tarifa!.cotizacion_numero, clase_imo: tarifa!.clase_imo },
            billing: billingConTransporte,
            mes: selectedMonth,
            anio: selectedYear,
            ufValue,
            ufDate,
            logoSrc: `${window.location.origin}/adp_logo_hd.png`,
            folioNumero: folioNum,
          }} />
        ).toBlob()
      }
      setResumenBlob(blob)
      setResumenUrl(URL.createObjectURL(blob))
      return blob
    } catch {
      setResumenError("No se pudo generar el resumen.")
      return null
    } finally {
      setResumenLoading(false)
    }
  }

  // Detalle (Excel): genera el .xlsx real y lo parsea en el cliente para
  // renderizarlo tal cual quedará el archivo descargado (mismas fusiones, colores y formatos).
  // En modo "Ver todas" el archivo trae varias hojas (resumen general + una por CI).
  async function generateDetalle(folioOverride?: number | null): Promise<Blob | null> {
    if (isUnificado ? (tarifas.length === 0) : (!selectedCliente || !tarifa || (!billing && transporteOps.length === 0))) return null
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const blob = await fetchHesExcel(folioOverride)
      setPreviewBlob(blob)
      const sheets = await buildAllPreviewSheets(await blob.arrayBuffer())
      setPreviewSheets(sheets)
      setActiveSheetIdx(0)
      setPreviewSheet(sheets[0]?.sheet ?? null)
      return blob
    } catch {
      setPreviewError("No se pudo generar la vista previa del Excel.")
      return null
    } finally {
      setPreviewLoading(false)
    }
  }

  // Asigna un folio correlativo nuevo para este HES — solo la primera vez que
  // se descarga o se envía de verdad (no solo abrir la vista previa). Si ya
  // se asignó uno en esta misma sesión de vista previa, se reutiliza (bajar
  // el Excel y después mandarlo por correo es el mismo documento, no dos).
  // Si falla la asignación, no bloquea: el documento sale sin número.
  async function ensureFolio(): Promise<{ numero: number; id: string } | null> {
    if (folioNumero != null && folioId != null) return { numero: folioNumero, id: folioId }
    if (!selectedCliente) return null
    // Descargar y Enviar pueden disparar ensureFolio casi al mismo tiempo (dos
    // modales distintos, cada uno con su propio "disabled"); sin este candado
    // ambas llamadas verían folioNumero/folioId aún null y crearían 2 folios.
    if (ensureFolioPromiseRef.current) return ensureFolioPromiseRef.current
    const promise = ensureFolioImpl(selectedCliente)
    ensureFolioPromiseRef.current = promise
    try {
      return await promise
    } finally {
      ensureFolioPromiseRef.current = null
    }
  }

  async function ensureFolioImpl(selectedCliente: Cliente): Promise<{ numero: number; id: string } | null> {
    try {
      const res = await fetch("/api/hes/folio", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(isUnificado ? {
          clienteId: selectedCliente.id,
          tarifaIds: tarifas.map(t => t.id),
          mes: selectedMonth, anio: selectedYear,
          periodStart: periodo.start, periodEnd: periodo.end,
          totalUF: unifiedTotalUF, totalCLP: unifiedTotalCLP,
        } : {
          clienteId: selectedCliente.id,
          tarifaId:  tarifa!.id,
          mes: selectedMonth, anio: selectedYear,
          periodStart: periodo.start, periodEnd: periodo.end,
          totalUF: grandTotal?.totalUF || null,
          totalCLP: grandTotal?.totalCLP || null,
        }),
      })
      if (!res.ok) return null
      const json = await res.json()
      setFolioNumero(json.numero)
      setFolioId(json.id)
      loadExistingFolios() // refresca el indicador de "ya generado este mes"
      return { numero: json.numero, id: json.id }
    } catch {
      return null
    }
  }

  // Adelanta cuál sería el próximo folio (sin gastarlo — no inserta nada,
  // solo mira el último número asignado) para mostrarlo en la vista previa.
  // Es solo referencial: el número real se asigna recién al descargar o
  // enviar, y si otra persona genera un HES justo en el medio, puede diferir.
  async function peekFolio(): Promise<number | null> {
    try {
      const supabase = createClient()
      const { data } = await supabase.from("hes_folios").select("numero").order("numero", { ascending: false }).limit(1)
      const next = (data?.[0]?.numero ?? 0) + 1
      setFolioNumero(next)
      return next
    } catch {
      return null
    }
  }

  // Abre la vista previa con la pestaña Resumen por defecto — el folio que
  // se ve es solo provisorio hasta descargar o enviar de verdad. Se pasa
  // explícito a generateResumen/generateDetalle porque el estado recién
  // seteado (setFolioNumero) no está disponible todavía en este closure.
  async function openPreview() {
    if (isUnificado ? (tarifas.length === 0 || unifiedResults.length === 0) : (!selectedCliente || !tarifa || (!billing && transporteOps.length === 0))) return
    setShowPreview(true)
    setPreviewTab("resumen")
    setPreviewError(null); setPreviewSheet(null); setPreviewBlob(null); setPreviewSheets([]); setActiveSheetIdx(0)
    setResumenError(null); setResumenUrl(null); setResumenBlob(null)
    setFolioNumero(null); setFolioId(null)
    const provisional = await peekFolio()
    await generateResumen(provisional)
    // En modo unificado no hay PDF de resumen — el único archivo descargable
    // es el Excel, así que se pre-genera de una vez (sin esperar a que abran
    // la pestaña Detalle) para que "Descargar" funcione desde cualquier pestaña.
    if (isUnificado) await generateDetalle(provisional)
  }

  function selectPreviewTab(tab: "resumen" | "detalle") {
    setPreviewTab(tab)
    if (tab === "detalle" && !previewBlob && !previewLoading) generateDetalle(folioNumero)
  }

  function closePreview() {
    setShowPreview(false)
    if (resumenUrl) URL.revokeObjectURL(resumenUrl)
    setResumenUrl(null)
    setResumenBlob(null)
  }

  // El folio recién se asigna acá — abrir la vista previa no debe gastar un
  // número, solo descargar (o enviar) de verdad. Como el PDF/Excel ya
  // generados durante la vista previa no lo tienen estampado, se regeneran
  // una vez conocido el folio antes de disparar la descarga.
  async function handleDownloadFromPreview() {
    if (!selectedCliente) return
    if (!(parseFloat(ufValue) > 0)) { setToast("Falta un valor de UF válido para generar el HES."); return }
    setExporting(true)
    try {
      const folio = await ensureFolio()
      const suffix = isUnificado ? "_UNIFICADO" : ""
      const filenameBase = `HES_${selectedCliente.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${MESES[selectedMonth].toUpperCase()}_${selectedYear}${suffix}`
      if (previewTab === "resumen") {
        const blob = await generateResumen(folio?.numero ?? null)
        if (!blob) return
        triggerBlobDownload(blob, `${filenameBase}_Resumen.pdf`)
        closePreview()
        setToast("PDF descargado correctamente.")
        return
      }
      const blob = await generateDetalle(folio?.numero ?? null)
      if (!blob) return
      triggerBlobDownload(blob, `${filenameBase}.xlsx`)
      closePreview()
      setToast("Excel descargado correctamente.")
    } finally {
      setExporting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {tarifaDialog !== undefined && selectedCliente && (
        <TarifaDialog
          clienteId={selectedCliente.id}
          clienteNombre={selectedCliente.nombre}
          existing={tarifaDialog}
          onClose={() => setTarifaDialog(undefined)}
          onSaved={t => {
            setTarifas(prev => {
              const idx = prev.findIndex(x => x.id === t.id)
              return idx >= 0 ? prev.with(idx, t) : [...prev, t]
            })
            setSelectedTarifaId(t.id)
            setTarifaMap(m => ({ ...m, [t.cliente_id]: true }))
            setTarifaDialog(undefined)
          }}
        />
      )}

      {servicioDialog !== undefined && selectedCliente && (
        <ServicioDialog
          clienteId={selectedCliente.id}
          clienteNombre={selectedCliente.nombre}
          existing={servicioDialog}
          onClose={() => setServicioDialog(undefined)}
          onSaved={s => {
            setServicios(prev => {
              const idx = prev.findIndex(x => x.id === s.id)
              return idx >= 0 ? prev.with(idx, s) : [...prev, s].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
            })
            setSrvChecked(prev => ({ ...prev, [s.id]: prev[s.id] ?? true }))
            setServicioDialog(undefined)
          }}
          onDeleted={id => {
            setServicios(prev => prev.filter(x => x.id !== id))
            setSrvChecked(prev => { const n = { ...prev }; delete n[id]; return n })
            setSrvCantidades(prev => { const n = { ...prev }; delete n[id]; return n })
            setServicioDialog(undefined)
          }}
        />
      )}

      {showPreview && selectedCliente && (
        <PreviewDialog
          clienteNombre={selectedCliente.nombre}
          activeTab={previewTab}
          onTabChange={selectPreviewTab}
          resumenLoading={resumenLoading}
          resumenError={resumenError}
          resumenUrl={resumenUrl}
          loading={previewLoading}
          error={previewError}
          sheet={previewSheet}
          onClose={closePreview}
          onDownload={handleDownloadFromPreview}
          onOpenSend={() => setShowSendDialog(true)}
          downloading={exporting}
          folioNumero={folioNumero}
          folioIsFinal={folioId != null}
          isUnificado={isUnificado}
          unifiedResults={unifiedResults}
          unifiedServiciosBilling={unifiedServiciosBilling}
          unifiedTotalCLP={unifiedTotalCLP}
          unifiedLoading={unifiedLoading}
          unifiedError={unifiedError}
          previewSheets={previewSheets}
          activeSheetIdx={activeSheetIdx}
          onActiveSheetChange={setActiveSheetIdx}
        />
      )}

      {showSendDialog && selectedCliente && (
        <EnviarHesDialog
          clienteNombre={selectedCliente.nombre}
          emails={selectedCliente.emails}
          onClose={() => setShowSendDialog(false)}
          onSend={handleSendEmail}
          onSent={enviadoA => {
            closePreview()
            setToast(`Correo enviado a ${enviadoA.join(", ")}.`)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white text-[12px] px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {toast}
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden print:overflow-visible">

        {/* ── Panel izquierdo: clientes ── */}
        <div className={cn(
          "md:w-64 w-full md:flex-shrink-0 border-r border-border/60 flex flex-col bg-background print:hidden",
          // En mobile: ocultar lista cuando hay cliente seleccionado
          selectedId ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="h-8 pl-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1 rounded-lg" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!clientesLoaded ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : filteredClientes.map(c => (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/20",
                  selectedId === c.id ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/40"
                )}>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[12px] font-medium truncate", selectedId === c.id && "text-primary")}>{c.nombre}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.rut}</p>
                </div>
                <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", tarifaMap[c.id] ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                {selectedId === c.id && <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Con tarifas configuradas
          </div>
        </div>

        {/* ── Panel derecho ── */}
        <div className={cn("flex-1 flex flex-col min-h-0 overflow-hidden", selectedId ? "flex" : "hidden md:flex")}>
          {!selectedCliente ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecciona un cliente para generar su HES</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border/40 flex-shrink-0 print:hidden gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Volver — solo mobile */}
                  <button onClick={() => setSelectedId(null)} className="md:hidden flex-shrink-0 text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-bold tracking-tight truncate">{selectedCliente.nombre}</h2>
                    <p className="text-[11px] text-muted-foreground truncate">RUT {selectedCliente.rut}{tarifa ? ` · Cot. ${tarifa.cotizacion_numero}` : ""}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  {/* Filtros: tarifa / mes / año / refrescar */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tarifas.length > 1 && (
                      <select value={selectedTarifaId ?? ""} onChange={e => setSelectedTarifaId(e.target.value)}
                        className="h-7 text-[12px] rounded-md border border-border/50 bg-background px-2 focus:outline-none max-w-[180px]">
                        <option value={TODAS}>Ver todas ({tarifas.length})</option>
                        {tarifas.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.clase_imo ? `Cl.${t.clase_imo}` : t.cotizacion_numero}
                          </option>
                        ))}
                      </select>
                    )}
                    <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}
                      className="h-7 text-[12px] rounded-md border border-border/50 bg-background px-2 focus:outline-none">
                      {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}
                      className="h-7 text-[12px] rounded-md border border-border/50 bg-background px-2 focus:outline-none">
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <Button variant="ghost" size="sm" onClick={loadMovimientos} disabled={loading} className="h-7 w-7 p-0 flex-shrink-0">
                      <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                    </Button>
                    <button
                      onClick={() => setRangoPersonalizado(v => !v)}
                      className={cn(
                        "h-7 flex items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
                        rangoPersonalizado
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 text-muted-foreground hover:text-foreground"
                      )}
                      title="Cobrar solo un rango de fechas específico dentro del período"
                    >
                      <CalendarIcon className="h-3 w-3" /> Rango personalizado
                    </button>
                  </div>

                  {rangoPersonalizado && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground">Desde</span>
                      <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                        className="h-7 w-[136px] text-[12px] px-2" />
                      <span className="text-[11px] text-muted-foreground">hasta</span>
                      <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                        className="h-7 w-[136px] text-[12px] px-2" />
                      {customStart && customEnd && customStart > customEnd && (
                        <span className="text-[11px] text-destructive">"Desde" no puede ser después de "hasta"</span>
                      )}
                    </div>
                  )}

                  {/* Acciones: tarifa + generar HES */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isUnificado && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setTarifaDialog(tarifa ?? null)} className="h-7 gap-1.5 text-[11px]">
                          <Settings2 className="h-3 w-3" />
                          {tarifa ? "Editar tarifa" : "Configurar tarifa"}
                        </Button>
                        {tarifa && (
                          <Button variant="ghost" size="sm" onClick={() => setTarifaDialog(null)} className="h-7 gap-1 text-[11px] text-muted-foreground">
                            + Nueva
                          </Button>
                        )}
                      </>
                    )}
                    <Button
                      variant="outline" size="sm"
                      onClick={openPreview}
                      disabled={isUnificado
                        ? (unifiedLoading || unifiedResults.length === 0 || !(parseFloat(ufValue) > 0))
                        : (exporting || resumenLoading || !tarifa || (!billing && transporteOps.length === 0) || !(parseFloat(ufValue) > 0))}
                      className="h-8 sm:h-7 gap-1.5 text-[12px] sm:text-[11px] flex-1 sm:flex-initial justify-center
                        bg-emerald-600 hover:bg-emerald-700 text-white border-0
                        dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:text-white dark:border-0
                        sm:bg-transparent sm:hover:bg-emerald-50 sm:text-emerald-700 sm:border sm:border-emerald-300
                        dark:sm:bg-transparent dark:sm:hover:bg-emerald-900/20 dark:sm:border-emerald-700 dark:sm:text-emerald-400"
                    >
                      {resumenLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      Generar HES
                    </Button>
                  </div>
                </div>
              </div>

              {/* Indicador: ¿ya se generó un HES para este cliente/mes? */}
              {existingFolios.length > 0 && (
                <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-border/40 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 text-[11px] flex-shrink-0 print:hidden flex-wrap">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    Ya se generó HES para {MESES[selectedMonth]} {selectedYear}
                    {existingFolios.length > 1 ? ` (${existingFolios.length} veces, última` : " —"}
                    {" "}N° HES-{String(existingFolios[0].numero).padStart(6, "0")}
                    {existingFolios.length > 1 ? ")" : ""}
                    {" "}el {fmtDateDisplay(existingFolios[0].generado_at.slice(0, 10))}
                  </span>
                </div>
              )}

              {/* HES Document */}
              <div className="flex-1 overflow-y-auto p-5 bg-muted/10">
                {loading || tarifasLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : isUnificado ? (
                  <div className="space-y-4">
                    <div className="bg-background rounded-xl border border-border/40 shadow-sm px-6 py-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hoja de Estado de Servicio — Unificado</p>
                      <h1 className="text-lg font-bold mt-1">HES {selectedCliente.nombre.toUpperCase()} · Todas las tarifas ({tarifas.length})</h1>
                      <p className="text-sm text-muted-foreground mt-0.5">{MESES[selectedMonth]} {selectedYear}</p>
                    </div>
                    <UnifiedResumenCards
                      results={unifiedResults}
                      serviciosBilling={unifiedServiciosBilling}
                      transporteOps={transporteOps}
                      transporteError={transporteError}
                      onRetryTransporte={loadTransporteOps}
                      transporteTotalCLP={transporteTotalCLP}
                      totalCLP={unifiedTotalCLP}
                      hasMin={unifiedHasMin}
                      minimoCLP={unifiedMinimoUnicoCLP}
                      loading={unifiedLoading}
                      error={unifiedError}
                    />
                  </div>
                ) : !tarifa ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <AlertCircle className="h-10 w-10 text-amber-500/60" />
                    <p className="text-sm font-medium">Sin tarifas configuradas</p>
                    <p className="text-xs text-muted-foreground">Configura las tarifas de este cliente para generar el HES</p>
                    <Button size="sm" onClick={() => setTarifaDialog(null)} className="mt-1 h-8 gap-1.5 text-[12px]">
                      <Settings2 className="h-3.5 w-3.5" /> Configurar tarifas
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 print:space-y-3">

                    {/* ── HES Header (printable) ── */}
                    <div className="bg-background rounded-xl border border-border/40 shadow-sm px-6 py-5 print:border-0 print:shadow-none print:px-0">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hoja de Estado de Servicio</p>
                          <h1 className="text-lg font-bold mt-1 break-words">HES {selectedCliente.nombre.toUpperCase()} {tarifa.clase_imo ? `· ${tarifa.clase_imo}` : ""}</h1>
                          <p className="text-[12px] text-muted-foreground mt-0.5">{MESES[selectedMonth].toUpperCase()} DE {selectedYear}</p>
                        </div>
                        <div className="sm:text-right space-y-0.5 flex-shrink-0">
                          <p className="text-[11px] text-muted-foreground">Cotización N° <span className="font-semibold text-foreground">{tarifa.cotizacion_numero}</span></p>
                          {tarifa.clase_imo && <p className="text-[11px] text-muted-foreground">Clase <span className="font-semibold text-foreground">{tarifa.clase_imo}</span></p>}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap sm:justify-end">
                            <span className="text-[10px] text-muted-foreground">UF al {fmtDateDisplay(ufDate)}</span>
                            <div className="relative print:hidden">
                              <Button
                                type="button" variant="outline" size="icon-xs"
                                onClick={openUfDatePicker}
                                title="Elegir fecha de la UF"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <CalendarIcon className="size-[11px]" />
                              </Button>
                              <input
                                ref={ufDateInputRef}
                                type="date"
                                value={ufDate}
                                max={TODAY_ISO}
                                onChange={e => e.target.value && setUfDate(e.target.value)}
                                tabIndex={-1}
                                className="absolute inset-0 h-6 w-6 opacity-0 pointer-events-none"
                              />
                            </div>
                            <Input value={ufValue} onChange={e => { setUfValue(e.target.value); setUfError(null) }}
                              className={cn(
                                "h-6 w-28 text-[11px] text-right bg-muted/40 border-border/50 print:hidden",
                                ufError && "border-amber-400 dark:border-amber-700"
                              )}
                              placeholder={ufLoading ? "Cargando…" : "$38.000,00"} />
                            {ufError && (
                              <Button
                                type="button" variant="outline" size="icon-xs"
                                onClick={() => setUfRetryTick(t => t + 1)}
                                title="Reintentar obtener la UF"
                                className="text-amber-600 hover:text-amber-700 print:hidden"
                              >
                                <RefreshCw className="size-[11px]" />
                              </Button>
                            )}
                            <span className="hidden print:inline text-[11px] font-semibold">${parseFloat(ufValue).toLocaleString("es-CL")}</span>
                          </div>
                          {ufError && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1 flex items-center gap-1 sm:justify-end print:hidden">
                              <AlertCircle className="size-3 flex-shrink-0" />
                              {ufError}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 pt-3 border-t border-border/30">
                        <div className="min-w-0"><p className="text-[10px] text-muted-foreground">RUT</p><p className="text-[12px] font-medium truncate">{selectedCliente.rut}</p></div>
                        <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Email</p><p className="text-[12px] font-medium truncate">{selectedCliente.emails.length > 0 ? selectedCliente.emails.join(", ") : "—"}</p></div>
                        <div className="min-w-0"><p className="text-[10px] text-muted-foreground">Contacto</p><p className="text-[12px] font-medium truncate">{selectedCliente.contacto ?? "—"}</p></div>
                      </div>
                    </div>

                    {/* ── Servicios a cobrar — acordeón, se comprime cuando crece la lista ── */}
                    <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden print:hidden">
                      <button
                        type="button"
                        onClick={() => setServiciosOpen(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[12px] font-semibold">Servicios a cobrar</span>
                          {servicios.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {serviciosOpen
                                ? "— marca los que aplican e ingresa la cantidad"
                                : `— ${servicios.filter(s => srvChecked[s.id] ?? true).length} de ${servicios.length} activos`
                              }
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.stopPropagation(); setServicioDialog(null) }}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setServicioDialog(null) } }}
                            className="h-6 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 rounded-md hover:bg-muted/40 cursor-pointer"
                          >
                            + Agregar servicio
                          </span>
                          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", serviciosOpen && "rotate-180")} />
                        </div>
                      </button>

                      {serviciosOpen && (servicios.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                          <Wrench className="h-7 w-7 opacity-20" />
                          <p className="text-[12px]">Sin servicios configurados para este cliente</p>
                          <Button size="sm" variant="outline" onClick={() => setServicioDialog(null)}
                            className="h-7 gap-1.5 text-[11px] mt-1">
                            + Crear primer servicio
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Cabecera de columnas */}
                          <div className="flex items-center gap-2 sm:gap-3 px-4 py-1.5 border-b border-border/20 bg-muted/10">
                            <span className="w-4 flex-shrink-0" />
                            <span className="flex-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Servicio</span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-14 sm:w-20 text-right">Cant.</span>
                            <span className="hidden sm:block text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-16 text-center">Unidad</span>
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-16 sm:w-24 text-right">Total (UF)</span>
                            <span className="w-4 sm:w-6 flex-shrink-0" />
                          </div>
                          <div className="divide-y divide-border/15">
                            {servicios.map(srv => {
                              const checked = srvChecked[srv.id] ?? true
                              const qty     = srvCantidades[srv.id] ?? 0
                              const total   = checked && qty > 0 && srv.tarifa_uf ? qty * srv.tarifa_uf : 0
                              return (
                                <div key={srv.id} className={cn(
                                  "flex items-center gap-2 sm:gap-3 px-4 py-2.5 transition-colors",
                                  checked ? "hover:bg-muted/20" : "opacity-45"
                                )}>
                                  {/* Checkbox */}
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => setSrvChecked(prev => ({ ...prev, [srv.id]: e.target.checked }))}
                                    className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-primary"
                                  />
                                  {/* Nombre + tarifa */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[12px] font-medium truncate">{srv.nombre}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {srv.descripcion
                                        ? `${srv.descripcion}${srv.tarifa_uf != null ? ` · ${srv.tarifa_uf.toFixed(4)} UF/${srv.unidad}` : ""}`
                                        : srv.tarifa_uf != null ? `${srv.tarifa_uf.toFixed(4)} UF / ${srv.unidad}` : "Sin tarifa"
                                      }
                                    </p>
                                  </div>
                                  {/* Cantidad */}
                                  <Input
                                    type="number" min="0" step="1"
                                    value={qty > 0 ? qty : ""}
                                    disabled={!checked}
                                    onChange={e => setSrvCantidades(prev => ({ ...prev, [srv.id]: parseFloat(e.target.value) || 0 }))}
                                    className="h-7 w-14 sm:w-20 text-[12px] text-right bg-muted/40 border-border/50 focus-visible:ring-1 disabled:opacity-40 disabled:cursor-not-allowed px-1.5 sm:px-3"
                                    placeholder="0"
                                  />
                                  {/* Unidad */}
                                  <span className="hidden sm:block text-[11px] text-muted-foreground w-16 text-center truncate flex-shrink-0">{srv.unidad}</span>
                                  {/* Total UF */}
                                  <span className={cn(
                                    "text-[11px] font-mono w-16 sm:w-24 text-right flex-shrink-0 tabular-nums",
                                    total > 0 ? "text-primary font-semibold" : "text-muted-foreground/30"
                                  )}>
                                    {total > 0 ? total.toFixed(4) : "—"}
                                  </span>
                                  {/* Editar */}
                                  <button
                                    onClick={() => setServicioDialog(srv)}
                                    className="text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0"
                                    title="Editar servicio"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      ))}
                    </div>

                    {transporteError && (
                      <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex items-center justify-between gap-2">
                        {transporteError}
                        <Button variant="ghost" size="sm" onClick={loadTransporteOps} className="h-6 text-[10px] px-2">Reintentar</Button>
                      </div>
                    )}

                    {/* ── Resumen de cobro ── */}
                    {billing && (
                      <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[12px] font-semibold">Resumen de cobro — {MESES[selectedMonth]} {selectedYear}</span>
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full text-[12px] min-w-[560px]">
                          <thead>
                            <tr className="border-b border-border/30 bg-muted/10">
                              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Descripción</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cantidad</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tarifa</th>
                              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total (UF)</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total Neto ($)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billing.rows.map((r, i) => (
                              <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                                <td className="px-4 py-2">{r.label}</td>
                                <td className="text-right px-3 py-2 font-mono">{typeof r.qty === "number" ? r.qty.toLocaleString("es-CL") : r.qty} <span className="text-muted-foreground text-[10px]">{r.unit}</span></td>
                                <td className="text-right px-3 py-2 font-mono">{r.moneda === "CLP" ? fmtCLP(r.tarifa) : `${fmtUF(r.tarifa)} UF`}</td>
                                <td className="text-right px-3 py-2 font-mono font-semibold">{r.moneda === "CLP" ? "—" : fmtUF(r.totalCLP / (parseFloat(ufValue) || 1))}</td>
                                <td className="text-right px-4 py-2 font-mono text-muted-foreground">{fmtCLP(r.totalCLP)}</td>
                              </tr>
                            ))}
                            {transporteOps.length > 0 && (
                              <tr className="border-b border-border/20 hover:bg-muted/20 italic">
                                <td className="px-4 py-2">Transporte</td>
                                <td className="text-right px-3 py-2 font-mono">{transporteOps.length} <span className="text-muted-foreground text-[10px]">viajes</span></td>
                                <td className="text-right px-3 py-2 font-mono">—</td>
                                <td className="text-right px-3 py-2 font-mono font-semibold">{fmtUF(transporteTotalUF)}</td>
                                <td className="text-right px-4 py-2 font-mono text-muted-foreground">{fmtCLP(transporteTotalCLP)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            {grandTotal?.hasMin && (
                              <tr className="border-t border-border/30 bg-amber-50/30 dark:bg-amber-900/10">
                                <td colSpan={3} className="px-4 py-2 text-[11px] text-amber-600 dark:text-amber-400">Facturación mínima aplicada ({fmtUF(tarifa.facturacion_minima_uf!)} UF/mes)</td>
                                <td className="text-right px-3 py-2 font-mono font-bold text-amber-600">{fmtUF(grandTotal.totalUF)}</td>
                                <td className="text-right px-4 py-2 font-mono text-amber-600">{fmtCLP(grandTotal.totalCLP)}</td>
                              </tr>
                            )}
                            <tr className="border-t-2 border-border/60 bg-primary/5 font-bold">
                              <td colSpan={3} className="px-4 py-2.5 text-[13px]">TOTAL NETO</td>
                              <td className="text-right px-3 py-2.5 font-mono text-[13px]">{fmtUF(grandTotal?.totalUF ?? 0)} UF</td>
                              <td className="text-right px-4 py-2.5 font-mono text-[13px] text-primary">{fmtCLP(grandTotal?.totalCLP ?? 0)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        </div>

                        {/* KPI chips */}
                        <div className="flex gap-3 px-4 py-3 border-t border-border/30 bg-muted/10">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Pallet-días</p>
                            <p className="text-[13px] font-bold">{hes?.palletDays.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Ingresos</p>
                            <p className="text-[13px] font-bold text-emerald-600">{hes?.totalIngresos.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Despachos</p>
                            <p className="text-[13px] font-bold text-amber-600">{hes?.totalDespachos.toLocaleString("es-CL")}</p>
                          </div>
                          <div className="h-8 w-px bg-border/40 self-center" />
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Días con movimiento</p>
                            <p className="text-[13px] font-bold">{hes?.dailyLog.length}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Transporte (Incomex) — bloque propio para que se vea
                        incluso sin movimientos de bodega este período, ya que
                        "Resumen de cobro" solo se renderiza si hay billing ── */}
                    {!billing && transporteOps.length > 0 && (
                      <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
                          <span className="text-[12px] font-semibold">Transporte (Incomex) — {MESES[selectedMonth]} {selectedYear}</span>
                          <span className="text-[11px] text-muted-foreground">{transporteOps.length} viajes</span>
                        </div>
                        <table className="w-full text-[12px]">
                          <tbody>
                            {transporteOps.map(op => (
                              <tr key={op.id} className="border-b border-border/20">
                                <td className="px-4 py-1.5">{fmtDateDisplay(op.fecha)} — {op.tipo_movimiento ?? op.detalle_carga ?? "Viaje"}</td>
                                <td className="text-right px-3 py-1.5 font-mono text-muted-foreground">{op.guia_numero ?? ""}</td>
                                <td className="text-right px-4 py-1.5 font-mono">{fmtUF(op.factura_cliente_uf ?? 0)} UF</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border/60 bg-primary/5 font-bold">
                              <td colSpan={2} className="px-4 py-2 text-[12px]">TOTAL TRANSPORTE</td>
                              <td className="text-right px-4 py-2 font-mono text-[12px] text-primary">{fmtCLP(transporteTotalCLP)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* ── Log diario ── */}
                    {hes && hes.dailyLog.length > 0 && (
                      <div className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 bg-muted/20">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span className="text-[12px] font-semibold">Log diario — {MESES[selectedMonth]} {selectedYear}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{hes.dailyLog.length} días</Badge>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] min-w-[900px]">
                            <thead>
                              <tr className="border-b border-border/30 bg-muted/10 text-muted-foreground">
                                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                                <th className="text-left px-3 py-2 font-medium">Operador</th>
                                <th className="text-left px-3 py-2 font-medium">G.D. Ingreso</th>
                                <th className="text-right px-3 py-2 font-medium">Pallets IN</th>
                                <th className="text-left px-3 py-2 font-medium">Report IN</th>
                                <th className="text-left px-3 py-2 font-medium">G.D. Salida</th>
                                <th className="text-right px-3 py-2 font-medium">Pallets OUT</th>
                                <th className="text-left px-3 py-2 font-medium">Report OUT</th>
                                <th className="text-right px-3 py-2 font-medium">Stock</th>
                                <th className="text-right px-3 py-2 font-medium">Tarifa ({tarifa?.moneda === "CLP" ? "$" : "UF"})</th>
                              </tr>
                            </thead>
                            <tbody>
                              {hes.dailyLog.map((row, i) => (
                                <tr key={i} className={cn(
                                  "border-b border-border/15",
                                  (row.pallets_in > 0 || row.pallets_out > 0) ? "hover:bg-muted/30" : "text-muted-foreground/50"
                                )}>
                                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">{row.fecha.split("-").reverse().join("-")}</td>
                                  <td className="px-3 py-1.5 truncate max-w-[80px]">{row.operador || "—"}</td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[80px]">{row.guias_in || "—"}</td>
                                  <td className={cn("text-right px-3 py-1.5 font-mono font-semibold", row.pallets_in > 0 ? "text-emerald-600" : "text-muted-foreground/30")}>
                                    {row.pallets_in > 0 ? row.pallets_in : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-primary/70 truncate max-w-[100px]">{row.reports_in || "—"}</td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[80px]">{row.guias_out || "—"}</td>
                                  <td className={cn("text-right px-3 py-1.5 font-mono font-semibold", row.pallets_out > 0 ? "text-amber-600" : "text-muted-foreground/30")}>
                                    {row.pallets_out > 0 ? row.pallets_out : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[10px] text-primary/70 truncate max-w-[100px]">{row.reports_out || "—"}</td>
                                  <td className="text-right px-3 py-1.5 font-mono font-bold">{row.stock.toLocaleString("es-CL")}</td>
                                  <td className="text-right px-3 py-1.5 font-mono text-muted-foreground">
                                    {row.tarifa_dia > 0 ? (tarifa?.moneda === "CLP" ? fmtCLP(row.tarifa_dia) : fmtUF(row.tarifa_dia)) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="border-t-2 border-border/60 font-bold bg-muted/10">
                              <tr>
                                <td colSpan={3} className="px-3 py-2 text-[11px]">TOTAL {MESES[selectedMonth].toUpperCase()} {selectedYear}</td>
                                <td className="text-right px-3 py-2 font-mono text-emerald-600">{hes.totalIngresos.toLocaleString("es-CL")}</td>
                                <td />
                                <td />
                                <td className="text-right px-3 py-2 font-mono text-amber-600">{hes.totalDespachos.toLocaleString("es-CL")}</td>
                                <td />
                                <td className="text-right px-3 py-2 font-mono">{hes.dailyLog[hes.dailyLog.length - 1]?.stock.toLocaleString("es-CL")}</td>
                                <td className="text-right px-3 py-2 font-mono">{fmtUF(hes.palletDays * (tarifa?.tarifa_almacenaje_uf ?? 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {!hes && !loading && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8 opacity-20" />
                        <p className="text-sm">Sin movimientos registrados para {MESES[selectedMonth]} {selectedYear}</p>
                      </div>
                    )}

                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { font-size: 10px; }
          .print\\:hidden { display: none !important; }
          .print\\:inline { display: inline !important; }
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </>
  )
}
