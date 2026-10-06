"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"

type FilaCotizacion = {
  id: string
  numero: number
  fecha: string
  emisor: string
  valor_uf: number
  total: number
  atencion: string | null
  clientes: { nombre: string } | null
}

const fmtCL = (n: number, dec = 0) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })

export default function CotizacionesPage() {
  const router = useRouter()
  const [filas, setFilas] = useState<FilaCotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("cotizaciones")
        .select("id, numero, fecha, emisor, valor_uf, total, atencion, clientes(nombre)")
        .order("numero", { ascending: false })
      if (error) setError(error.message)
      else setFilas((data ?? []) as unknown as FilaCotizacion[])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Cotizaciones" subtitle="Cotizaciones emitidas desde el sistema">
        <Button onClick={() => router.push("/cotizaciones/nueva")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva cotización
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las cotizaciones: {error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cotizaciones. Crea la primera con "Nueva cotización".</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">N°</th>
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">Emisor</th>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium">Atención</th>
                  <th className="px-3 py-2 text-right font-medium">Valor UF</th>
                  <th className="px-3 py-2 text-right font-medium">Total ($)</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.id}
                    onClick={() => router.push(`/cotizaciones/${f.id}`)}
                    className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{f.numero}</td>
                    <td className="px-3 py-2">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{f.emisor}</td>
                    <td className="px-3 py-2">{f.clientes?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{f.atencion ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmtCL(f.valor_uf, 2)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtCL(f.total)}</td>
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
