import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { PickingPDF, type PickingPDFData } from "@/components/picking/picking-pdf"
import { detalleConRack } from "@/lib/inventario"
import { sanitizarNombreArchivo } from "@/lib/cotizacion-pdf-build"

export const runtime = "nodejs"

// PDF del picking generado en el servidor, con Content-Disposition para que al guardarlo desde el visor
// del navegador el archivo se llame Picking_{N°} {Cliente}.pdf (mismo patrón que cotizaciones y tarifados).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("activo").eq("id", user.id).single()
  if (!profile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })

  const { data: p, error } = await supabase.from("pickings")
    .select("numero, fecha, referencia, observaciones, clientes(nombre)").eq("id", id).single()
  if (error || !p) return NextResponse.json({ error: "Picking no encontrado" }, { status: 404 })
  const { data: lineas } = await supabase.from("picking_lineas")
    .select("codigo, producto, lote, numero_pallet, rack, bodega, peso_neto, posiciones, unidades").eq("picking_id", id).order("orden")

  const cliente = (p.clientes as unknown as { nombre: string } | null)?.nombre ?? "—"
  const data: PickingPDFData = {
    numero: p.numero,
    fecha: new Date(p.fecha + "T00:00:00").toLocaleDateString("es-CL"),
    cliente,
    referencia: p.referencia,
    observaciones: p.observaciones,
    conPallet: detalleConRack(cliente),
    lineas: (lineas ?? []).map(l => ({
      codigo: l.codigo, producto: l.producto, lote: l.lote, pallet: l.numero_pallet, rack: l.rack, bodega: l.bodega,
      peso: l.peso_neto != null ? Number(l.peso_neto) : null,
      posiciones: l.posiciones != null ? Number(l.posiciones) : null,
      unidades: l.unidades != null ? Number(l.unidades) : null,
    })),
  }

  const buffer = await renderToBuffer(<PickingPDF data={data} />)
  const nombre = sanitizarNombreArchivo(`Picking_${p.numero} ${cliente}.pdf`)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  })
}
