import { NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { cargarFirmasReport } from "@/lib/report-firmas"
import { cargarBodegajeItems } from "@/lib/report-bodegaje"
import { ReportPDF } from "@/components/reports/report-pdf"
import type { Report } from "@/types/database"

export const runtime = "nodejs"

// Genera el PDF de un report en el servidor y lo sirve con Content-Disposition
// — a diferencia del blob: URL que arma el navegador (ver report-preview-modal.tsx
// / download-report-pdf.tsx), esto sí le da al botón de descarga del visor
// nativo del navegador (el de la barra del propio PDF embebido) un nombre de
// archivo real para sugerir al guardar, en vez del UUID del blob.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: report, error } = await supabase.from("reports").select("*").eq("id", id).single()
  if (error || !report) return NextResponse.json({ error: "Report no encontrado" }, { status: 404 })

  const [firmas, items] = await Promise.all([
    cargarFirmasReport(id, supabase),
    cargarBodegajeItems(id, supabase),
  ])

  const buffer = await renderToBuffer(
    <ReportPDF report={report as Report} firmas={firmas} items={items} />
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="report-${report.numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
