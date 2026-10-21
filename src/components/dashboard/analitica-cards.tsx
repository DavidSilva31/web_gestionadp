import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Users, Package, MapPin, TrendingUp, Loader2 } from "lucide-react"
import { AREA_ORDER } from "@/hooks/use-analitica"

const AREA_COLORS: Record<string, { dot: string }> = {
  "Bodega IMO":      { dot: "bg-amber-500"   },
  "Zona Isotanques": { dot: "bg-sky-500"     },
  "Zona RESPEL":     { dot: "bg-rose-500"    },
  "Bodega General":  { dot: "bg-emerald-500" },
}

// Tarjetas de analítica del Inicio (antes en /reportes).
export function CargasActivasCard({ loading, topItems, periodoLabel }: {
  loading: boolean
  topItems: { nombre: string; entradas: number; salidas: number; total: number; pct: number }[]
  periodoLabel: string
}) {
  return (
    <Card className="border-border/40 shadow-sm bg-background flex flex-col xl:min-h-[220px]">
      <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><TrendingUp className="h-3.5 w-3.5 text-primary" /></div>
            <div>
              <CardTitle className="text-sm font-bold tracking-tight">Cargas más activas</CardTitle>
              <CardDescription className="text-xs">Por movimientos — {periodoLabel}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Ent.</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />Sal.</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col justify-between px-4 py-3 flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : topItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <div className="p-3 rounded-xl bg-muted/50"><TrendingUp className="h-6 w-6 text-muted-foreground/25" /></div>
            <p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {topItems.map((p, i) => {
              const entrRatio = p.total > 0 ? Math.round((p.entradas / p.total) * 100) : 0
              return (
                <div key={p.nombre}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground/40 w-4 flex-shrink-0">#{i + 1}</span>
                      <div className="p-1 bg-muted rounded flex-shrink-0"><Package className="h-2.5 w-2.5 text-muted-foreground" /></div>
                      <span className="text-xs font-medium truncate">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-[10px] text-emerald-600 font-medium">↓{p.entradas}</span>
                      <span className="text-[10px] text-amber-500 font-medium">↑{p.salidas}</span>
                      <span className="text-xs font-bold text-foreground w-4 text-right">{p.total}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full flex overflow-hidden" style={{ width: `${p.pct}%` }}>
                      <div className="h-full bg-emerald-500" style={{ width: `${entrRatio}%` }} />
                      <div className="h-full bg-amber-400 flex-1" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ClientesActivosCard({ loading, topClientes, periodoLabel }: {
  loading: boolean
  topClientes: { nombre: string; total: number; pct: number }[]
  periodoLabel: string
}) {
  return (
    <Card className="border-border/40 shadow-sm bg-background flex flex-col xl:min-h-[220px]">
      <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#29ABE2]/10"><Users className="h-3.5 w-3.5 text-[#29ABE2]" /></div>
          <div>
            <CardTitle className="text-sm font-bold tracking-tight">Clientes más activos</CardTitle>
            <CardDescription className="text-xs">Por movimientos — {periodoLabel}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col justify-between px-4 py-3 flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : topClientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <div className="p-3 rounded-xl bg-muted/50"><Users className="h-6 w-6 text-muted-foreground/25" /></div>
            <p className="text-xs text-muted-foreground">Sin movimientos registrados aún</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {topClientes.map((c, i) => (
              <div key={c.nombre}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground/40 w-4 flex-shrink-0">#{i + 1}</span>
                    <div className="h-5 w-5 rounded-full bg-[#29ABE2]/10 flex items-center justify-center flex-shrink-0">
                      <Users className="h-2.5 w-2.5 text-[#29ABE2]" />
                    </div>
                    <span className="text-xs font-medium truncate">{c.nombre}</span>
                  </div>
                  <span className="text-xs font-bold ml-2 flex-shrink-0">{c.total}</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#29ABE2]" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DistribucionAreaCard({ loading, areaData, periodoLabel }: {
  loading: boolean
  areaData: { area: string; entradas: number; salidas: number; total: number; pct: number }[]
  periodoLabel: string
}) {
  return (
    <Card className="border-border/40 shadow-sm bg-background flex flex-col xl:min-h-[220px]">
      <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10"><MapPin className="h-3.5 w-3.5 text-primary" /></div>
          <div>
            <CardTitle className="text-sm font-bold tracking-tight">Distribución por área</CardTitle>
            <CardDescription className="text-xs">Movimientos por zona — {periodoLabel}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3 flex flex-col justify-between gap-3 flex-1 min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {AREA_ORDER.map(area => {
              const d  = areaData.find(x => x.area === area) ?? { area, entradas: 0, salidas: 0, total: 0, pct: 0 }
              const ac = AREA_COLORS[area] ?? { dot: "bg-muted" }
              const er = d.total > 0 ? Math.round((d.entradas / d.total) * 100) : 0
              return (
                <div key={area}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${ac.dot}`} />
                      <span className="text-xs font-medium truncate text-foreground/80">{area}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-[10px] text-emerald-600 font-medium">↓{d.entradas}</span>
                      <span className="text-[10px] text-amber-500 font-medium">↑{d.salidas}</span>
                      <span className="text-xs font-bold text-foreground w-4 text-right">{d.total}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    {d.total > 0 && (
                      <div className="h-full flex" style={{ width: `${Math.max(d.pct, 6)}%` }}>
                        <div className="h-full bg-emerald-500" style={{ width: `${er}%` }} />
                        <div className="h-full bg-amber-400 flex-1" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
