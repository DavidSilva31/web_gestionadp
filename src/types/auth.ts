export type UserRole = 'super_admin' | 'operador' | 'operador_carga'

export interface Profile {
  id:                   string
  nombre:               string
  email:                string
  role:                 UserRole
  activo:               boolean
  permisos:             string[] | null
  must_change_password: boolean
  notificaciones_activas: boolean
  avatar_icon:          string | null
  created_at:           string
  updated_at:           string
}

// Rutas permitidas por rol
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin:    ['/dashboard', '/inventario', '/movimientos', '/clientes', '/reportes', '/reports', '/reports/nuevo', '/reports/despacho', '/transporte', '/hes', '/servicios', '/usuarios', '/configuracion', '/auditoria'],
  operador:       ['/dashboard', '/inventario', '/movimientos', '/clientes', '/reportes', '/reports', '/reports/nuevo', '/reports/despacho', '/transporte', '/hes', '/servicios'],
  operador_carga: ['/inventario', '/reports', '/reports/nuevo', '/reports/despacho'],
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
