"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Search, FileCheck2, FileX2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { TIPOS_EQUIPO, ESTADOS_EQUIPO, estadoEquipoClase } from "@/lib/equipos"

type Fila = {
  id: string
  tipo: string
  marca: string
  modelo: string
  numero_serie: string | null
  estado: string
  equipo_asignaciones: { encargado_nombre: string; encargado_cargo: string | null; fecha_entrega: string; fecha_devolucion: string | null; acta_path: string | null }[]
}

export default function EquiposPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [tipo, setTipo] = useState("")
  const [estado, setEstado] = useState("")

  useEffect(() => {
    (async () => {
      const { data, error } = await createClient().from("equipos")
        .select("id, tipo, marca, modelo, numero_serie, estado, equipo_asignaciones(encargado_nombre, encargado_cargo, fecha_entrega, fecha_devolucion, acta_path)")
        .order("created_at", { ascending: false })
      if (error) setError(error.message)
      else setFilas((data ?? []) as unknown as Fila[])
      setLoading(false)
    })()
  }, [])

  const vigente = (f: Fila) => f.equipo_asignaciones.find(a => a.fecha_devolucion === null) ?? null

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return filas.filter(f =>
      (!tipo || f.tipo === tipo) &&
      (!estado || f.estado === estado) &&
      (!t || [f.marca, f.modelo, f.numero_serie, vigente(f)?.encargado_nombre].some(v => v?.toLowerCase().includes(t))))
  }, [filas, texto, tipo, estado])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Equipos" subtitle="Notebooks, PCs y tablets entregados al personal">
        <Button onClick={() => router.push("/equipos/nuevo")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo equipo
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por equipo, serie o encargado…" className="h-9 pl-8" />
          </div>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los tipos</option>
            {TIPOS_EQUIPO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los estados</option>
            {ESTADOS_EQUIPO.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar los equipos: {error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay equipos. Registra el primero con "Nuevo equipo".</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún equipo coincide con los filtros.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Equipo</th>
                  <th className="px-3 py-2 font-medium">N° serie</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Encargado</th>
                  <th className="px-3 py-2 font-medium">Entregado</th>
                  <th className="px-3 py-2 font-medium text-center">Acta</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => {
                  const a = vigente(f)
                  return (
                    <tr key={f.id} onClick={() => router.push(`/equipos/${f.id}`)}
                      className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                      <td className="px-3 py-2">{f.tipo}</td>
                      <td className="px-3 py-2 font-medium">{f.marca} {f.modelo}</td>
                      <td className="px-3 py-2 tabular-nums">{f.numero_serie || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estadoEquipoClase(f.estado)}`}>{f.estado}</span>
                      </td>
                      <td className="px-3 py-2">
                        {a ? <>{a.encargado_nombre}{a.encargado_cargo && <span className="text-muted-foreground"> · {a.encargado_cargo}</span>}</> : "—"}
                      </td>
                      <td className="px-3 py-2">{a ? new Date(a.fecha_entrega + "T00:00:00").toLocaleDateString("es-CL") : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {a ? (a.acta_path
                          ? <FileCheck2 className="inline h-4 w-4 text-emerald-600" aria-label="Acta cargada" />
                          : <FileX2 className="inline h-4 w-4 text-amber-600" aria-label="Falta el acta" />) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
