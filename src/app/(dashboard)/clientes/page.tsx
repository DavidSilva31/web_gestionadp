"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Search, Warehouse, Loader2, RefreshCw, Pencil, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { PageHeader } from "@/components/layout/page-header"
import Link from "next/link"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Cliente, ClienteInsert } from "@/types/database"

const SECTORES = ["Marítimo", "Importación", "Industrial", "Minería", "Industria química", "Logística", "Otro"]

const SECTOR_COLOR: Record<string, string> = {
  "Marítimo":          "bg-blue-50   text-blue-700   dark:bg-blue-900/20   dark:text-blue-400",
  "Importación":       "bg-cyan-50   text-cyan-700   dark:bg-cyan-900/20   dark:text-cyan-400",
  "Industrial":        "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  "Minería":           "bg-amber-50  text-amber-700  dark:bg-amber-900/20  dark:text-amber-400",
  "Industria química": "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
  "Logística":         "bg-teal-50   text-teal-700   dark:bg-teal-900/20   dark:text-teal-400",
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",    "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",   "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
]

const codigo = (n: number) => `CLI-${String(n).padStart(3, "0")}`
const initials = (nombre: string) =>
  nombre.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()

const EMPTY: ClienteInsert = { nombre: "", rut: "", contacto: "", email: "", sector: "", activo: true }

export default function ClientesPage() {
  const [clientes,   setClientes]   = useState<Cliente[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Dialog: null = cerrado, "new" = nuevo, Cliente = editar
  const [dialog,     setDialog]     = useState<null | "new" | Cliente>(null)
  const [form,       setForm]       = useState<ClienteInsert>(EMPTY)

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .order("numero", { ascending: true })
    if (data) setClientes(data as Cliente[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  function openNew() {
    setForm(EMPTY)
    setError(null)
    setDialog("new")
  }

  function openEdit(c: Cliente) {
    setForm({ nombre: c.nombre, rut: c.rut, contacto: c.contacto ?? "", email: c.email ?? "", sector: c.sector ?? "", activo: c.activo })
    setError(null)
    setDialog(c)
  }

  async function handleSave() {
    if (!form.nombre.trim() || !form.rut.trim()) { setError("Nombre y RUT son obligatorios"); return }
    setSaving(true); setError(null)

    const payload = {
      nombre:   form.nombre.trim(),
      rut:      form.rut.trim(),
      contacto: form.contacto?.trim() || null,
      email:    form.email?.trim()    || null,
      sector:   form.sector           || null,
      activo:   form.activo,
    }

    try {
      const supabase = createClient()
      if (dialog === "new") {
        const { error: err } = await supabase.from("clientes").insert(payload)
        if (err) { setError(err.message); setSaving(false); return }
      } else if (dialog) {
        const { error: err } = await supabase.from("clientes").update(payload).eq("id", dialog.id)
        if (err) { setError(err.message); setSaving(false); return }
      }
      setSaving(false)
      setDialog(null)
      fetchClientes()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar. Intenta nuevamente.")
      setSaving(false)
    }
  }


  const filtered = clientes.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.nombre.toLowerCase().includes(q) || c.rut.toLowerCase().includes(q)
  })

  const activos = clientes.filter(c => c.activo).length

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Gestión de clientes" subtitle={`${activos} activos · ${clientes.length} en total · Sectores portuario e industrial`}>
        <Button variant="ghost" size="sm" onClick={fetchClientes} disabled={loading} className="h-10 w-10 p-0 text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
        <Button size="sm" onClick={openNew}
          className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
          <Plus className="h-3.5 w-3.5" />
          Nuevo cliente
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="px-6 pt-4 pb-3 flex-shrink-0">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar empresa o RUT..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-4">
        <div className="h-full bg-card rounded-xl border overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "19%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "6%" }}  />
                </colgroup>
                <thead className="sticky top-0 bg-muted/60 border-b z-10">
                  <tr>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empresa</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">RUT</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacto</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sector</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inventario</th>
                    <th className="text-center px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, idx) => (
                    <tr key={c.id} className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors group", idx % 2 !== 0 && "bg-muted/10")}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className={cn("text-[11px] font-bold", AVATAR_COLORS[idx % AVATAR_COLORS.length])}>
                              {initials(c.nombre)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="overflow-hidden">
                            <p className="text-xs font-semibold truncate">{c.nombre}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{codigo(c.numero)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground overflow-hidden">
                        <span className="truncate block">{c.rut}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs overflow-hidden">
                        <span className="truncate block">{c.contacto ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground overflow-hidden">
                        <span className="truncate block">{c.email ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 overflow-hidden">
                        {c.sector ? (
                          <Badge className={cn("text-[10px] px-2 py-0 border-0 font-medium", SECTOR_COLOR[c.sector] ?? "bg-muted text-muted-foreground")}>
                            {c.sector}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <Link href={`/inventario?cliente=${c.id}`}>
                          <Button variant="ghost" size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.35_0.12_240)]/10">
                            <Warehouse className="h-3.5 w-3.5" />
                            Ver
                          </Button>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                            c.activo
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          )}>
                            {c.activo
                              ? <><CheckCircle2 className="h-3 w-3" />Activo</>
                              : <><XCircle className="h-3 w-3" />Inactivo</>
                            }
                          </span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        {search ? "No se encontraron clientes con ese criterio" : "No hay clientes registrados"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Dialog nuevo / editar */}
    <Dialog open={dialog !== null} onOpenChange={open => { if (!open) setDialog(null) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialog === "new" ? "Nuevo cliente" : "Editar cliente"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-1">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nombre empresa *</Label>
            <Input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Razón social" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">RUT *</Label>
            <Input value={form.rut} onChange={e => setForm(p => ({ ...p, rut: e.target.value }))} placeholder="76.000.000-K" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sector</Label>
            <select value={form.sector ?? ""} onChange={e => setForm(p => ({ ...p, sector: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Sin sector</option>
              {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacto</Label>
            <Input value={form.contacto ?? ""} onChange={e => setForm(p => ({ ...p, contacto: e.target.value }))} placeholder="Nombre contacto" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="correo@empresa.cl" className="h-9" />
          </div>
        </div>

        {dialog !== "new" && (
          <div className={cn(
            "rounded-lg border p-4 space-y-2",
            form.activo
              ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
              : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10"
          )}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn("text-xs font-bold", form.activo ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                  {form.activo ? "Suspender cliente" : "Reactivar cliente"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.activo
                    ? "El cliente quedará inactivo y no aparecerá disponible en nuevos reports."
                    : "El cliente volverá a estar disponible para operar normalmente."}
                </p>
              </div>
              <button
                onClick={() => setForm(p => ({ ...p, activo: !p.activo }))}
                className={cn(
                  "flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                  form.activo
                    ? "border-red-300 bg-white text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400"
                    : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400"
                )}
              >
                {form.activo
                  ? <><XCircle className="h-3.5 w-3.5" />Suspender</>
                  : <><CheckCircle2 className="h-3.5 w-3.5" />Reactivar</>
                }
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDialog(null)}>Cancelar</Button>
          <Button size="sm" disabled={saving || !form.nombre || !form.rut} onClick={handleSave}
            className="gap-1.5 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {dialog === "new" ? "Crear cliente" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
