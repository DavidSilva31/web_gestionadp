"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { logAudit } from "@/lib/audit"
import {
  resolveEffectiveClienteId, INVENTARIO_CATEGORIAS, INVENTARIO_UNIDADES,
  TIPOS_ENVASE, inferInventarioArea, type InventarioItemOption,
} from "@/lib/inventario"
import type { InstalacionAlmacenamiento, InventarioCategoria, TipoEnvase } from "@/types/database"

// Solo los campos que importan para dar de alta un ítem y su ingreso —
// pallet/guía/OC/CAS/peso neto/stock mínimo/peso estimado quedan fuera de
// este formulario (se completan después inline en Detalle o en "Editar
// ítem") para que el diálogo entre sin scroll en una pantalla normal.
const EMPTY = {
  // Ítem (inventario_items)
  descripcion: "", categoria: "Carga general" as InventarioCategoria, instalacion_id: "",
  clase_imo: "", nu: "", unidad: "unidad", observaciones: "",
  // Ingreso inicial (movimientos) — código obligatorio, el resto opcional.
  codigo: "", cantidad: 0, fecha: "", lote: "", fecha_vencimiento: "",
  tipo_envase: "" as TipoEnvase | "", bodega: "",
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  /** Cliente dueño del ítem — se resuelve internamente el dueño real si comparte stock. */
  clienteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (item: InventarioItemOption) => void
  initialDescripcion?: string
}

