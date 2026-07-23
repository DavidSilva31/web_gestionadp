// Presets de color de acento para el tema claro, elegibles desde Mi Perfil.
// El valor real de cada preset (oklch de --primary/--accent/--secondary/--ring)
// vive en globals.css bajo `:root[data-accent="clave"]:not(.dark)`; acá solo
// se define la metadata para pintar el selector (nombre + punto de color).
export const ACCENT_COLORS: Record<string, { label: string; swatch: string }> = {
  celeste: { label: "Celeste ADP", swatch: "#29ABE2" },
  verde:   { label: "Verde",       swatch: "#16A34A" },
  indigo:  { label: "Índigo",      swatch: "#4F46E5" },
  morado:  { label: "Morado",      swatch: "#9333EA" },
  rosa:    { label: "Rosa",        swatch: "#DB2777" },
  naranja: { label: "Naranja",     swatch: "#EA580C" },
  teal:    { label: "Teal",        swatch: "#0D9488" },
}

export const ACCENT_COLOR_KEYS = Object.keys(ACCENT_COLORS)
