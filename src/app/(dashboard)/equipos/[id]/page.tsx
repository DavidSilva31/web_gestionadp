"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2, FileCheck2, FileX2, Upload, Undo2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { validateUploadFile, sanitizeExt } from "@/lib/upload-validation"
import { TIPOS_EQUIPO, ESTADOS_EQUIPO, estadoEquipoClase } from "@/lib/equipos"

type Asignacion = {
  id: string
  encargado_nombre: string
  encargado_rut: string | null
  encargado_cargo: string | null
  fecha_entrega: string
  fecha_devolucion: string | null
  acta_path: string | null
  observaciones: string | null
}

const hoy = () => new Date().toISOString().slice(0, 10)
const fmtFecha = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL")

export default function EquipoPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const esNuevo = params.id === "nuevo"

  const [equipoId, setEquipoId] = useState<string | null>(esNuevo ? null : params.id)
  const [cargando, setCargando] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)   // entrega / devolución / acta en curso
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<string>(TIPOS_EQUIPO[0])
  const [marca, setMarca] = useState("")
  const [modelo, setModelo] = useState("")
  const [serie, setSerie] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [estado, setEstado] = useState<string>("Disponible")
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])

  // Formulario de entrega a un nuevo encargado
  const [encNombre, setEncNombre] = useState("")
  const [encRut, setEncRut] = useState("")
  const [encCargo, setEncCargo] = useState("")
  const [encFecha, setEncFecha] = useState(hoy())
  const [encObs, setEncObs] = useState("")
  const [encActa, setEncActa] = useState<File | null>(null)
  const actaNuevaRef = useRef<HTMLInputElement>(null)

  const [fechaDevolucion, setFechaDevolucion] = useState(hoy())

  const vigente = asignaciones.find(a => a.fecha_devolucion === null) ?? null

  const cargarAsignaciones = useCallback(async (id: string) => {
    const { data, error: e } = await createClient().from("equipo_asignaciones")
      .select("id, encargado_nombre, encargado_rut, encargado_cargo, fecha_entrega, fecha_devolucion, acta_path, observaciones")
      .eq("equipo_id", id).order("fecha_entrega", { ascending: false }).order("created_at", { ascending: false })
    if (e) { setError(e.message); return }
    setAsignaciones((data ?? []) as Asignacion[])
  }, [])

  useEffect(() => {
    if (esNuevo) return
    ;(async () => {
      const { data, error: e } = await createClient().from("equipos").select("*").eq("id", params.id).single()
      if (e || !data) { setError(e?.message ?? "Equipo no encontrado"); setCargando(false); return }
      setTipo(data.tipo); setMarca(data.marca); setModelo(data.modelo)
      setSerie(data.numero_serie ?? ""); setObservaciones(data.observaciones ?? ""); setEstado(data.estado)
      await cargarAsignaciones(params.id)
      setCargando(false)
    })()
  }, [esNuevo, params.id, cargarAsignaciones])

  async function guardarEquipo() {
    setError(null)
    if (!marca.trim() || !modelo.trim()) { setError("Ingresa la marca y el modelo."); return }
    setGuardando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const campos = {
      tipo, marca: marca.trim(), modelo: modelo.trim(), numero_serie: serie.trim() || null,
      observaciones: observaciones.trim() || null, estado, updated_at: new Date().toISOString(),
    }
    if (equipoId) {
      const { error: e } = await supabase.from("equipos").update(campos).eq("id", equipoId)
      if (e) setError(mensaje(e.message))
    } else {
      const { data, error: e } = await supabase.from("equipos").insert({ ...campos, created_by: user?.id ?? null }).select("id").single()
      if (e || !data) setError(mensaje(e?.message ?? "No se pudo crear el equipo"))
      else { setEquipoId(data.id); router.replace(`/equipos/${data.id}`) }
    }
    setGuardando(false)
  }

  function mensaje(m: string) {
    return m.includes("uq_equipos_serie") ? "Ya existe un equipo con ese N° de serie." : m
  }

  async function subirActa(asignacionId: string, archivo: File, anterior: string | null): Promise<boolean> {
    const invalido = validateUploadFile(archivo)
    if (invalido) { setError(invalido); return false }
    const supabase = createClient()
    const path = `${equipoId}/${asignacionId}-${Date.now()}.${sanitizeExt(archivo.name)}`
    const { error: eUp } = await supabase.storage.from("equipos-actas").upload(path, archivo)
    if (eUp) { setError("No se pudo subir el acta. Intenta de nuevo."); return false }
    const { error: eDb } = await supabase.from("equipo_asignaciones").update({ acta_path: path }).eq("id", asignacionId)
    if (eDb) { setError(eDb.message); return false }
    if (anterior) await supabase.storage.from("equipos-actas").remove([anterior])
    return true
  }

  async function entregar() {
    setError(null)
    if (!equipoId) return
    if (!encNombre.trim()) { setError("Ingresa el nombre del encargado."); return }
    if (encActa) { const inv = validateUploadFile(encActa); if (inv) { setError(inv); return } }
    setTrabajando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: e } = await supabase.from("equipo_asignaciones").insert({
      equipo_id: equipoId, encargado_nombre: encNombre.trim(), encargado_rut: encRut.trim() || null,
      encargado_cargo: encCargo.trim() || null, fecha_entrega: encFecha, observaciones: encObs.trim() || null,
      created_by: user?.id ?? null,
    }).select("id").single()
    if (e || !data) { setError(e?.message ?? "No se pudo registrar la entrega"); setTrabajando(false); return }
    await supabase.from("equipos").update({ estado: "Asignado", updated_at: new Date().toISOString() }).eq("id", equipoId)
    setEstado("Asignado")
    // Si el acta falla, la entrega ya quedó registrada y el acta se puede cargar después.
    if (encActa) await subirActa(data.id, encActa, null)
    setEncNombre(""); setEncRut(""); setEncCargo(""); setEncObs(""); setEncActa(null); setEncFecha(hoy())
    await cargarAsignaciones(equipoId)
    setTrabajando(false)
  }

  async function devolver() {
    setError(null)
    if (!equipoId || !vigente) return
    if (fechaDevolucion < vigente.fecha_entrega) { setError("La devolución no puede ser anterior a la entrega."); return }
    setTrabajando(true)
    const supabase = createClient()
    const { error: e } = await supabase.from("equipo_asignaciones").update({ fecha_devolucion: fechaDevolucion }).eq("id", vigente.id)
    if (e) { setError(e.message); setTrabajando(false); return }
    await supabase.from("equipos").update({ estado: "Disponible", updated_at: new Date().toISOString() }).eq("id", equipoId)
    setEstado("Disponible")
    await cargarAsignaciones(equipoId)
    setTrabajando(false)
  }

  async function cambiarActa(a: Asignacion, archivo: File) {
    setError(null)
    setTrabajando(true)
    if (await subirActa(a.id, archivo, a.acta_path) && equipoId) await cargarAsignaciones(equipoId)
    setTrabajando(false)
  }

  async function verActa(path: string) {
    const { data, error: e } = await createClient().storage.from("equipos-actas").createSignedUrl(path, 3600)
    if (e || !data) { setError("No se pudo abrir el acta."); return }
    window.open(data.signedUrl, "_blank", "noopener")
  }

  if (cargando) {
    return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={equipoId ? `${marca} ${modelo}` : "Nuevo equipo"} subtitle={equipoId ? tipo : "Registra el equipo y luego entrégalo a un encargado"}>
        <Button variant="outline" onClick={() => router.push("/equipos")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <Button onClick={guardarEquipo} disabled={guardando} className="gap-1.5">
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-8">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {TIPOS_EQUIPO.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            {vigente ? (
              <p className="h-9 flex items-center"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoEquipoClase("Asignado")}`}>Asignado</span></p>
            ) : (
              <select value={estado} onChange={e => setEstado(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {ESTADOS_EQUIPO.filter(e => e !== "Asignado").map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Marca</Label>
            <Input value={marca} onChange={e => setMarca(e.target.value)} className="h-9" placeholder="Ej: Lenovo" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Modelo</Label>
            <Input value={modelo} onChange={e => setModelo(e.target.value)} className="h-9" placeholder="Ej: ThinkPad E14" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">N° de serie</Label>
            <Input value={serie} onChange={e => setSerie(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Observaciones (características, accesorios, estado)</Label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
          </div>
        </section>

        {equipoId && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Encargado</h3>

            {vigente ? (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{vigente.encargado_nombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {[vigente.encargado_rut, vigente.encargado_cargo].filter(Boolean).join(" · ") || "Sin RUT ni cargo"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Entregado el {fmtFecha(vigente.fecha_entrega)}</p>
                  </div>
                  <ActaBoton a={vigente} onVer={verActa} onSubir={cambiarActa} disabled={trabajando} />
                </div>
                <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de devolución</Label>
                    <Input type="date" value={fechaDevolucion} onChange={e => setFechaDevolucion(e.target.value)} className="h-9 w-44" />
                  </div>
                  <Button variant="outline" onClick={devolver} disabled={trabajando} className="gap-1.5">
                    {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Registrar devolución
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm text-muted-foreground">El equipo no tiene encargado. Regístralo para entregarlo.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre del encargado</Label>
                    <Input value={encNombre} onChange={e => setEncNombre(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">RUT</Label>
                    <Input value={encRut} onChange={e => setEncRut(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cargo / área</Label>
                    <Input value={encCargo} onChange={e => setEncCargo(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha de entrega</Label>
                    <Input type="date" value={encFecha} onChange={e => setEncFecha(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Observaciones de la entrega</Label>
                    <Input value={encObs} onChange={e => setEncObs(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Acta de responsabilidad firmada (PDF, JPG o PNG, máx. 10 MB)</Label>
                    <div className="flex items-center gap-2">
                      <input ref={actaNuevaRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
                        onChange={e => { setEncActa(e.target.files?.[0] ?? null); e.target.value = "" }} />
                      <Button type="button" variant="outline" size="sm" onClick={() => actaNuevaRef.current?.click()} className="gap-1.5">
                        <Upload className="h-3.5 w-3.5" /> {encActa ? "Cambiar archivo" : "Elegir archivo"}
                      </Button>
                      <span className="text-xs text-muted-foreground truncate">{encActa?.name ?? "Se puede cargar después"}</span>
                    </div>
                  </div>
                </div>
                <Button onClick={entregar} disabled={trabajando} className="gap-1.5">
                  {trabajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Registrar entrega
                </Button>
              </div>
            )}

            {asignaciones.filter(a => a.fecha_devolucion !== null).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial</h4>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Encargado</th>
                        <th className="px-3 py-2 font-medium">Entrega</th>
                        <th className="px-3 py-2 font-medium">Devolución</th>
                        <th className="px-3 py-2 font-medium">Acta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asignaciones.filter(a => a.fecha_devolucion !== null).map(a => (
                        <tr key={a.id} className="border-t">
                          <td className="px-3 py-2">{a.encargado_nombre}{a.encargado_rut && <span className="text-muted-foreground"> · {a.encargado_rut}</span>}</td>
                          <td className="px-3 py-2">{fmtFecha(a.fecha_entrega)}</td>
                          <td className="px-3 py-2">{fmtFecha(a.fecha_devolucion!)}</td>
                          <td className="px-3 py-2"><ActaBoton a={a} onVer={verActa} onSubir={cambiarActa} disabled={trabajando} compacto /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function ActaBoton({ a, onVer, onSubir, disabled, compacto }: {
  a: Asignacion
  onVer: (path: string) => void
  onSubir: (a: Asignacion, f: File) => void
  disabled: boolean
  compacto?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onSubir(a, f); e.target.value = "" }} />
      {a.acta_path ? (
        <button type="button" onClick={() => onVer(a.acta_path!)} className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
          <FileCheck2 className="h-4 w-4" /> Ver acta
        </button>
      ) : (
        <span className="flex items-center gap-1 text-xs text-amber-700"><FileX2 className="h-4 w-4" /> Falta el acta</span>
      )}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()} className="h-7 gap-1 text-xs">
        <Upload className="h-3 w-3" /> {a.acta_path ? "Reemplazar" : compacto ? "Cargar" : "Cargar acta"}
      </Button>
    </div>
  )
}
