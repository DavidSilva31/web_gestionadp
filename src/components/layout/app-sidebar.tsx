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
  Warehouse,
  Container,
  ListPlus,
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
  SidebarTrigger,
  useSidebar,
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
  { href: "/instalaciones",    label: "Instalaciones", icon: Warehouse,     group: "inventario" },
  { href: "/movimientos",      label: "Movimientos", icon: ArrowLeftRight,  group: "inventario" },
  { href: "/clientes",         label: "Clientes",    icon: Users,           group: "clientes"   },
  { href: "/servicios",        label: "Servicios",   icon: Wrench,          group: "clientes"   },
  { href: "/hes",              label: "HES",         icon: FileSpreadsheet, group: "clientes"   },
  { href: "/reportes",         label: "Analítica",   icon: BarChart3,       group: "analitica"  },
  { href: "/reports",          label: "Reports",     icon: ClipboardList,   group: "reports"    },
  { href: "/reports/despacho", label: "Despacho",    icon: Truck,           group: "reports"    },
  { href: "/transporte",       label: "Transporte",  icon: Route,           group: "reports"    },
  { href: "/transporte-incomex", label: "Transporte ADP", icon: Container, group: "reports"  },
  { href: "/servicios-adicionales", label: "Servicios Adicionales", icon: ListPlus, group: "reports" },
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
        tooltip={item.label}
        className={cn(
          "h-9 w-full rounded-lg font-medium transition-all flex items-center gap-3 px-3",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
        {isActive && <ChevronRight className="ml-auto h-3 w-3 opacity-60 group-data-[collapsible=icon]:hidden" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { profile, role, signOut } = useAuth()
  const { startPending } = useNavigationPending()
  const { state } = useSidebar()
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-3 px-5 pb-1 flex flex-col items-center gap-2 group-data-[collapsible=icon]:px-2">
        {state === "collapsed" ? (
          <Image
            src="/adp_icon.png"
            alt="Altos del Puerto"
            width={38}
            height={56}
            className="object-contain brightness-0 invert"
            style={{ height: "auto" }}
            priority
          />
        ) : (
          <Image
            src="/adp_logo.png"
            alt="Altos del Puerto"
            width={180}
            height={64}
            className="object-contain brightness-0 invert"
            style={{ height: "auto" }}
            priority
          />
        )}
        <SidebarTrigger className="hidden md:flex text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
      </SidebarHeader>

      <SidebarSeparator />

      {/* relative + fade: en pantallas bajas (notebook 1366x768) el listado de
          navegación puede seguir necesitando scroll — el degradé avisa que hay
          más ítems abajo en vez de cortarse sin aviso. */}
      <div className="relative flex-1 min-h-0">
      {/* El componente base de shadcn apaga el scroll cuando está colapsado
          a solo íconos (piensa que siempre entra sin scroll) — acá no es el
          caso con esta cantidad de ítems en pantallas más bajas, así que se
          fuerza a que siga scrolleando igual que expandido. */}
      <SidebarContent className="h-full px-2 py-1 group-data-[collapsible=icon]:overflow-y-auto!">
        {/* Inicio — suelto, sin label, como acceso fijo de inicio */}
        {inicioItems.length > 0 && (
          <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
            {inicioItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
          </SidebarMenu>
        )}

        {inventarioItems.length > 0 && (
          <>
            <SidebarSeparator className="my-0.5 group-data-[collapsible=icon]:my-2" />
            <SidebarGroup className="py-0.5">
              <SidebarGroupLabel className="h-5 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-0.5">
                Inventario
              </SidebarGroupLabel>
              <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
                {inventarioItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {clientesItems.length > 0 && (
          <>
            <SidebarSeparator className="my-0.5 group-data-[collapsible=icon]:my-2" />
            <SidebarGroup className="py-0.5">
              <SidebarGroupLabel className="h-5 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-0.5">
                Clientes y facturación
              </SidebarGroupLabel>
              <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
                {clientesItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {/* Analítica — suelta, sin label, cierra la sección principal */}
        {analiticaItems.length > 0 && (
          <>
            <SidebarSeparator className="my-0.5 group-data-[collapsible=icon]:my-2" />
            <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
              {analiticaItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
            </SidebarMenu>
          </>
        )}

        {reportsItems.length > 0 && (
          <>
            <SidebarSeparator className="my-0.5 group-data-[collapsible=icon]:my-2" />
            <SidebarGroup className="py-0.5">
              <SidebarGroupLabel className="h-5 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-0.5">
                Servicio almacenamiento
              </SidebarGroupLabel>
              <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
                {reportsItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <SidebarSeparator className="my-0.5 group-data-[collapsible=icon]:my-2" />
            <SidebarGroup className="py-0.5">
              <SidebarGroupLabel className="h-5 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-0.5">
                Administración
              </SidebarGroupLabel>
              <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
                {adminItems.map(item => <NavItem key={item.href} item={item} allItems={navItems} />)}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent" />
      </div>

      <SidebarSeparator />

      <SidebarFooter className="py-1.5 px-2">
        <SidebarMenu className="group-data-[collapsible=icon]:gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/configuracion" />}
              onClick={() => { if (pathname !== "/configuracion") startPending() }}
              tooltip="Configuración"
              className={cn(
                "h-9 w-full rounded-lg font-medium transition-all flex items-center gap-3 px-3",
                pathname === "/configuracion"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Configuración</span>
              {pathname === "/configuracion" && <ChevronRight className="ml-auto h-3 w-3 opacity-60 group-data-[collapsible=icon]:hidden" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              disabled={signingOut}
              tooltip="Cerrar sesión"
              className="h-9 w-full rounded-lg text-sidebar-foreground/70 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-3 px-3 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingOut
                ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
                : <LogOut className="h-4 w-4 flex-shrink-0" />
              }
              <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-1" />

        <div className="flex items-center gap-3 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
              {profile?.avatar_icon && AVATAR_ICONS[profile.avatar_icon]
                ? (() => { const Icon = AVATAR_ICONS[profile.avatar_icon]; return <Icon className="h-4 w-4" /> })()
                : initials
              }
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
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
