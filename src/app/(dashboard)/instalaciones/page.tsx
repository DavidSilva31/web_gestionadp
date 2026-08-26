"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Warehouse, MapPin, Plus, Pencil, Trash2, Loader2, AlertCircle,
  FileText, X, FileDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import type { InstalacionAlmacenamiento, InstalacionAlmacenamientoInsert, InstalacionSustancia } from "@/types/database"

interface SustanciaRow { id?: string; sustancia: string; clase_imo: string }
interface ItemResumen {
  descripcion: string; clase_imo: string | null; unidad: string; stock_actual: number
  cliente_nombre: string | null
}

const EMPTY_FORM: InstalacionAlmacenamientoInsert = {
  codigo: "", tipo: "Bodega", capacidad: "", capacidad_ton: null,
  resolucion_sanitaria_numero: null, resolucion_sanitaria_fecha: null,
  orden: 0, activo: true,
}

function fmtFecha(iso: string | null) {
  if (!iso) return null
  return iso.split("-").reverse().join("/")
}

export default function InstalacionesPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === "super_admin" || profile?.role === "operador"

  const [instalaciones, setInstalaciones] = useState<InstalacionAlmacenamiento[]>([])
  const [sustancias,    setSustancias]    = useState<Record<string, InstalacionSustancia[]>>({})
  const [ocupacion,     setOcupacion]     = useState<Record<string, { peso: number; items: number }>>({})
  const [itemsPorInstalacion, setItemsPorInstalacion] = useState<Record<string, ItemResumen[]>>({})
  const [claseImoUsage, setClaseImoUsage] = useState<{ clase: string; peso: number }[]>([])
  const [loading,       setLoading]       = useState(true)
  const [fetchError,    setFetchError]    = useState<string | null>(null)

  const [dialog,   setDialog]   = useState<null | "new" | InstalacionAlmacenamiento>(null)
  const [form,     setForm]     = useState<InstalacionAlmacenamientoInsert>(EMPTY_FORM)
  const [rows,     setRows]     = useState<SustanciaRow[]>([{ sustancia: "", clase_imo: "" }])
  const [saving,   setSaving]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState<InstalacionAlmacenamiento | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [viewDetail, setViewDetail] = useState<InstalacionAlmacenamiento | null>(null)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const [{ data: inst, error: e1 }, { data: sust, error: e2 }, { data: items, error: e3 }] = await Promise.all([
      supabase.from("instalaciones_almacenamiento").select("*").eq("activo", true).order("orden").order("codigo"),
      supabase.from("instalacion_sustancias").select("*").order("orden"),
      supabase.from("inventario_items")
        .select("instalacion_id, peso_ton, descripcion, clase_imo, unidad, stock_actual, clientes(nombre)")
        .eq("activo", true).not("instalacion_id", "is", null),
    ])
    if (e1 ?? e2 ?? e3) { setFetchError((e1 ?? e2 ?? e3)!.message); setLoading(false); return }
    setInstalaciones((inst ?? []) as InstalacionAlmacenamiento[])
    const grouped: Record<string, InstalacionSustancia[]> = {}
    for (const s of (sust ?? []) as InstalacionSustancia[]) {
      grouped[s.instalacion_id] = grouped[s.instalacion_id] ?? []
      grouped[s.instalacion_id].push(s)
    }
    setSustancias(grouped)

    type ItemRow = {
      instalacion_id: string; peso_ton: number | null; descripcion: string
      clase_imo: string | null; unidad: string; stock_actual: number
      clientes: { nombre: string } | null
    }
    const ocup: Record<string, { peso: number; items: number }> = {}
    const itemsGrouped: Record<string, ItemResumen[]> = {}
    const claseTon: Record<string, number> = {}
    for (const it of (items ?? []) as unknown as ItemRow[]) {
      const cur = ocup[it.instalacion_id] ?? { peso: 0, items: 0 }
      cur.peso  += it.peso_ton ?? 0
      cur.items += 1
      ocup[it.instalacion_id] = cur

      itemsGrouped[it.instalacion_id] = itemsGrouped[it.instalacion_id] ?? []
      itemsGrouped[it.instalacion_id].push({
        descripcion: it.descripcion, clase_imo: it.clase_imo, unidad: it.unidad,
        stock_actual: it.stock_actual, cliente_nombre: it.clientes?.nombre ?? null,
      })

      if (it.clase_imo && it.peso_ton) {
        claseTon[it.clase_imo] = (claseTon[it.clase_imo] ?? 0) + it.peso_ton
      }
    }
    setOcupacion(ocup)
    setItemsPorInstalacion(itemsGrouped)
    setClaseImoUsage(
      Object.entries(claseTon)
        .map(([clase, peso]) => ({ clase, peso }))
        .sort((a, b) => b.peso - a.peso)
    )
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openNew() {
    setForm(EMPTY_FORM)
    setRows([{ sustancia: "", clase_imo: "" }])
    setSaveError(null)
    setDialog("new")
  }

  function openEdit(inst: InstalacionAlmacenamiento) {
    setForm({
      codigo: inst.codigo, tipo: inst.tipo, capacidad: inst.capacidad, capacidad_ton: inst.capacidad_ton,
      resolucion_sanitaria_numero: inst.resolucion_sanitaria_numero,
      resolucion_sanitaria_fecha:  inst.resolucion_sanitaria_fecha,
      orden: inst.orden, activo: inst.activo,
    })
    const existing = sustancias[inst.id] ?? []
    setRows(existing.length > 0
      ? existing.map(s => ({ id: s.id, sustancia: s.sustancia, clase_imo: s.clase_imo ?? "" }))
      : [{ sustancia: "", clase_imo: "" }])
    setSaveError(null)
    setDialog(inst)
  }

  function setField<K extends keyof InstalacionAlmacenamientoInsert>(k: K, v: InstalacionAlmacenamientoInsert[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function updateRow(i: number, field: "sustancia" | "clase_imo", value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addRow() {
    setRows(prev => [...prev, { sustancia: "", clase_imo: "" }])
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.capacidad.trim()) return
    setSaving(true); setSaveError(null)
    try {
      const supabase = createClient()
      const existing = typeof dialog === "object" ? dialog : null

      let instalacionId = existing?.id
      if (existing) {
        const { error } = await supabase.from("instalaciones_almacenamiento").update(form).eq("id", existing.id)
        if (error) { setSaveError(error.message); return }
      } else {
        const { data, error } = await supabase.from("instalaciones_almacenamiento").insert(form).select("id").single()
        if (error || !data) { setSaveError(error?.message ?? "No se pudo crear la instalación."); return }
        instalacionId = data.id
      }

      // Reemplaza todas las sustancias/clases — volumen bajo, más simple que
      // diffear. Inserta las nuevas ANTES de borrar las viejas (por id
      // específico, no por instalacion_id) para que un fallo a mitad de camino
      // nunca deje la instalación sin su listado de sustancias/clases IMO
      // autorizadas — en el peor caso quedan duplicadas, no perdidas.
      const oldIds = existing ? (sustancias[existing.id] ?? []).map(s => s.id) : []
      const validRows = rows.filter(r => r.sustancia.trim())
      if (validRows.length > 0) {
        const { error } = await supabase.from("instalacion_sustancias").insert(
          validRows.map((r, i) => ({
            instalacion_id: instalacionId,
            sustancia: r.sustancia.trim(),
            clase_imo: r.clase_imo.trim() || null,
            orden: i,
          }))
        )
        if (error) { setSaveError(error.message); return }
      }
      if (oldIds.length > 0) {
        const { error } = await supabase.from("instalacion_sustancias").delete().in("id", oldIds)
        if (error) { setSaveError("Se guardaron las sustancias nuevas, pero quedaron duplicadas las anteriores: " + error.message); return }
      }

      setDialog(null)
      fetchAll()
    } catch (err) {
      console.error("[instalaciones] error guardando:", err)
      setSaveError("Ocurrió un error inesperado al guardar.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeletingBusy(true)
    setDeleteError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.from("instalaciones_almacenamiento").update({ activo: false }).eq("id", deleting.id)
      if (error) { setDeleteError(error.message); return }
      setDeleting(null)
      fetchAll()
    } catch (err) {
      console.error("[instalaciones] error eliminando:", err)
      setDeleteError("Ocurrió un error inesperado al eliminar.")
    } finally {
      setDeletingBusy(false)
    }
  }

  async function handleExport() {
    setExporting(true); setExportError(null)
    try {
      const res = await fetch("/api/instalaciones/export")
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setExportError(json?.error ?? "No se pudo generar el archivo Excel.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Instalaciones_ADP_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError("No se pudo generar el archivo Excel.")
    } finally {
      setExporting(false)
    }
  }

  const fieldCls = "h-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1"
  const labelCls = "text-[11px] text-muted-foreground"

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Instalaciones"
        subtitle={`${instalaciones.length} instalaciones registradas · catálogo de referencia para inventarios`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}
            className="h-9 gap-1.5 text-[12px]">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Exportar Excel
          </Button>
          {canEdit && (
            <Button size="sm" onClick={openNew} className="h-9 gap-1.5 text-[12px]">
              <Plus className="h-3.5 w-3.5" /> Nueva instalación
            </Button>
          )}
        </div>
      </PageHeader>

      {exportError && (
        <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {exportError}
        </div>
      )}

      {fetchError && (
        <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          Error al cargar instalaciones: {fetchError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {!loading && claseImoUsage.length > 0 && (() => {
          const max = claseImoUsage[0].peso
          return (
            <div className="mb-4 rounded-xl border border-border/40 bg-background px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                Uso por clase IMO (toneladas en planta)
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {claseImoUsage.map(({ clase, peso }) => (
                  <div key={clase} className="w-32 flex-shrink-0">
                    <div className="flex items-baseline justify-between text-[11px] mb-1">
                      <span className="font-semibold">Cl.{clase}</span>
                      <span className="text-muted-foreground tabular-nums">{peso.toFixed(1)} t</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(4, (peso / max) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : instalaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Warehouse className="h-12 w-12 opacity-20" />
            <p className="text-sm">Sin instalaciones registradas</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {instalaciones.map(inst => (
              <div key={inst.id}
                className="bg-background rounded-xl border border-border/40 shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border/30 bg-muted/20 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div onClick={() => setViewDetail(inst)}
                      className="flex items-center gap-1.5 flex-wrap cursor-pointer hover:underline underline-offset-2 w-fit">
                      {inst.tipo === "Patio"
                        ? <MapPin className="h-3.5 w-3.5 text-teal-600 flex-shrink-0" />
                        : <Warehouse className="h-3.5 w-3.5 text-teal-600 flex-shrink-0" />}
                      <span className="text-[13px] font-bold tracking-tight">{inst.codigo}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{inst.tipo}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{inst.capacidad}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(inst) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={e => { e.stopPropagation(); setDeleting(inst) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="px-4 py-3 border-b border-border/20">
                  {(() => {
                    const o = ocupacion[inst.id] ?? { peso: 0, items: 0 }
                    if (inst.capacidad_ton) {
                      const pct = Math.min(100, Math.round((o.peso / inst.capacidad_ton) * 100))
                      return (
                        <>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-muted-foreground">Ocupación</span>
                            <span className="font-semibold">{o.peso.toFixed(2)} / {inst.capacidad_ton} ton ({pct}%)</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">{o.items} ítem(s) asignado(s)</p>
                        </>
                      )
                    }
                    return <p className="text-[11px] text-muted-foreground">{o.items} ítem(s) asignado(s) · sin capacidad en toneladas para medir %</p>
                  })()}
                </div>

                {(itemsPorInstalacion[inst.id] ?? []).length > 0 && (() => {
                  const allItems = itemsPorInstalacion[inst.id]
                  const VISIBLE = 5
                  const visible = allItems.slice(0, VISIBLE)
                  const resto = allItems.length - visible.length
                  return (
                    <div className="px-4 py-3 flex-1 overflow-x-auto">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Inventario actual ({allItems.length})
                      </p>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="pb-1 pr-2 font-medium">Producto</th>
                            <th className="pb-1 pr-2 font-medium">Cliente</th>
                            <th className="pb-1 pr-2 font-medium text-right">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((it, i) => (
                            <tr key={i} className="border-t border-border/20">
                              <td className="py-1 pr-2">
                                <span className="text-foreground/90">{it.descripcion}</span>
                                {it.clase_imo && <span className="text-muted-foreground"> · Cl.{it.clase_imo}</span>}
                              </td>
                              <td className="py-1 pr-2 text-muted-foreground truncate max-w-[120px]">{it.cliente_nombre ?? "—"}</td>
                              <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{it.stock_actual.toLocaleString("es-CL")} {it.unidad}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {resto > 0 && (
                        <button
                          onClick={() => setViewDetail(inst)}
                          className="mt-1.5 text-[10px] text-primary hover:underline underline-offset-2"
                        >
                          +{resto} más — ver detalle
                        </button>
                      )}
                    </div>
                  )
                })()}

                {inst.resolucion_sanitaria_numero && (
                  <div className="px-4 py-2 border-t border-border/30 bg-muted/10 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <FileText className="h-3 w-3 flex-shrink-0" />
                    Res. sanitaria N° {inst.resolucion_sanitaria_numero}
                    {inst.resolucion_sanitaria_fecha && ` del ${fmtFecha(inst.resolucion_sanitaria_fecha)}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Crear / editar */}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{dialog === "new" ? "Nueva instalación" : "Editar instalación"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>Código <span className="text-destructive">*</span></Label>
                <Input className={fieldCls} value={form.codigo} onChange={e => setField("codigo", e.target.value)}
                  placeholder="Ej: 106-1, Patio de almacenamiento N°1" />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Tipo</Label>
                <div className="inline-flex rounded-md border border-border/50 overflow-hidden h-8">
                  {(["Bodega", "Patio"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setField("tipo", t)}
                      className={`px-3 text-[12px] font-medium transition-colors ${form.tipo === t ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className={labelCls}>Capacidad de almacenamiento <span className="text-destructive">*</span></Label>
              <Input className={fieldCls} value={form.capacidad} onChange={e => setField("capacidad", e.target.value)}
                placeholder="Ej: 700 ton, 18 posiciones de isotanques (800 ton), 170 m2" />
            </div>

            <div className="space-y-1">
              <Label className={labelCls}>Capacidad en toneladas (para medir ocupación)</Label>
              <Input className={`${fieldCls} w-32`} type="number" min={0} step="0.01"
                value={form.capacidad_ton ?? ""}
                onChange={e => setField("capacidad_ton", e.target.value === "" ? null : parseFloat(e.target.value))}
                placeholder="Ej: 700" />
              <p className="text-[10px] text-muted-foreground/70">
                Déjalo vacío si la capacidad no es comparable en toneladas (ej. m² o posiciones).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className={labelCls}>N° Resolución sanitaria</Label>
                <Input className={fieldCls} value={form.resolucion_sanitaria_numero ?? ""}
                  onChange={e => setField("resolucion_sanitaria_numero", e.target.value || null)} placeholder="Ej: 1659" />
              </div>
              <div className="space-y-1">
                <Label className={labelCls}>Fecha resolución</Label>
                <Input className={fieldCls} type="date" value={form.resolucion_sanitaria_fecha ?? ""}
                  onChange={e => setField("resolucion_sanitaria_fecha", e.target.value || null)} />
              </div>
            </div>

            <div className="border-t border-border/40 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className={labelCls}>Sustancias / clases autorizadas</Label>
                <Button variant="ghost" size="sm" onClick={addRow} className="h-6 gap-1 text-[11px] text-muted-foreground">
                  <Plus className="h-3 w-3" /> Agregar
                </Button>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className={`${fieldCls} flex-1`} value={r.sustancia} onChange={e => updateRow(i, "sustancia", e.target.value)}
                    placeholder="Sustancia (ej: Comburentes)" />
                  <Input className={`${fieldCls} w-20`} value={r.clase_imo} onChange={e => updateRow(i, "clase_imo", e.target.value)}
                    placeholder="Clase" />
                  <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            {saveError && <p className="text-[11px] text-destructive mr-auto">{saveError}</p>}
            <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.codigo.trim() || !form.capacidad.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {dialog === "new" ? "Crear instalación" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vista de detalle */}
      <Dialog open={viewDetail !== null} onOpenChange={open => { if (!open) setViewDetail(null) }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {viewDetail && (() => {
            const inst = viewDetail
            const o = ocupacion[inst.id] ?? { peso: 0, items: 0 }
            const pct = inst.capacidad_ton ? Math.min(100, Math.round((o.peso / inst.capacidad_ton) * 100)) : null
            const subs = sustancias[inst.id] ?? []
            const items = itemsPorInstalacion[inst.id] ?? []
            return (
              <>
                <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/30 bg-muted/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    {inst.tipo === "Patio"
                      ? <MapPin className="h-4 w-4 text-teal-600 flex-shrink-0" />
                      : <Warehouse className="h-4 w-4 text-teal-600 flex-shrink-0" />}
                    <DialogTitle className="text-base">{inst.codigo}</DialogTitle>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{inst.tipo}</Badge>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{inst.capacidad}</p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  <div className={cn("rounded-lg border px-4 py-3",
                    inst.capacidad_ton
                      ? (pct ?? 0) >= 90 ? "bg-destructive/5 border-destructive/20" : (pct ?? 0) >= 70 ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-muted/30 border-border/40")}>
                    {inst.capacidad_ton ? (
                      <>
                        <div className="flex items-center justify-between text-[12px] mb-1.5">
                          <span className="text-muted-foreground font-medium">Ocupación</span>
                          <span className="font-semibold">{o.peso.toFixed(2)} / {inst.capacidad_ton} ton <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full", (pct ?? 0) >= 90 ? "bg-destructive" : (pct ?? 0) >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5">{o.items} ítem(s) asignado(s)</p>
                      </>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">{o.items} ítem(s) asignado(s) · sin capacidad en toneladas para medir %</p>
                    )}
                  </div>

                  {(inst.resolucion_sanitaria_numero || subs.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {inst.resolucion_sanitaria_numero && (
                        <div className="rounded-lg border border-border/40 px-4 py-3">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                            Resolución sanitaria
                          </p>
                          <div className="flex items-center gap-1.5 text-[12px]">
                            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                            N° {inst.resolucion_sanitaria_numero}
                            {inst.resolucion_sanitaria_fecha && ` del ${fmtFecha(inst.resolucion_sanitaria_fecha)}`}
                          </div>
                        </div>
                      )}
                      {subs.length > 0 && (
                        <div className="rounded-lg border border-border/40 px-4 py-3">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                            Sustancias / clases autorizadas
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {subs.map(s => (
                              <Badge key={s.id} variant="outline" className="text-[11px] font-normal">
                                {s.sustancia}{s.clase_imo && <span className="text-muted-foreground"> · Cl.{s.clase_imo}</span>}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Inventario actual ({items.length})
                    </p>
                    {items.length > 0 ? (
                      <div className="overflow-x-auto rounded-lg border border-border/40">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-left text-muted-foreground bg-muted/40">
                              <th className="py-2 pl-3 pr-2 font-medium">Producto</th>
                              <th className="py-2 pr-2 font-medium">Clase IMO</th>
                              <th className="py-2 pr-2 font-medium">Cliente</th>
                              <th className="py-2 pr-3 font-medium text-right">Cantidad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it, i) => (
                              <tr key={i} className={cn("border-t border-border/20", i % 2 !== 0 && "bg-muted/15")}>
                                <td className="py-1.5 pl-3 pr-2 text-foreground/90">{it.descripcion}</td>
                                <td className="py-1.5 pr-2 text-muted-foreground">{it.clase_imo ?? "—"}</td>
                                <td className="py-1.5 pr-2 text-muted-foreground">{it.cliente_nombre ?? "—"}</td>
                                <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{it.stock_actual.toLocaleString("es-CL")} {it.unidad}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">Sin ítems asignados.</p>
                    )}
                  </div>
                </div>

                <DialogFooter className="mx-0 mb-0 rounded-b-xl px-6 py-3">
                  {canEdit && (
                    <Button variant="outline" size="sm" onClick={() => { setViewDetail(null); openEdit(inst) }} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setViewDetail(null)}>Cerrar</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) { setDeleting(null); setDeleteError(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-4 w-4 text-destructive" />
              </span>
              Eliminar instalación
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold text-foreground">{deleting?.codigo}</span> del catálogo de instalaciones.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={handleDelete}
              className="gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20"
            >
              {deletingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
