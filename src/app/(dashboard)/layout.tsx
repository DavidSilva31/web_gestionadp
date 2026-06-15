import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/contexts/auth-context"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
