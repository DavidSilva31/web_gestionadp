"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import {
  Bell, Search, ArrowDownCircle, ArrowUpCircle, FileText,
  Loader2, CheckCheck, Package, Users, ArrowLeftRight, ClipboardList,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { useAuth } from "@/contexts/auth-context"
import { useNotifications, type NotificationItem } from "@/hooks/use-notifications"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────────
type ResultType = "cliente" | "inventario" | "movimiento" | "report"

interface SearchResult {
  id:       string
  type:     ResultType
  title:    string
  subtitle: string
  badge?:   string
  href:     string
}

interface GroupedResults {
  clientes:    SearchResult[]
  inventario:  SearchResult[]
  movimientos: SearchResult[]
  reports:     SearchResult[]
}

// ── Helpers notificaciones ─────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return "Ahora"
  if (min < 60) return `Hace ${min} min`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return days === 1 ? "Ayer" : `Hace ${days} días`
}

function estadoLabel(estado: string): string {
  if (estado === "despachado")         return "Despachado"
  if (estado === "pendiente_despacho") return "Pendiente despacho"
  return estado
}

function NotifIcon({ item }: { item: NotificationItem }) {
  if (item.estado === "despachado")
    return <ArrowUpCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
  if (item.tipo === "ingreso")
    return <ArrowDownCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
  return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
}

// ── Helpers búsqueda ───────────────────────────────────────────────────────────
const TYPE_META: Record<ResultType, { label: string; Icon: React.ElementType; color: string }> = {
  cliente:    { label: "Cliente",    Icon: Users,          color: "text-blue-500"    },
  inventario: { label: "Inventario", Icon: Package,        color: "text-emerald-500" },
  movimiento: { label: "Movimiento", Icon: ArrowLeftRight, color: "text-purple-500"  },
  report:     { label: "Report",     Icon: ClipboardList,  color: "text-amber-500"   },
}

async function globalSearch(q: string): Promise<GroupedResults> {
  const supabase = createClient()
  const term = `%${q}%`

  const [
    { data: clientes },
    { data: items },
    { data: movs },
    { data: reps },
  ] = await Promise.all([
    supabase.from("clientes")
      .select("id, numero, nombre, rut, sector")
      .eq("activo", true)
      .or(`nombre.ilike.${term},rut.ilike.${term}`)
      .limit(5),

    supabase.from("inventario_items")
      .select("id, numero, descripcion, categoria, cliente_id, area")
      .eq("activo", true)
      .ilike("descripcion", term)
      .limit(5),

    supabase.from("movimientos")
      .select("id, numero, tipo, carga, cliente_nombre, servicio")
      .or(`carga.ilike.${term},cliente_nombre.ilike.${term}`)
      .limit(5),

    supabase.from("reports")
      .select("id, numero, cliente, patente, conductor, estado")
      .neq("estado", "borrador")
      .or(`cliente.ilike.${term},patente.ilike.${term},conductor.ilike.${term}${!isNaN(Number(q)) && q.trim() !== "" ? `,numero.eq.${Number(q)}` : ""}`)
      .limit(5),
  ])

  return {
    clientes: (clientes ?? []).map(c => ({
      id:       c.id,
      type:     "cliente",
      title:    c.nombre,
      subtitle: `RUT ${c.rut}${c.sector ? ` · ${c.sector}` : ""}`,
      badge:    `CLI-${String(c.numero).padStart(3, "0")}`,
      href:     `/clientes`,
    })),

    inventario: (items ?? []).map(i => ({
      id:       i.id,
      type:     "inventario",
      title:    i.descripcion,
      subtitle: `${i.categoria} · ${i.area}`,
      badge:    `ALM-${String(i.numero).padStart(3, "0")}`,
      href:     `/inventario?cliente=${i.cliente_id}`,
    })),

    movimientos: (movs ?? []).map(m => ({
      id:       m.id,
      type:     "movimiento",
      title:    m.carga,
      subtitle: `${m.cliente_nombre} · ${m.servicio}`,
      badge:    `MOV-${String(m.numero).padStart(3, "0")}`,
      href:     `/movimientos`,
    })),

    reports: (reps ?? []).map(r => ({
      id:       r.id,
      type:     "report",
      title:    r.cliente,
      subtitle: `${r.patente} · ${estadoLabel(r.estado)}`,
      badge:    `REP-${String(r.numero).padStart(3, "0")}`,
      href:     `/reports/${r.id}`,
    })),
  }
}

function totalResults(g: GroupedResults) {
  return g.clientes.length + g.inventario.length + g.movimientos.length + g.reports.length
}

