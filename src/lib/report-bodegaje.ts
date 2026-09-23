import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
import type { ReportBodegajeItem } from "@/types/database"

// Trae los productos de Bodegaje de un report — mismo patrón que
// cargarFirmasReport en report-firmas.ts, para pasarlos al PDF junto a las
// firmas (ver download-report-pdf.tsx / report-preview-modal.tsx). Cliente
// opcional — la ruta /api/reports/[id]/pdf pasa el suyo (servidor).
export async function cargarBodegajeItems(reportId: string, supabase: SupabaseClient = createClient()): Promise<ReportBodegajeItem[]> {
  const { data, error } = await supabase
    .from("report_bodegaje_items").select("*").eq("report_id", reportId).order("orden")
  if (error) { console.error("[report-bodegaje] error leyendo ítems:", error); return [] }
  return (data as ReportBodegajeItem[]) ?? []
}
