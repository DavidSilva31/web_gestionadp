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
}

const SEMAFORO_TITLE: Record<ReportEstado, string> = {
  borrador:              "Recepción — llenando Antecedentes y Depósito de Contenedores",
  pendiente_operaciones: "Esperando a Operaciones — Consolidado/Desconsolidado y Bodegaje",
  pendiente_despacho:    "Operador de carga listo — esperando devolución del físico en recepción",
  despachado:            "Cerrado",
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
