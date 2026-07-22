import { Anchor, Ship, Truck, Package, Compass, Shield, Star, Zap, type LucideIcon } from "lucide-react"

// Set de íconos disponibles para personalizar el avatar del perfil.
// null / clave no reconocida → se sigue mostrando las iniciales del nombre.
export const AVATAR_ICONS: Record<string, LucideIcon> = {
  anchor:  Anchor,
  ship:    Ship,
  truck:   Truck,
  package: Package,
  compass: Compass,
  shield:  Shield,
  star:    Star,
  zap:     Zap,
}

export const AVATAR_ICON_KEYS = Object.keys(AVATAR_ICONS)
