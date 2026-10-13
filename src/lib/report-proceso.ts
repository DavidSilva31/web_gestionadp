// Reports de Depósito de Contenedores que NO se cierran al despachar el camión.
//
// Un 20ft o 40ft SIN "Almacenaje Full" ni "Almacenaje Vacío" es un contenedor
// que Operaciones debe trabajar después (consolidado/desconsolidado), un
// proceso largo: el chofer no puede esperar, así que el camión sale y el report
// queda "en_proceso" (con su PDF ya disponible) hasta que Operaciones lo cierre.
// Recién al cerrarlo pasa a "despachado" y el trigger de la base genera
// movimientos y stock.
//
// Isotanque, y 20ft/40ft con Almacenaje Full o Vacío (el contenedor entero se
// ingresa o se despacha tal cual), se cierran al despachar el camión, como
// siempre.
import type { ReportEstado } from "@/types/database"

interface ReportContenedor {
  sec1_activa?: boolean | null
  sec1_tipo_contenedor?: string | null
  sec1_almacenaje?: string | null
}

export function requiereProceso(r: ReportContenedor): boolean {
  return !!r.sec1_activa
    && (r.sec1_tipo_contenedor === "20ft" || r.sec1_tipo_contenedor === "40ft")
    && !r.sec1_almacenaje
}

// Estado en que queda un report cuando el camión sale (despacho en portería).
export function estadoAlDespachar(r: ReportContenedor): Extract<ReportEstado, "despachado" | "en_proceso"> {
  return requiereProceso(r) ? "en_proceso" : "despachado"
}
