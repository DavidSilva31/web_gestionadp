export type UserRole = 'super_admin' | 'operador' | 'operador_carga'

export interface Profile {
  id:         string
  nombre:     string
  email:      string
  role:       UserRole
  activo:     boolean
  created_at: string
  updated_at: string
}

// Rutas permitidas por rol
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin:    ['/dashboard', '/inventario', '/movimientos', '/clientes', '/reportes', '/reports', '/reports/nuevo', '/reports/despacho', '/usuarios', '/configuracion'],
  operador:       ['/dashboard', '/inventario', '/movimientos', '/clientes', '/reportes', '/reports', '/reports/nuevo', '/reports/despacho'],
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

export function canAccess(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ROUTES[role]
  return allowed.some(route => pathname === route || pathname.startsWith(route + '/'))
}
