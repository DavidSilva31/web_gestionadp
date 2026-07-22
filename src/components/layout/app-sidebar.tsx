"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  ClipboardList,
  Truck,
  Route,
  ShieldAlert,
  FileSpreadsheet,
  Wrench,
  Loader2,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { AVATAR_ICONS } from "@/lib/avatar-icons"
import { useAuth } from "@/contexts/auth-context"
import { useNavigationPending } from "@/contexts/navigation-pending-context"
import { ROLE_ROUTES, ROLE_LABELS } from "@/types/auth"

const ALL_NAV_ITEMS = [
  { href: "/dashboard",        label: "Inicio",      icon: LayoutDashboard, group: "inicio"     },
  { href: "/inventario",       label: "Inventario",  icon: Package,         group: "inventario" },
  { href: "/movimientos",      label: "Movimientos", icon: ArrowLeftRight,  group: "inventario" },
  { href: "/clientes",         label: "Clientes",    icon: Users,           group: "clientes"   },
  { href: "/servicios",        label: "Servicios",   icon: Wrench,          group: "clientes"   },
  { href: "/hes",              label: "HES",         icon: FileSpreadsheet, group: "clientes"   },
  { href: "/reportes",         label: "Analítica",   icon: BarChart3,       group: "analitica"  },
  { href: "/reports",          label: "Reports",     icon: ClipboardList,   group: "reports"    },
  { href: "/reports/despacho", label: "Despacho",    icon: Truck,           group: "reports"    },
  { href: "/transporte",       label: "Transporte",  icon: Route,           group: "reports"    },
  { href: "/auditoria",        label: "Auditoría",   icon: ShieldAlert,     group: "admin"      },
]

interface NavItemDef { href: string; label: string; icon: React.ElementType; group: string }

function NavItem({ item, allItems }: { item: NavItemDef; allItems: NavItemDef[] }) {
  const pathname = usePathname()
  const { startPending } = useNavigationPending()
  const matchesCurrent = pathname === item.href || pathname.startsWith(item.href + "/")
  const moreSpecificMatch = allItems.some(
    other => other.href !== item.href &&
             other.href.startsWith(item.href + "/") &&
             (pathname === other.href || pathname.startsWith(other.href + "/"))
  )
  const isActive = matchesCurrent && !moreSpecificMatch

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        onClick={() => { if (!isActive) startPending() }}
        className={cn(
          "h-10 w-full rounded-lg font-medium transition-all flex items-center gap-3 px-3",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span>{item.label}</span>
        {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { profile, role, signOut } = useAuth()
  const { startPending } = useNavigationPending()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      console.error("[app-sidebar] error cerrando sesión:", err)
      setSigningOut(false)
    }
  }
  const pathname = usePathname()

  const effectiveRole = role ?? 'operador'
  const navItems = ALL_NAV_ITEMS.filter(item => {
    if (effectiveRole !== 'super_admin' && profile?.permisos) {
      return profile.permisos.includes(item.href)
    }
    const allowed = ROLE_ROUTES[effectiveRole]
    return allowed.some(r => item.href === r || item.href.startsWith(r + '/') || r.startsWith(item.href + '/'))
  })
  const inicioItems     = navItems.filter(i => i.group === "inicio")
  const inventarioItems = navItems.filter(i => i.group === "inventario")
  const clientesItems   = navItems.filter(i => i.group === "clientes")
  const analiticaItems  = navItems.filter(i => i.group === "analitica")
  const reportsItems    = navItems.filter(i => i.group === "reports")
  const adminItems      = navItems.filter(i => i.group === "admin")

  const initials = profile?.nombre
    ? profile.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'AD'

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="pt-5 px-5 pb-1 flex items-center justify-center">
        <Image
          src="/adp_logo.png"
          alt="Altos del Puerto"
          width={180}
          height={64}
          className="object-contain brightness-0 invert"
          style={{ height: "auto" }}
          priority
        />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2 py-2">
        {/* Inicio — suelto, sin label, como acceso fijo de inicio */}
        {inicioItems.length > 0 && (
          <SidebarMenu>
            {inicioItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
          </SidebarMenu>
        )}

        {inventarioItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                Inventario
              </SidebarGroupLabel>
              <SidebarMenu>
                {inventarioItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {clientesItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                Clientes y facturación
              </SidebarGroupLabel>
              <SidebarMenu>
                {clientesItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {/* Analítica — suelta, sin label, cierra la sección principal */}
        {analiticaItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarMenu>
              {analiticaItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
            </SidebarMenu>
          </>
        )}

        {reportsItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                Servicio almacenamiento
              </SidebarGroupLabel>
              <SidebarMenu>
                {reportsItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                Administración
              </SidebarGroupLabel>
              <SidebarMenu>
                {adminItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/configuracion" />}
              onClick={() => { if (pathname !== "/configuracion") startPending() }}
              className={cn(
                "h-10 w-full rounded-lg font-medium transition-all flex items-center gap-3 px-3",
                pathname === "/configuracion"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Configuración</span>
              {pathname === "/configuracion" && <ChevronRight className="ml-auto h-3 w-3 opacity-60" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-10 w-full rounded-lg text-sidebar-foreground/70 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-3 px-3 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingOut
                ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                : <LogOut className="h-4 w-4 flex-shrink-0" />
              }
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2" />

        <div className="flex items-center gap-3 px-2 py-1">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
              {profile?.avatar_icon && AVATAR_ICONS[profile.avatar_icon]
                ? (() => { const Icon = AVATAR_ICONS[profile.avatar_icon]; return <Icon className="h-4 w-4" /> })()
                : initials
              }
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-sidebar-foreground truncate">
              {profile?.nombre ?? 'Usuario'}
            </span>
            <span className="text-xs text-sidebar-foreground/40 truncate">
              {role ? ROLE_LABELS[role] : ''}
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
