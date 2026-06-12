"use client"

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
import { useAuth } from "@/contexts/auth-context"
import { ROLE_ROUTES, ROLE_LABELS } from "@/types/auth"

const ALL_NAV_ITEMS = [
  { href: "/dashboard",        label: "Dashboard",   icon: LayoutDashboard, group: "main"    },
  { href: "/inventario",       label: "Inventario",  icon: Package,         group: "main"    },
  { href: "/movimientos",      label: "Movimientos", icon: ArrowLeftRight,  group: "main"    },
  { href: "/clientes",         label: "Clientes",    icon: Users,           group: "main"    },
  { href: "/reportes",         label: "Reportes",    icon: BarChart3,       group: "main"    },
  { href: "/usuarios",         label: "Usuarios",    icon: Users,           group: "main"    },
  { href: "/reports",          label: "Reports",     icon: ClipboardList,   group: "reports" },
  { href: "/reports/despacho", label: "Despacho",    icon: Truck,           group: "reports" },
]

interface NavItemDef { href: string; label: string; icon: React.ElementType; group: string }

function NavItem({ item }: { item: NavItemDef }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={isActive}
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

  const effectiveRole = role ?? 'operador'
  const allowedRoutes = ROLE_ROUTES[effectiveRole]
  const navItems = ALL_NAV_ITEMS.filter(item =>
    allowedRoutes.some(r => item.href === r || item.href.startsWith(r + '/') || r.startsWith(item.href + '/'))
  )
  const mainItems    = navItems.filter(i => i.group === "main")
  const reportsItems = navItems.filter(i => i.group === "reports")

  const initials = profile?.nombre
    ? profile.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'AD'

  return (
    <Sidebar collapsible="none">
      <SidebarHeader className="p-5 flex items-center justify-center">
        <Image
          src="/adp_logo.png"
          alt="Altos del Puerto"
          width={148}
          height={52}
          className="object-contain brightness-0 invert"
          priority
        />
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
            Módulos
          </SidebarGroupLabel>
          <SidebarMenu>
            {mainItems.map(item => <NavItem key={item.href} item={item} />)}
          </SidebarMenu>
        </SidebarGroup>

        {reportsItems.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-2 mb-1">
                Servicio almacenamiento
              </SidebarGroupLabel>
              <SidebarMenu>
                {reportsItems.map(item => <NavItem key={item.href} item={item} />)}
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
              className="h-10 w-full rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex items-center gap-3 px-3"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span>Configuración</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="h-10 w-full rounded-lg text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive flex items-center gap-3 px-3 cursor-pointer"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2" />

        <div className="flex items-center gap-3 px-2 py-1">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
              {initials}
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
