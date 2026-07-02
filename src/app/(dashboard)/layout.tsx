import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/auth-context"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("activo")
    .eq("id", user.id)
    .single()

  if (!profile?.activo) redirect("/login?error=cuenta_desactivada")

  return (
    <AuthProvider>
      <TooltipProvider>
        <SidebarProvider className="h-screen overflow-hidden" style={{ "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}>
          <AppSidebar />
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <Topbar />
            {children}
          </main>
        </SidebarProvider>
      </TooltipProvider>
    </AuthProvider>
  )
}
