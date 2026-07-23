"use client"

import { Loader2 } from "lucide-react"
import { useNavigationPending } from "@/contexts/navigation-pending-context"

export function NavigationLoadingOverlay() {
  const { pending } = useNavigationPending()
  if (!pending) return null

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
