import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { getUserConReintento } from "@/lib/auth-reintento"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"
import { NavigationLoadingOverlay } from "@/components/layout/navigation-loading-overlay"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/auth-context"
import type { Profile } from "@/types/auth"
import { NavigationPendingProvider } from "@/contexts/navigation-pending-context"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { user, errorDeRed } = await getUserConReintento(supabase, "dashboard/layout")

  // Sin conexión con Supabase no se puede saber si la sesión sigue vigente: se avisa
  // en el login en vez de dejarlo como si la sesión hubiera expirado.
  if (!user && errorDeRed) redirect("/login?error=verificacion_fallida")
  if (!user) redirect("/login")

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  // Un error de red/timeout no significa que la cuenta esté desactivada —
  // no hay que confundir "no pudimos verificar" con "está deshabilitada".
  if (profileError) {
    console.error("[dashboard/layout] no se pudo verificar el estado de la cuenta:", profileError)
    redirect("/login?error=verificacion_fallida")
  }
  if (!profile?.activo) redirect("/login?error=cuenta_desactivada")

  return (
    <AuthProvider initialProfile={profile as Profile}>
      <TooltipProvider>
        <NavigationPendingProvider>
          <SidebarProvider className="h-screen overflow-hidden" style={{ "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}>
            <AppSidebar />
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <Topbar />
              <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
                <NavigationLoadingOverlay />
                {children}
              </div>
            </main>
          </SidebarProvider>
        </NavigationPendingProvider>
      </TooltipProvider>
    </AuthProvider>
  )
}
