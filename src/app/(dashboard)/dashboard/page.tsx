import { Topbar } from "@/components/layout/topbar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Package, ArrowDownCircle, ArrowUpCircle, Users,
  AlertTriangle, ArrowRight, Zap,
} from "lucide-react"

const kpis = [
  { title: "Unidades en bodega",    value: "1,248", unit: "ítems almacenados",        change: "+12 esta semana",    icon: Package,         gradient: "from-[#0A4A7F] to-[#1A5276]" },
  { title: "Ingresos del mes",      value: "184",   unit: "recepciones registradas",  change: "+8% vs mes anterior", icon: ArrowDownCircle, gradient: "from-emerald-600 to-emerald-700" },
  { title: "Despachos del mes",     value: "97",    unit: "salidas despachadas",      change: "-3% vs mes anterior", icon: ArrowUpCircle,   gradient: "from-amber-500 to-orange-500" },
  { title: "Clientes activos",      value: "34",    unit: "empresas con carga",       change: "+2 nuevos este mes",  icon: Users,           gradient: "from-[#29ABE2] to-[#1A8BBD]" },
]

const recentMovements = [
  { id: "MOV-001", tipo: "Ingreso",   cliente: "CSAV Líneas Marítimas",   producto: "Contenedor 20' IMO",      cantidad: 3,  fecha: "Hoy 09:14",  estado: "Completado" },
  { id: "MOV-002", tipo: "Despacho",  cliente: "Ultramar Agencia Marít.", producto: "Isotanque T14 Cl₂",       cantidad: 1,  fecha: "Hoy 08:32",  estado: "Completado" },
  { id: "MOV-003", tipo: "Ingreso",   cliente: "Brenntag Chile S.A.",     producto: "RESPEL — Solventes usados",cantidad: 12, fecha: "Ayer 16:45", estado: "Completado" },
  { id: "MOV-004", tipo: "Despacho",  cliente: "Enex S.A.",               producto: "Contenedor 40' Carga IMO", cantidad: 2,  fecha: "Ayer 14:20", estado: "En proceso" },
  { id: "MOV-005", tipo: "Ingreso",   cliente: "Codelco — Div. Andina",   producto: "Reactivos mineros Clase 8",cantidad: 28, fecha: "Ayer 11:05", estado: "Completado" },
]

const ocupacion = [
  { zona: "Bodega IMO",        detalle: "Sustancias peligrosas",    ocupado: 78,  total: 100 },
  { zona: "Zona Isotanques",   detalle: "Isotanques y contenedores",ocupado: 45,  total: 80  },
  { zona: "Zona RESPEL",       detalle: "Residuos peligrosos",      ocupado: 62,  total: 60  },
  { zona: "Bodega General",    detalle: "Carga general y alimentos", ocupado: 30,  total: 120 },
]

