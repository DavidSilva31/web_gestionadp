// Módulos del sistema a los que se puede dar acceso por usuario (permisos).
// Los permisos se guardan como rutas ("/inventario"); acá viven sus nombres
// legibles y los módulos por defecto de cada rol. Los usan la pantalla de
// Configuración (checkboxes de permisos) y el mensaje de auditoría de
// "Usuario actualizado" (/api/admin/update-user).
import type { UserRole } from "@/types/auth"

export const MODULE_OPTIONS = [
  { href: "/dashboard",           label: "Inicio",             group: "Módulos principales"     },
  { href: "/inventario",          label: "Inventario",         group: "Módulos principales"     },
  { href: "/picking",             label: "Picking",            group: "Módulos principales"     },
  { href: "/instalaciones",       label: "Instalaciones",      group: "Módulos principales"     },
  { href: "/movimientos",         label: "Movimientos",        group: "Módulos principales"     },
  { href: "/clientes",            label: "Clientes",           group: "Módulos principales"     },
  { href: "/servicios",           label: "Servicios",          group: "Módulos principales"     },
  { href: "/hes",                 label: "HES",                group: "Módulos principales"     },
  { href: "/reports",             label: "Reports",            group: "Servicio almacenamiento" },
  { href: "/transporte",          label: "Transporte",         group: "Servicio almacenamiento" },
  { href: "/transporte-incomex",  label: "Transporte ADP", group: "Servicio almacenamiento" },
  { href: "/auditoria",           label: "Auditoría",          group: "Administración"          },
]

export const ROLE_MODULE_DEFAULTS: Record<UserRole, string[]> = {
  super_admin:    ["/dashboard", "/inventario", "/picking", "/instalaciones", "/movimientos", "/clientes", "/servicios", "/hes", "/reports", "/transporte", "/transporte-incomex", "/auditoria"],
  operador:       ["/dashboard", "/inventario", "/picking", "/instalaciones", "/movimientos", "/clientes", "/servicios", "/hes", "/reports", "/transporte", "/transporte-incomex"],
  operador_carga: ["/inventario", "/picking", "/instalaciones", "/reports"],
}

export const MODULE_LABEL: Record<string, string> = Object.fromEntries(MODULE_OPTIONS.map(m => [m.href, m.label]))
