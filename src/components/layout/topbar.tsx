"use client"

import { Separator } from "@/components/ui/separator"
import { Bell, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/layout/theme-toggle"

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-[52px] items-center gap-3 border-b border-border/60 bg-background/98 backdrop-blur-sm px-4 sticky top-0 z-10">

      <div className="flex flex-col justify-center min-w-0">
        <h1 className="text-[13px] font-semibold text-foreground leading-none tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
          <Input
            placeholder="Buscar..."
            className="h-7 w-44 pl-7 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1 rounded-lg placeholder:text-muted-foreground/50"
          />
        </div>

        <ThemeToggle />

        <Button variant="ghost" size="icon" className="relative h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60">
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute top-0.5 right-0.5 h-2 w-2 bg-destructive rounded-full border border-background" />
        </Button>

        <Separator orientation="vertical" className="h-4 bg-border/60 mx-0.5" />

        <div className="flex items-center gap-2 pl-1 cursor-pointer group">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary text-[9px] font-bold text-primary-foreground">AD</AvatarFallback>
          </Avatar>
          <span className="text-[12px] font-medium text-foreground hidden sm:block group-hover:text-primary transition-colors">Admin</span>
        </div>
      </div>
    </header>
  )
}
