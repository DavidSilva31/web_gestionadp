export const TIPOS_EQUIPO = ["Notebook / PC", "Tablet"] as const
export const ESTADOS_EQUIPO = ["Disponible", "Asignado", "En reparación", "Dado de baja"] as const

export function estadoEquipoClase(estado: string): string {
  switch (estado) {
    case "Asignado":      return "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
    case "Disponible":    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    case "En reparación": return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    default:              return "bg-muted text-muted-foreground"
  }
}