// ── Search panel ───────────────────────────────────────────────────────────────
function SearchResultGroup({
  label, results, onSelect,
}: {
  label: string
  results: SearchResult[]
  onSelect: () => void
}) {
  if (results.length === 0) return null
  return (
    <div>
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/30">
        {label}
      </p>
      {results.map(r => {
        const { Icon, color } = TYPE_META[r.type]
        return (
          <Link
            key={r.id}
            href={r.href}
            onClick={onSelect}
            className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", color)} />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{r.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
            </div>
            {r.badge && (
              <span className="text-[10px] font-mono text-muted-foreground/60 flex-shrink-0">
                {r.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ── Component principal ────────────────────────────────────────────────────────
export function Topbar() {
  const { profile } = useAuth()
  const { items, unread, loading: notifLoading, markAllRead } = useNotifications()
  const router = useRouter()

  // Notificaciones
  const [notifOpen, setNotifOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const bellRef  = useRef<HTMLButtonElement>(null)

  // Búsqueda
  const [query,      setQuery]      = useState("")
  const [results,    setResults]    = useState<GroupedResults | null>(null)
  const [searching,  setSearching]  = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  const initials    = profile?.nombre
    ? profile.nombre.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "AD"
  const displayName = profile?.nombre?.split(" ")[0] ?? "Admin"

  // ── Búsqueda global con debounce ───────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) { setResults(null); setSearchOpen(false); return }
    setSearching(true)
    setSearchOpen(true)
    const t = setTimeout(async () => {
      const res = await globalSearch(query.trim())
      setResults(res)
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // Click fuera del buscador → cerrar
  useEffect(() => {
    if (!searchOpen) return
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [searchOpen])

  // Escape → cerrar buscador
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") { setSearchOpen(false); setQuery("") }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  const clearSearch = useCallback(() => {
    setQuery("")
    setResults(null)
    setSearchOpen(false)
  }, [])

  // ── Notificaciones ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!notifOpen) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) setNotifOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [notifOpen])

  function handleBellClick() {
    if (!notifOpen) markAllRead()
    setNotifOpen(v => !v)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <header className="relative flex h-[52px] items-center border-b border-border/60 bg-background px-4 flex-shrink-0 z-20">

      {/* Buscador — centrado absolutamente */}
      <div
        ref={searchRef}
        className="absolute left-1/2 -translate-x-1/2 hidden sm:block"
      >
        <div className="relative">
          {searching
            ? <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 animate-spin" />
            : <Search  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          }
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (results) setSearchOpen(true) }}
            placeholder="Buscar clientes, inventario, movimientos..."
            className={cn(
              "h-8 pl-8 text-[12px] bg-muted/40 border-border/50 focus-visible:ring-1 rounded-lg placeholder:text-muted-foreground/50 transition-all",
              searchOpen ? "w-80 rounded-b-none border-b-0" : "w-64"
            )}
          />

          {/* Dropdown de resultados */}
          {searchOpen && (
            <div className="absolute top-full left-0 w-80 rounded-b-xl border border-t-0 border-border/60 bg-background shadow-lg overflow-hidden max-h-96 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Buscando...</span>
                </div>
              ) : results && totalResults(results) === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-1.5">
                  <Search className="h-6 w-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Sin resultados para "{query}"</p>
                </div>
              ) : results ? (
                <div className="divide-y divide-border/30">
                  <SearchResultGroup label="Clientes"    results={results.clientes}    onSelect={clearSearch} />
                  <SearchResultGroup label="Inventario"  results={results.inventario}  onSelect={clearSearch} />
                  <SearchResultGroup label="Movimientos" results={results.movimientos} onSelect={clearSearch} />
                  <SearchResultGroup label="Reports"     results={results.reports}     onSelect={clearSearch} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Controles — derecha */}
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />

        {/* Campana */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={handleBellClick}
            className={cn(
              "relative h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              notifOpen && "bg-muted/60 text-foreground"
            )}
          >
            <Bell className="h-3.5 w-3.5" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 h-4 w-4 flex items-center justify-center bg-destructive rounded-full border border-background text-[9px] font-bold text-white leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              ref={panelRef}
              className="absolute top-full right-0 mt-2 w-80 rounded-xl border border-border/60 bg-background shadow-lg z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[13px] font-semibold">Notificaciones</span>
                  {unread === 0 && !notifLoading && items.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">· Todo leído</span>
                  )}
                </div>
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  Leer todas
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Bell className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">Sin notificaciones</p>
                  </div>
                ) : (
                  <ul>
                    {items.map(item => (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-start gap-2.5 px-3 py-2.5 transition-colors border-b border-border/30 last:border-0",
                          item.isNew ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
                        )}
                      >
                        <span className={cn(
                          "mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0",
                          item.isNew ? "bg-primary" : "bg-transparent"
                        )} />
                        <NotifIcon item={item} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium leading-tight truncate">
                            {item.estado === "despachado"
                              ? "Reporte despachado"
                              : item.tipo === "ingreso"
                                ? "Nuevo ingreso registrado"
                                : "Reporte registrado"
                            }
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            REP-{String(item.numero).padStart(3, "0")} · {item.cliente}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              item.estado === "despachado"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}>
                              {estadoLabel(item.estado)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {relativeTime(item.updated_at)}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <Separator orientation="vertical" className="h-4 bg-border/60 mx-0.5" />

        <div className="flex items-center gap-2 pl-1 cursor-pointer group">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary text-[9px] font-bold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-[12px] font-medium text-foreground hidden sm:block group-hover:text-primary transition-colors">
            {displayName}
          </span>
        </div>
      </div>
    </header>
  )
}
