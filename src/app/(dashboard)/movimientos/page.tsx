import { Topbar } from "@/components/layout/topbar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowDownCircle, ArrowUpCircle, Search, Truck } from "lucide-react"

const movimientos = [
  { id: "MOV-001", tipo: "Ingreso",   servicio: "Almacenaje",  cliente: "CSAV Líneas Marítimas",    carga: "Contenedor 20' IMO Clase 3",    unidades: 3,  area: "Bodega IMO",      fecha: "11/06/2026 09:14", operador: "Carlos M.", estado: "Completado" },
  { id: "MOV-002", tipo: "Despacho",  servicio: "Transporte",  cliente: "Ultramar Agencia Marít.",  carga: "Isotanque T14 — Cloro líquido", unidades: 1,  area: "Zona Isotanques", fecha: "11/06/2026 08:32", operador: "Ana R.",    estado: "Completado" },
  { id: "MOV-003", tipo: "Ingreso",   servicio: "Almacenaje",  cliente: "Brenntag Chile S.A.",      carga: "RESPEL — Solventes usados",     unidades: 12, area: "Zona RESPEL",     fecha: "10/06/2026 16:45", operador: "Carlos M.", estado: "Completado" },
  { id: "MOV-004", tipo: "Despacho",  servicio: "Porteo",      cliente: "Enex S.A.",                carga: "Contenedor 40' Carga IMO",      unidades: 2,  area: "Bodega IMO",      fecha: "10/06/2026 14:20", operador: "Luis P.",   estado: "En proceso" },
  { id: "MOV-005", tipo: "Ingreso",   servicio: "Almacenaje",  cliente: "Codelco — Div. Andina",    carga: "Reactivos mineros Clase 8",     unidades: 28, area: "Bodega IMO",      fecha: "10/06/2026 11:05", operador: "Ana R.",    estado: "Completado" },
  { id: "MOV-006", tipo: "Ingreso",   servicio: "Logística",   cliente: "Agencias Universales",     carga: "Re-envasado carga IMO Clase 6", unidades: 5,  area: "Bodega IMO",      fecha: "09/06/2026 15:30", operador: "Luis P.",   estado: "Completado" },
]

const servicioBadge: Record<string, string> = {
  "Almacenaje": "bg-blue-50 text-blue-700",
  "Transporte": "bg-purple-50 text-purple-700",
  "Porteo":     "bg-cyan-50 text-cyan-700",
  "Logística":  "bg-violet-50 text-violet-700",
}

export default function MovimientosPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Movimientos" subtitle="Ingresos y despachos" />

      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 bg-muted/20">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Registro de movimientos</h2>
            <p className="text-xs text-muted-foreground">Almacenaje · Transporte · Porteo · Logística</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <Input placeholder="Buscar movimiento..." className="pl-8 h-7 w-48 text-xs bg-background border-border/60" />
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/50">
              <ArrowDownCircle className="h-3 w-3" /> Ingreso
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50 bg-amber-50/50">
              <Truck className="h-3 w-3" /> Despacho
            </Button>
          </div>
        </div>

        <Card className="flex-1 min-h-0 border-border/40 shadow-sm bg-background flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 z-10">
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead className="text-[11px] font-semibold text-muted-foreground pl-4 py-2">Movimiento</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground py-2">Servicio</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground py-2">Cliente</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">Carga</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden sm:table-cell py-2">Área</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden lg:table-cell py-2">Fecha</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground text-right pr-4 py-2">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/30 border-border/20 cursor-pointer">
                    <TableCell className="pl-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${m.tipo === "Ingreso" ? "bg-emerald-50" : "bg-amber-50"}`}>
                          {m.tipo === "Ingreso"
                            ? <ArrowDownCircle className="h-3 w-3 text-emerald-600" />
                            : <ArrowUpCircle className="h-3 w-3 text-amber-600" />}
                        </div>
                        <div>
                          <p className={`text-xs font-semibold ${m.tipo === "Ingreso" ? "text-emerald-700" : "text-amber-700"}`}>{m.tipo}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{m.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${servicioBadge[m.servicio] ?? "bg-muted text-muted-foreground"}`}>
                        {m.servicio}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <p className="text-xs font-medium truncate max-w-[130px]">{m.cliente}</p>
                      <p className="text-[10px] text-muted-foreground">{m.operador}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell py-2.5 max-w-[150px] truncate">{m.carga}</TableCell>
                    <TableCell className="hidden sm:table-cell py-2.5">
                      <Badge className="text-[10px] px-1.5 py-0 rounded-md font-medium border-0 bg-muted text-muted-foreground">{m.area}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell py-2.5">{m.fecha}</TableCell>
                    <TableCell className="text-right pr-4 py-2.5">
                      <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${m.estado === "Completado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {m.estado}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
