"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { ESTADOS_PICKING, ETIQUETA_ESTADO_PICKING, estadoPickingClase } from "@/lib/picking"

type Fila = {
  id: string
  numero: number
  fecha: string
  referencia: string | null
  estado: string
  clientes: { nombre: string } | null
  reports: { numero: number } | null
  picking_lineas: { count: number }[]
}

export default function PickingListaPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [estado, setEstado] = useState("")

  useEffect(() => {
    (async () => {
      const { data, error } = await createClient().from("pickings")
        .select("id, numero, fecha, referencia, estado, clientes(nombre), reports(numero), picking_lineas(count)")
        .order("numero", { ascending: false })
      if (error) setError(error.message)
      else setFilas((data ?? []) as unknown as Fila[])
      setLoading(false)
    })()
  }, [])

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas.filter(f =>
      (!estado || f.estado === estado) &&
      (!q || [String(f.numero), f.clientes?.nombre, f.referencia].some(v => v?.toLowerCase().includes(q))))
  }, [filas, texto, estado])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Picking" subtitle="Productos preparados para retirar, listos para cargar al report">
        <Button onClick={() => router.push("/picking/nuevo")} className="gap-1.5"><Plus className="h-4 w-4" /> Nuevo picking</Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por N°, cliente o referencia…" className="h-9 pl-8" />
          </div>
          <select value={estado} onChange={e => setEstado(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los estados</option>
            {ESTADOS_PICKING.map(e => <option key={e} value={e}>{ETIQUETA_ESTADO_PICKING[e]}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar los pickings: {error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay pickings. Crea el primero con &quot;Nuevo picking&quot;.</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún picking coincide con los filtros.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">N°</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Referencia</th>
                  <th className="px-3 py-2 font-medium text-right">Líneas</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={f.id} onClick={() => router.push(`/picking/${f.id}`)} className={cn("cursor-pointer hover:bg-muted/50", i % 2 === 1 && "bg-muted/20")}>
                    <td className="px-3 py-2 font-semibold">{f.numero}</td>
                    <td className="px-3 py-2">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{f.clientes?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{f.referencia ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.picking_lineas?.[0]?.count ?? 0}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", estadoPickingClase(f.estado))}>
                        {ETIQUETA_ESTADO_PICKING[f.estado as keyof typeof ETIQUETA_ESTADO_PICKING] ?? f.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2">{f.reports ? `#${f.reports.numero}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
