import { cn } from "@/lib/utils"
import type { ReportEstado } from "@/types/database"

// Semáforo del flujo físico del report (distinto del badge de estado, que ya
// tiene sus propios colores): amarillo = Recepción está llenando Antecedentes
// + Depósito de Contenedores (estado "borrador"); naranjo = Recepción guardó
// su parte, le toca a Operaciones completar Consolidado/Desconsolidado y
// Bodegaje (estado "pendiente_operaciones"); azul = Operaciones terminó, el
// chofer debe volver a recepción a buscar el físico (estado
// "pendiente_despacho"); verde = cerrado (estado "despachado").
const SEMAFORO_COLOR: Record<ReportEstado, string> = {
  borrador:              "bg-yellow-400",
  pendiente_operaciones: "bg-orange-500",
  pendiente_despacho:    "bg-blue-500",
  despachado:            "bg-emerald-500",
  anulado:               "bg-gray-400",
}

const SEMAFORO_TITLE: Record<ReportEstado, string> = {
  borrador:              "Recepción — llenando Antecedentes y Depósito de Contenedores",
  pendiente_operaciones: "Esperando a Operaciones — Consolidado/Desconsolidado y Bodegaje",
  pendiente_despacho:    "Operador de carga listo — esperando devolución del físico en recepción",
  despachado:            "Cerrado",
  anulado:               "Anulado — no cuenta para stock ni facturación",
}

// Etiqueta del badge para el estado "despachado" — se separa en "Finalizado
// - Ingreso" / "Finalizado - Despacho" según el tipo de movimiento del
// report (sec3_tipo, que vive en Antecedentes pese al prefijo histórico:
// aplica a todo el report, no solo a Bodegaje — ver "Tipo de movimiento" en
// el PDF). Sin esto, la lista mostraba "Despachado" tanto para un ingreso
// como para un despacho, sin distinguirlos.
export function estadoDespachadoLabel(sec3Tipo: string | null | undefined): string {
  if (sec3Tipo === "ingreso")  return "Finalizado - Ingreso"
  if (sec3Tipo === "despacho") return "Finalizado - Despacho"
  return "Finalizado"
}

export function EstadoSemaforo({ estado, className }: { estado: ReportEstado; className?: string }) {
  return (
    <span
      title={SEMAFORO_TITLE[estado]}
      aria-label={SEMAFORO_TITLE[estado]}
      className={cn("inline-block h-2.5 w-2.5 rounded-full flex-shrink-0", SEMAFORO_COLOR[estado], className)}
    />
  )
}
