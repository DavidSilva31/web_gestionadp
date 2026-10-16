import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"
import { NavigationLoadingOverlay } from "@/components/layout/navigation-loading-overlay"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/auth-context"
import { NavigationPendingProvider } from "@/contexts/navigation-pending-context"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("activo")
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
    <AuthProvider>
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
