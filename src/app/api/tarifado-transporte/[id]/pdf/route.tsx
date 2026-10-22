import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { TarifadoPDF } from "@/components/tarifado-transporte/tarifado-pdf"
import { construirTarifadoPDFData, nombreArchivoTarifado } from "@/lib/tarifado-transporte-pdf-build"

export const runtime = "nodejs"

// Genera el PDF del tarifado en el servidor y lo sirve con Content-Disposition, para que el botón de
// guardar del visor nativo del navegador sugiera el nombre real del archivo en vez del UUID del blob
// (mismo patrón que /api/cotizaciones/[id]/pdf).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role, activo").eq("id", user.id).single()
  if (!profile?.activo || profile.role !== "super_admin") {
    return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 })
  }

  const { data: t, error } = await supabase.from("tarifados")
    .select("numero, fecha, vigencia_desde, emisor, atencion, ciudad, direccion, observaciones_extra, clientes_cotizacion(nombre, rut)")
    .eq("id", id).single()
  if (error || !t) return NextResponse.json({ error: "Tarifado no encontrado" }, { status: 404 })

  const [{ data: lineas }, { data: obs }] = await Promise.all([
    supabase.from("tarifado_lineas").select("trayecto, capacidad, uf_pre_alza, valores_uf, resaltados").eq("tarifado_id", id).order("orden"),
    supabase.from("tarifado_observaciones").select("tarifado_obs_catalogo(texto, orden)").eq("tarifado_id", id),
  ])

  const cliente = t.clientes_cotizacion as unknown as { nombre: string; rut: string | null } | null
  const textos = (obs ?? [])
    .map(o => o.tarifado_obs_catalogo as unknown as { texto: string; orden: number } | null)
    .filter((o): o is { texto: string; orden: number } => !!o)
    .sort((a, b) => a.orden - b.orden)
    .map(o => o.texto)
  const data = construirTarifadoPDFData({
    numero: t.numero,
    fecha: t.fecha,
    vigenciaDesde: t.vigencia_desde,
    emisor: t.emisor,
    cliente: cliente ?? { nombre: "—", rut: null },
    atencion: t.atencion,
    ciudad: t.ciudad,
    direccion: t.direccion,
    lineas: (lineas ?? []).map(l => ({
      trayecto: l.trayecto,
      capacidad: l.capacidad,
      ufPreAlza: l.uf_pre_alza != null ? Number(l.uf_pre_alza) : null,
      valoresUF: (l.valores_uf ?? []).map(Number),
      resaltados: l.resaltados ?? [],
    })),
    observaciones: [...textos, ...(t.observaciones_extra?.trim() ? [t.observaciones_extra.trim()] : [])],
  })

  const buffer = await renderToBuffer(<TarifadoPDF data={data} />)

  const nombre = nombreArchivoTarifado(data)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  })
}
