import { Topbar } from "@/components/layout/topbar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileDown, TrendingUp, BarChart3, ArrowDownCircle, ArrowUpCircle, Users, Package } from "lucide-react"

const resumenMensual = [
  { mes: "Ene", entradas: 142, salidas: 98  },
  { mes: "Feb", entradas: 168, salidas: 110 },
  { mes: "Mar", entradas: 155, salidas: 124 },
  { mes: "Abr", entradas: 190, salidas: 87  },
  { mes: "May", entradas: 172, salidas: 134 },
  { mes: "Jun", entradas: 184, salidas: 97  },
]
const maxVal = Math.max(...resumenMensual.flatMap(m => [m.entradas, m.salidas]))

const topProductos = [
  { nombre: "Solvente Industrial 500L", movimientos: 48, pct: 82 },
  { nombre: "Gas Nitrógeno Comprimido", movimientos: 35, pct: 60 },
  { nombre: "Combustible HVO 1000L",    movimientos: 28, pct: 48 },
  { nombre: "Ácido Clorhídrico 200L",   movimientos: 22, pct: 38 },
  { nombre: "Reactivos Mineros 50kg",   movimientos: 15, pct: 26 },
]

const summaryCards = [
  { label: "Total movimientos", value: "281", sub: "Junio 2026",   icon: BarChart3,       gradient: "from-[#0A4A7F] to-[#1A5276]" },
  { label: "Entradas",          value: "184", sub: "+8% vs mayo",  icon: ArrowDownCircle, gradient: "from-emerald-600 to-emerald-700" },
  { label: "Salidas",           value: "97",  sub: "-3% vs mayo",  icon: ArrowUpCircle,   gradient: "from-amber-500 to-orange-500" },
  { label: "Clientes activos",  value: "34",  sub: "empresas",     icon: Users,           gradient: "from-[#29ABE2] to-[#1A8BBD]" },
]

export default function ReportesPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Reportes" subtitle="Estadísticas y análisis" />

      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-3 p-4 bg-muted/20">

        {/* Fila 1 — Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Reportes del almacén</h2>
            <p className="text-xs text-muted-foreground">Resumen estadístico — Junio 2026</p>
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-border/60">
            <FileDown className="h-3 w-3" /> Exportar PDF
          </Button>
        </div>

        {/* Fila 2 — KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((s) => (
            <div key={s.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${s.gradient} px-4 py-3 text-white shadow-sm`}>
              <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-white/5 -translate-y-5 translate-x-5" />
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-white/20">
                  <s.icon className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight leading-none">{s.value}</p>
              <p className="text-white/65 text-[11px] mt-1">{s.label}</p>
              <p className="text-white/45 text-[10px] mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Fila 3 — Gráficos (llenan el espacio restante) */}
        <div className="grid grid-cols-2 gap-3 min-h-0">

          {/* Gráfico de barras */}
          <Card className="border-border/40 shadow-sm bg-background flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Movimientos por mes</CardTitle>
                  <CardDescription className="text-xs">Entradas vs salidas — 2026</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col px-4 py-3">
              <div className="flex-1 min-h-0 flex items-end gap-2">
                {resumenMensual.map((m) => (
                  <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 h-full">
                    <div className="w-full flex gap-0.5 items-end flex-1">
                      <div className="flex-1 bg-primary rounded-t-sm" style={{ height: `${(m.entradas / maxVal) * 100}%` }} />
                      <div className="flex-1 rounded-t-sm" style={{ height: `${(m.salidas / maxVal) * 100}%`, backgroundColor: "#29ABE2" }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium flex-shrink-0">{m.mes}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 pt-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-3 rounded-sm bg-primary inline-block" /> Entradas
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-3 rounded-sm inline-block" style={{ backgroundColor: "#29ABE2" }} /> Salidas
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top productos */}
          <Card className="border-border/40 shadow-sm bg-background flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Productos más activos</CardTitle>
                  <CardDescription className="text-xs">Por movimientos — Junio 2026</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col justify-between px-4 py-3">
              {topProductos.map((p, i) => (
                <div key={p.nombre}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground/40 w-4 flex-shrink-0">#{i + 1}</span>
                      <div className="p-1 bg-muted rounded flex-shrink-0">
                        <Package className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-medium truncate">{p.nombre}</span>
                    </div>
                    <span className="text-xs font-bold ml-2 flex-shrink-0">{p.movimientos}</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