// Alta de un ítem de inventario nuevo — usado tanto desde /inventario
// ("Registrar ítem") como desde el alta rápida de Bodegaje en un report. Un
// solo formulario para no desincronizar los dos lugares.
//
// El ítem (inventario_items) solo guarda catálogo + stock; los datos del
// ingreso (SKU, lote, vencimiento...) viven en movimientos — así que si se
// cargan acá, además del ítem se crea un movimiento de ingreso "Saldo
// Inicial" con esos datos. Sin ese movimiento, el ítem aparecería en Resumen
// (lee inventario_items) pero nunca en Detalle (lee movimientos, agrupado
// por producto) — que era exactamente el problema reportado con "EQUIPO DE
// MEDICION" de ENAP.
export function ItemFormDialog({ clienteId, open, onOpenChange, onCreated, initialDescripcion }: Props) {
  const { user, profile } = useAuth()
  const [instalaciones, setInstalaciones] = useState<InstalacionAlmacenamiento[]>([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset del form al reabrir — ajustado durante el render (no en un efecto)
  // siguiendo el patrón de React para "resetear estado cuando cambia una
  // prop": evita el round-trip extra de un efecto que solo copia props a
  // estado. wasOpen detecta la transición false -> true.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm({ ...EMPTY, descripcion: initialDescripcion ?? "", fecha: hoyISO() })
      setError(null)
    }
  }

  useEffect(() => {
    if (!open) return
    createClient().from("instalaciones_almacenamiento").select("*").order("codigo")
      .then(({ data }) => setInstalaciones((data as InstalacionAlmacenamiento[]) ?? []))
  }, [open])

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm(p => ({ ...p, [key]: value }))
  }

  async function handleSave() {
    if (!form.descripcion.trim()) { setError("El nombre es obligatorio"); return }
    if (!form.codigo.trim()) { setError("El SKU es obligatorio"); return }
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      const ownerId = await resolveEffectiveClienteId(supabase, clienteId)
      const cantidad = Math.max(0, form.cantidad)

      // El stock arranca en 0 y sube por el trigger de movimientos
      // (movimientos_sync_inventario) al insertar el ingreso más abajo —
      // así Resumen y Detalle siempre salen del mismo dato, nunca de dos
      // números escritos por separado que puedan desalinearse.
      const itemPayload = {
        cliente_id:     ownerId,
        descripcion:    form.descripcion.trim(),
        categoria:      form.categoria,
        area:           inferInventarioArea(instalaciones.find(i => i.id === form.instalacion_id)),
        clase_imo:      form.clase_imo.trim() || null,
        nu:             form.nu.trim() || null,
        unidad:         form.unidad,
        stock_actual:   0,
        stock_unidades: 0,
        stock_minimo:   0,
        observaciones:  form.observaciones.trim() || null,
        activo:         true,
        created_by:     user?.id ?? null,
        instalacion_id: form.instalacion_id || null,
        peso_ton:       null,
        peso_unitario_ton: null,
      }
      const { data: item, error: itemErr } = await supabase.from("inventario_items")
        .insert(itemPayload).select("id, descripcion, clase_imo, nu").single()
      if (itemErr) { setError(itemErr.message); return }

      // Movimiento de ingreso inicial: se crea siempre que haya cantidad o
      // algún dato de detalle cargado — un ítem sin nada de eso (solo
      // catálogo, sin stock) no tiene historial real que mostrar en Detalle.
      const tieneDetalle = cantidad > 0 || form.lote.trim() !== "" || form.fecha_vencimiento !== ""
        || form.bodega.trim() !== "" || form.tipo_envase !== ""

      if (tieneDetalle) {
        const movPayload = {
          tipo: "ingreso" as const,
          servicio: "Almacenaje" as const,
          cliente_id: ownerId,
          cliente_nombre: null,
          carga: itemPayload.descripcion,
          area: itemPayload.area,
          inventario_item_id: item.id,
          unidades: cantidad,
          operador: profile?.nombre ?? null,
          estado: "completado" as const,
          observaciones: "Saldo inicial al registrar el ítem",
          codigo: form.codigo.trim(),
          imo: form.clase_imo.trim() || null,
          un: form.nu.trim() || null,
          lote: form.lote.trim() || null,
          fecha_vencimiento: form.fecha_vencimiento || null,
          tipo_envase: form.tipo_envase || null,
          bodega: form.bodega.trim() || null,
          fecha: form.fecha ? new Date(`${form.fecha}T12:00:00`).toISOString() : new Date().toISOString(),
          report_id: null,
          created_by: user?.id ?? null,
        }
        const { error: movErr } = await supabase.from("movimientos").insert(movPayload)
        if (movErr) {
          // El ítem ya quedó creado — no se revierte (evita dejar el form a
          // medias); se avisa para que el usuario complete el ingreso a mano
          // desde Detalle si hace falta.
          console.error("[item-form-dialog] error creando el ingreso inicial:", movErr)
          setError(`El ítem se creó, pero no se pudo registrar el ingreso inicial: ${movErr.message}`)
          onCreated(item as InventarioItemOption)
          return
        }
      }

      logAudit({
        tabla:          "inventario_items",
        registro_id:    item.id,
        accion:         "inventario.crear_item",
        descripcion:    `Ítem ${itemPayload.descripcion} creado${cantidad > 0 ? ` — stock inicial: ${cantidad}` : ""}`,
        usuario_id:     user?.id,
        usuario_nombre: profile?.nombre ?? user?.email,
      })
      onCreated(item as InventarioItemOption)
      onOpenChange(false)
    } catch (err) {
      console.error("[item-form-dialog] error creando ítem:", err)
      setError("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent trae "sm:max-w-sm" por defecto — un max-w sin el
          prefijo "sm:" no lo pisa (mismo breakpoint, tailwind-merge no lo
          reconoce como el mismo grupo), por eso quedaba angosto igual. */}
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar producto nuevo</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU *</Label>
            <Input value={form.codigo} onChange={e => set("codigo", e.target.value)} placeholder="Código" className="h-9" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nombre *</Label>
            <Input
              value={form.descripcion}
              onChange={e => set("descripcion", e.target.value)}
              placeholder="Ej: Contenedor 20' Clase IMO 3 — Metanol"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categoría</Label>
            <select value={form.categoria} onChange={e => set("categoria", e.target.value as InventarioCategoria)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {INVENTARIO_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Instalación</Label>
            <select value={form.instalacion_id} onChange={e => set("instalacion_id", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Sin asignar</option>
              {instalaciones.map(i => <option key={i.id} value={i.id}>{i.codigo}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Clase IMO</Label>
            <Input value={form.clase_imo} onChange={e => set("clase_imo", e.target.value)} placeholder="Ej: 3, 6.1, 8..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">N° ONU</Label>
            <Input value={form.nu} onChange={e => set("nu", e.target.value)} placeholder="Ej: 1090" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unidad</Label>
            <select value={form.unidad} onChange={e => set("unidad", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {INVENTARIO_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cantidad</Label>
            <Input type="number" min={0} value={form.cantidad} onChange={e => set("cantidad", Math.max(0, parseInt(e.target.value) || 0))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha ingreso</Label>
            <Input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lote</Label>
            <Input value={form.lote} onChange={e => set("lote", e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vencimiento</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)} className="h-9" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Envase</Label>
            <select value={form.tipo_envase} onChange={e => set("tipo_envase", e.target.value as TipoEnvase | "")}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Sin especificar</option>
              {TIPOS_ENVASE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bodega</Label>
            <Input value={form.bodega} onChange={e => set("bodega", e.target.value)} className="h-9" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observaciones</Label>
            <Input
              value={form.observaciones}
              onChange={e => set("observaciones", e.target.value)}
              placeholder="Opcional"
              className="h-9"
            />
          </div>
        </div>

        <p className="text-[10.5px] text-muted-foreground/70 -mt-1">
          N° pallet, guía, OC, CAS, peso y otros datos de detalle se agregan después, directo en la grilla Detalle.
        </p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            size="sm"
            disabled={saving || !form.descripcion.trim() || !form.codigo.trim()}
            onClick={handleSave}
            className="gap-1.5 bg-primary hover:bg-primary/85 text-primary-foreground"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Registrar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
