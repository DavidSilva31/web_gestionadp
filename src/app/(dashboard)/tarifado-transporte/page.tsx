"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Search, Trash2, Copy } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"
import { createClient } from "@/lib/supabase"
import { EMISORES } from "@/lib/cotizacion-pdf-build"
import { numeroTarifado } from "@/lib/tarifado-transporte-pdf-build"
import { duplicarTarifado } from "@/lib/tarifado-duplicar"

type Fila = {
  id: string
  numero: number
  fecha: string
  emisor: string
  atencion: string | null
  clientes_cotizacion: { nombre: string } | null
}

export default function TarifadoTransportePage() {
  const router = useRouter()
  const [filas, setFilas] = useState<Fila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState("")
  const [emisor, setEmisor] = useState("")
  const [aEliminar, setAEliminar] = useState<Fila | null>(null)
  const [duplicando, setDuplicando] = useState<string | null>(null)

  async function duplicar(id: string) {
    setError(null)
    setDuplicando(id)
    try { router.push(`/tarifado-transporte/${await duplicarTarifado(id)}`) }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo duplicar"); setDuplicando(null) }
  }
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    // Las tarifas y observaciones del tarifado se borran en cascada.
    const { error } = await createClient().from("tarifados").delete().eq("id", aEliminar.id)
    setEliminando(false)
    if (error) { setErrorEliminar(error.message); return }
    setFilas(prev => prev.filter(f => f.id !== aEliminar.id))
    setAEliminar(null)
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await createClient().from("tarifados")
        .select("id, numero, fecha, emisor, atencion, clientes_cotizacion(nombre)")
        .order("numero", { ascending: false })
      if (error) setError(error.message)
      else setFilas((data ?? []) as unknown as Fila[])
      setLoading(false)
    })()
  }, [])

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return filas.filter(f =>
      (!emisor || f.emisor === emisor) &&
      (!t || [numeroTarifado(f.numero, f.fecha), f.clientes_cotizacion?.nombre, f.atencion].some(v => v?.toLowerCase().includes(t))))
  }, [filas, texto, emisor])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Tarifado Transporte" subtitle="Tarifas escalonadas de transporte por cliente">
        <Button onClick={() => router.push("/tarifado-transporte/nuevo")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nuevo tarifado
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por N°, cliente, atención…" className="h-9 pl-8" />
          </div>
          <select value={emisor} onChange={e => setEmisor(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos los emisores</option>
            {EMISORES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar los tarifados: {error}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay tarifados. Crea el primero con "Nuevo tarifado".</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún tarifado coincide con los filtros.</p>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1a3a5c] text-white text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">N°</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Emisor</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Atención</th>
                  <th className="px-3 py-2 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={f.id} onClick={() => router.push(`/tarifado-transporte/${f.id}`)}
                    className={`cursor-pointer hover:bg-muted/50 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{numeroTarifado(f.numero, f.fecha)}</td>
                    <td className="px-3 py-2">{new Date(f.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                    <td className="px-3 py-2">{f.emisor}</td>
                    <td className="px-3 py-2">{f.clientes_cotizacion?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{f.atencion ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" disabled={duplicando !== null}
                        onClick={e => { e.stopPropagation(); duplicar(f.id) }}
                        className="mr-3 inline-flex items-center gap-1 text-xs text-[#1a3a5c] hover:underline disabled:opacity-50">
                        {duplicando === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                        Duplicar
                      </button>
                      <button type="button" onClick={e => { e.stopPropagation(); setErrorEliminar(null); setAEliminar(f) }}
                        className="text-muted-foreground hover:text-destructive" aria-label={`Eliminar tarifado ${numeroTarifado(f.numero, f.fecha)}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AlertDialog open={!!aEliminar} onOpenChange={o => { if (!o && !eliminando) { setAEliminar(null); setErrorEliminar(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarifado</AlertDialogTitle>
            <AlertDialogDescription>
              {errorEliminar ?? `¿Eliminar el tarifado N° ${aEliminar ? numeroTarifado(aEliminar.numero, aEliminar.fecha) : ""}? Se borran también sus tarifas y observaciones. No se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            {!errorEliminar && <AlertDialogAction disabled={eliminando} onClick={e => { e.preventDefault(); confirmarEliminar() }}>{eliminando ? "Eliminando…" : "Eliminar"}</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
