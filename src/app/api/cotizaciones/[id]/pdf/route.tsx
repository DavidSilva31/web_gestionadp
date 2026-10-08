import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { CotizacionPDF } from "@/components/cotizaciones/cotizacion-pdf"
import { construirCotizacionPDFData, nombreArchivoCotizacion } from "@/lib/cotizacion-pdf-build"

export const runtime = "nodejs"

// Genera el PDF de la cotización en el servidor y lo sirve con
// Content-Disposition — así el botón de descarga del visor nativo del
// navegador sugiere el nombre real del archivo, en vez del UUID del blob
// (mismo patrón que /api/reports/[id]/pdf).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: profile } = await supabase.from("profiles").select("role, activo").eq("id", user.id).single()
  if (!profile?.activo || profile.role !== "super_admin") {
    return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 })
  }

  const { data: cot, error } = await supabase.from("cotizaciones")
    .select("numero, fecha, emisor, atencion, ciudad, direccion, valor_uf, neto, iva, total, observaciones_extra, ocultar_totales, clientes_cotizacion(nombre, rut)")
    .eq("id", id).single()
  if (error || !cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })

  const [{ data: lineas }, { data: obs }] = await Promise.all([
    supabase.from("cotizacion_lineas").select("cantidad, descripcion, valor_uf, descuento_pct").eq("cotizacion_id", id).order("orden"),
    supabase.from("cotizacion_observaciones").select("observaciones_cotizacion(texto, observacion_tipos(nombre))").eq("cotizacion_id", id),
  ])

  const cliente = cot.clientes_cotizacion as unknown as { nombre: string; rut: string | null } | null
  const data = construirCotizacionPDFData(
    cot, cliente ?? { nombre: "—", rut: null }, lineas ?? [],
    (obs ?? []).map(o => {
      const oc = o.observaciones_cotizacion as unknown as { texto: string; observacion_tipos: { nombre: string } | null } | null
      return { texto: oc?.texto ?? "", observacion_tipos: oc?.observacion_tipos ?? null }
    })
  )

  const buffer = await renderToBuffer(<CotizacionPDF data={data} />)

  const nombre = nombreArchivoCotizacion(data)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  })
}
