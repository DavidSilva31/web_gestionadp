export type UserRole = 'super_admin' | 'operador' | 'operador_carga'

export interface Profile {
  id:                   string
  nombre:               string
  email:                string
  role:                 UserRole
  activo:               boolean
  permisos:             string[] | null
  inventario_solo_lectura?: boolean
  must_change_password: boolean
  notificaciones_activas: boolean
  avatar_icon:          string | null
  firma_url:            string | null
  accent_color:         string
  created_at:           string
  updated_at:           string
}

// Rutas permitidas por rol
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin:    ['/dashboard', '/inventario', '/picking', '/instalaciones', '/movimientos', '/clientes', '/reports', '/reports/nuevo', '/transporte', '/transporte-incomex', '/servicios-adicionales', '/hes', '/servicios', '/cotizaciones', '/tarifado-transporte', '/equipos', '/usuarios', '/configuracion', '/auditoria'],
  operador:       ['/dashboard', '/inventario', '/picking', '/instalaciones', '/movimientos', '/clientes', '/reports', '/reports/nuevo', '/transporte', '/transporte-incomex', '/servicios-adicionales', '/hes', '/servicios'],
  operador_carga: ['/inventario', '/picking', '/instalaciones', '/reports', '/reports/nuevo'],
}

// Ruta de inicio por rol tras login
export const DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin:    '/dashboard',
  operador:       '/dashboard',
  operador_carga: '/reports/nuevo',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:    'Super Admin',
  operador:       'Operador',
  operador_carga: 'Operador de Carga',
}

export function canAccess(role: UserRole, pathname: string, permisos?: string[] | null): boolean {
  if (role === 'super_admin') return true
  if (pathname === '/configuracion' || pathname.startsWith('/configuracion/')) return true
  if (permisos) {
    return permisos.some(route => pathname === route || pathname.startsWith(route + '/'))
  }
  const allowed = ROLE_ROUTES[role]
  return allowed.some(route => pathname === route || pathname.startsWith(route + '/'))
}
