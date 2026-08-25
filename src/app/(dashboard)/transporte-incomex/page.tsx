"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Truck, Plus, Search, Loader2, RefreshCw, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import type { TransporteIncomex, TransporteIncomexInsert, Cliente } from "@/types/database"

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

function fmtUF(v: number | null) { return v == null ? "—" : v.toFixed(4) }
function fmtFecha(iso: string) { return iso.split("-").reverse().join("/") }

const EMPTY_FORM: TransporteIncomexInsert = {
  cliente_id: null,
  empresa_texto: "",
  fecha: new Date().toISOString().slice(0, 10),
  guia_numero: null,
  tipo_movimiento: null,
  origen_destino: null,
  detalle_carga: null,
  sigla_contenedor: null,
  transportista: null,
  conductor: null,
  tarifa_tte_clp: null,
  costo_uf: null,
  factura_cliente_uf: null,
  factura_adp_incomex_uf: null,
  observaciones: null,
  activo: true,
  created_by: null,
}

export default function TransporteIncomexPage() {
  const [ops,           setOps]           = useState<TransporteIncomex[]>([])
  const [clientes,      setClientes]      = useState<Cliente[]>([])
  const [loading,       setLoading]       = useState(true)
  const currentYear = new Date().getFullYear()
  const [yearFilter,    setYearFilter]    = useState(currentYear)
  const [monthFilter,   setMonthFilter]   = useState<number | "todos">("todos")
  const [search,        setSearch]        = useState("")
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [fetchError,    setFetchError]    = useState<string | null>(null)
  const [dialog,        setDialog]        = useState<null | "new" | TransporteIncomex>(null)
  const [form,          setForm]          = useState<TransporteIncomexInsert>(EMPTY_FORM)

  const fetchOps = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from("transporte_incomex")
      .select("*")
      .eq("activo", true)
      .gte("fecha", `${yearFilter}-01-01`)
      .lt("fecha",  `${yearFilter + 1}-01-01`)
      .order("fecha", { ascending: false })
    if (err) { setFetchError(err.message); setLoading(false); return }
    if (data) setOps(data as TransporteIncomex[])
    setLoading(false)
  }, [yearFilter])

  const fetchClientes = useCallback(async () => {
    const supabase = createClient()
    const { data, error: err } = await supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre")
    if (err) console.error("[transporte-incomex] error obteniendo clientes:", err)
    if (data) setClientes(data as Cliente[])
  }, [])

  useEffect(() => { fetchOps() }, [fetchOps])
  useEffect(() => { fetchClientes() }, [fetchClientes])

  function openNew() {
    setForm(EMPTY_FORM)
    setError(null)
    setDialog("new")
  }

  function openEdit(op: TransporteIncomex) {
    setForm({
      cliente_id: op.cliente_id, empresa_texto: op.empresa_texto, fecha: op.fecha,
      guia_numero: op.guia_numero, tipo_movimiento: op.tipo_movimiento, origen_destino: op.origen_destino,
      detalle_carga: op.detalle_carga, sigla_contenedor: op.sigla_contenedor,
      transportista: op.transportista, conductor: op.conductor,
      tarifa_tte_clp: op.tarifa_tte_clp, costo_uf: op.costo_uf,
      factura_cliente_uf: op.factura_cliente_uf, factura_adp_incomex_uf: op.factura_adp_incomex_uf,
      observaciones: op.observaciones, activo: op.activo, created_by: op.created_by,
    })
    setError(null)
    setDialog(op)
  }

  function handleClienteChange(id: string) {
    const c = clientes.find(x => x.id === id)
    setForm(p => ({ ...p, cliente_id: id || null, empresa_texto: c ? c.nombre : p.empresa_texto }))
  }

  async function handleSave() {
    if (!form.empresa_texto.trim()) { setError("La empresa/cliente es obligatoria."); return }
    if (!form.fecha) { setError("La fecha es obligatoria."); return }
    setSaving(true); setError(null)
    const payload = { ...form, empresa_texto: form.empresa_texto.trim() }
    try {
      const supabase = createClient()
      if (dialog === "new") {
        const { error: err } = await supabase.from("transporte_incomex").insert(payload)
        if (err) { setError(err.message); setSaving(false); return }
      } else if (dialog) {
        const { error: err } = await supabase.from("transporte_incomex").update(payload).eq("id", dialog.id)
        if (err) { setError(err.message); setSaving(false); return }
      }
      setSaving(false)
      setDialog(null)
      fetchOps()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
      setSaving(false)
    }
  }

  const filtered = useMemo(() => ops.filter(o => {
    if (monthFilter !== "todos" && new Date(o.fecha).getMonth() !== monthFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return o.empresa_texto.toLowerCase().includes(q) ||
             (o.transportista?.toLowerCase().includes(q) ?? false) ||
             (o.conductor?.toLowerCase().includes(q) ?? false) ||
             (o.guia_numero?.toLowerCase().includes(q) ?? false)
    }
    return true
  }), [ops, monthFilter, search])

  const totalUF = useMemo(() => filtered.reduce((s, o) => s + (o.factura_cliente_uf ?? 0), 0), [filtered])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Transporte Incomex" subtitle="Viajes subcontratados facturados al cliente vía Incomex">
        <Button variant="outline" size="sm" onClick={fetchOps} className="h-8 gap-1.5 text-[12px]">
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </Button>
        <Button size="sm" onClick={openNew} className="h-8 gap-1.5 text-[12px]">
          <Plus className="h-3.5 w-3.5" /> Nuevo viaje
        </Button>
      </PageHeader>

      {fetchError && (
        <div className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          Error al cargar: {fetchError}
        </div>
      )}

      <div className="px-4 sm:px-6 pt-4 pb-3 flex-shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar empresa, transportista, guía..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value === "todos" ? "todos" : Number(e.target.value))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="todos">Todos los meses</option>
          {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {filtered.length} viajes · Total facturado: <span className="font-semibold text-foreground">{fmtUF(totalUF)} UF</span>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empresa</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Movimiento</th>
                    <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transportista</th>
                    <th className="hidden lg:table-cell text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guía</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Factura cliente (UF)</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-xs">Sin viajes registrados en este período</td></tr>
                  ) : filtered.map((o, idx) => (
                    <tr key={o.id} className={idx % 2 !== 0 ? "bg-muted/10 border-b last:border-0" : "border-b last:border-0"}>
                      <td className="px-4 py-2.5 text-xs">{fmtFecha(o.fecha)}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{o.empresa_texto}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{o.tipo_movimiento ?? "—"}</td>
                      <td className="hidden md:table-cell px-4 py-2.5 text-xs">{o.transportista ?? "—"}</td>
                      <td className="hidden lg:table-cell px-4 py-2.5 text-xs font-mono text-muted-foreground">{o.guia_numero ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-mono">{fmtUF(o.factura_cliente_uf)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Button variant="ghost" size="icon-xs" onClick={() => openEdit(o)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              {dialog === "new" ? "Nuevo viaje" : "Editar viaje"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha *</Label>
              <Input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">N° Guía</Label>
              <Input value={form.guia_numero ?? ""} onChange={e => setForm(p => ({ ...p, guia_numero: e.target.value || null }))} className="h-9" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</Label>
              <select
                value={form.cliente_id ?? ""}
                onChange={e => handleClienteChange(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sin cliente asociado</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empresa (texto origen) *</Label>
              <Input value={form.empresa_texto} onChange={e => setForm(p => ({ ...p, empresa_texto: e.target.value }))} placeholder="Ej: ENAP" className="h-9" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de movimiento</Label>
              <Input value={form.tipo_movimiento ?? ""} onChange={e => setForm(p => ({ ...p, tipo_movimiento: e.target.value || null }))} placeholder="Ej: Traslado carga suelta" className="h-9" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Origen - Destino</Label>
              <Input value={form.origen_destino ?? ""} onChange={e => setForm(p => ({ ...p, origen_destino: e.target.value || null }))} placeholder="Ej: ADP-Concón" className="h-9" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Detalle de carga</Label>
              <Input value={form.detalle_carga ?? ""} onChange={e => setForm(p => ({ ...p, detalle_carga: e.target.value || null }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sigla contenedor/isotanque</Label>
              <Input value={form.sigla_contenedor ?? ""} onChange={e => setForm(p => ({ ...p, sigla_contenedor: e.target.value || null }))} className="h-9" />
            </div>
            <div className="space-y-1.5" />

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transportista</Label>
              <Input value={form.transportista ?? ""} onChange={e => setForm(p => ({ ...p, transportista: e.target.value || null }))} placeholder="Ej: Transportes JP" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conductor</Label>
              <Input value={form.conductor ?? ""} onChange={e => setForm(p => ({ ...p, conductor: e.target.value || null }))} className="h-9" />
            </div>

            <div className="col-span-2 border-t pt-3 mt-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Montos</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarifa transportista (CLP)</Label>
              <Input type="number" step="1" value={form.tarifa_tte_clp ?? ""} onChange={e => setForm(p => ({ ...p, tarifa_tte_clp: e.target.value === "" ? null : Number(e.target.value) }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Costo (UF)</Label>
              <Input type="number" step="0.0001" value={form.costo_uf ?? ""} onChange={e => setForm(p => ({ ...p, costo_uf: e.target.value === "" ? null : Number(e.target.value) }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Factura cliente NETO (UF)
                <span className="block text-[10px] font-normal normal-case text-muted-foreground">esto es lo que aparece en el HES del cliente</span>
              </Label>
              <Input type="number" step="0.0001" value={form.factura_cliente_uf ?? ""} onChange={e => setForm(p => ({ ...p, factura_cliente_uf: e.target.value === "" ? null : Number(e.target.value) }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Margen ADP a Incomex (UF)
                <span className="block text-[10px] font-normal normal-case text-muted-foreground">interno, no sale en el HES</span>
              </Label>
              <Input type="number" step="0.0001" value={form.factura_adp_incomex_uf ?? ""} onChange={e => setForm(p => ({ ...p, factura_adp_incomex_uf: e.target.value === "" ? null : Number(e.target.value) }))} className="h-9" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observaciones</Label>
              <Input value={form.observaciones ?? ""} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value || null }))} className="h-9" />
            </div>
          </div>

          {error && <p className="text-xs text-destructive px-1">{error}</p>}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