const alertas = [
  { msg: "Zona RESPEL supera el 100% de capacidad",          nivel: "critical" },
  { msg: "3 ítems IMO próximos a vencer documentación",      nivel: "warning"  },
  { msg: "MOV-004 lleva 18 hrs en proceso de despacho",      nivel: "info"     },
]

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Dashboard" subtitle="Visión general del almacén" />

      <div className="flex-1 min-h-0 grid grid-rows-[auto_auto_1fr] gap-3 p-4 bg-muted/20">

        {/* Fila 1 — Banner */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0A4A7F] via-[#0D5A98] to-[#29ABE2] px-5 py-3 text-white shadow-md">
          <div className="absolute -top-6 -right-6 h-32 w-32 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">Miércoles, 11 de junio 2026 · Camino La Pólvora 106, Valparaíso</p>
              <h2 className="text-base font-bold tracking-tight mt-0.5">Buen día, Admin</h2>
              <p className="text-white/70 text-xs mt-0.5">
                Tienes <span className="text-white font-semibold">3 alertas</span> activas y <span className="text-white font-semibold">1 despacho</span> en proceso.
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 flex-shrink-0">
              <Zap className="h-3 w-3 text-yellow-300" />
              <span className="text-xs font-medium">Sistema operativo</span>
            </div>
          </div>
        </div>

        {/* Fila 2 — KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.title} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${kpi.gradient} px-4 py-3 text-white shadow-sm`}>
              <div className="absolute top-0 right-0 h-14 w-14 rounded-full bg-white/5 -translate-y-5 translate-x-5" />
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-white/20">
                  <kpi.icon className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] text-white/60">{kpi.change}</span>
              </div>
              <p className="text-2xl font-bold tracking-tight leading-none">{kpi.value}</p>
              <p className="text-white/65 text-[11px] mt-1">{kpi.unit}</p>
            </div>
          ))}
        </div>

        {/* Fila 3 — Contenido principal */}
        <div className="grid grid-cols-3 gap-3 min-h-0">

          <Card className="col-span-2 border-border/40 shadow-sm bg-background flex flex-col min-h-0">
            <CardHeader className="py-3 px-4 flex-shrink-0 border-b border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold tracking-tight">Movimientos recientes</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Últimos ingresos y despachos</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary gap-1 px-2">
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/40 z-10">
                  <TableRow className="hover:bg-transparent border-border/30">
                    <TableHead className="text-[11px] font-semibold text-muted-foreground pl-4 py-2">Movimiento</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground py-2">Cliente</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">Carga</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground text-right py-2">Cant.</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground text-right pr-4 py-2">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMovements.map((mov) => (
                    <TableRow key={mov.id} className="hover:bg-muted/30 border-border/20 cursor-pointer">
                      <TableCell className="pl-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${mov.tipo === "Ingreso" ? "bg-emerald-50" : "bg-amber-50"}`}>
                            {mov.tipo === "Ingreso"
                              ? <ArrowDownCircle className="h-3 w-3 text-emerald-600" />
                              : <ArrowUpCircle className="h-3 w-3 text-amber-600" />}
                          </div>
                          <div>
                            <p className="text-xs font-semibold">{mov.tipo}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{mov.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <p className="text-xs font-medium truncate max-w-[130px]">{mov.cliente}</p>
                        <p className="text-[10px] text-muted-foreground">{mov.fecha}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell py-2 max-w-[130px] truncate">{mov.producto}</TableCell>
                      <TableCell className="text-sm font-bold text-right py-2">{mov.cantidad}</TableCell>
                      <TableCell className="text-right pr-4 py-2">
                        <Badge className={`text-[10px] px-1.5 py-0 rounded-md border-0 ${mov.estado === "Completado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {mov.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 min-h-0">
            <Card className="border-border/40 shadow-sm bg-background flex-shrink-0">
              <CardHeader className="py-3 px-4 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-md bg-amber-50">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm font-bold tracking-tight">Alertas</CardTitle>
                  <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">{alertas.length}</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5">
                {alertas.map((a, i) => (
                  <div key={i} className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium border-l-2 ${
                    a.nivel === "critical" ? "bg-red-50 text-red-700 border-red-400"
                    : a.nivel === "warning" ? "bg-amber-50 text-amber-700 border-amber-400"
                    : "bg-muted/60 text-muted-foreground border-border"
                  }`}>
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.nivel === "critical" ? "bg-red-500" : a.nivel === "warning" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                    {a.msg}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/40 shadow-sm bg-background flex-1 min-h-0 flex flex-col">
              <CardHeader className="py-3 px-4 border-b border-border/30 flex-shrink-0">
                <CardTitle className="text-sm font-bold tracking-tight">Ocupación por área</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col justify-between">
                {ocupacion.map((z) => {
                  const pct = Math.round((z.ocupado / z.total) * 100)
                  const color    = pct >= 100 ? "bg-red-500"    : pct >= 70 ? "bg-amber-500"    : "bg-emerald-500"
                  const txtColor = pct >= 100 ? "text-red-600"  : pct >= 70 ? "text-amber-600"  : "text-emerald-600"
                  return (
                    <div key={z.zona}>
                      <div className="flex justify-between items-end mb-1">
                        <div>
                          <p className="text-xs font-semibold">{z.zona}</p>
                          <p className="text-[10px] text-muted-foreground">{z.detalle}</p>
                        </div>
                        <span className={`text-xs font-bold ${txtColor}`}>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
