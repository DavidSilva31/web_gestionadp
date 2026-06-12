import { Topbar } from "@/components/layout/topbar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Package, Plus, Search, SlidersHorizontal } from "lucide-react"

const items = [
  { id: "ALM-001", nombre: "Contenedor 20' — Clase IMO 3",     categoria: "Contenedor IMO",   cliente: "Brenntag Chile S.A.",      area: "Bodega IMO",      stock: 6,  estado: "Normal"  },
  { id: "ALM-002", nombre: "Isotanque T14 — Cloro líquido",    categoria: "Isotanque",        cliente: "Ultramar Agencia Marít.",  area: "Zona Isotanques", stock: 2,  estado: "Normal"  },
  { id: "ALM-003", nombre: "RESPEL — Solventes usados 200L",   categoria: "Residuo peligroso",cliente: "CSAV Líneas Marítimas",    area: "Zona RESPEL",     stock: 15, estado: "Crítico" },
  { id: "ALM-004", nombre: "Contenedor 40' — Carga general",   categoria: "Carga general",    cliente: "Agencias Universales S.A.",area: "Bodega General",  stock: 4,  estado: "Normal"  },
  { id: "ALM-005", nombre: "Reactivos mineros — Clase IMO 8",  categoria: "Carga IMO",        cliente: "Codelco — Div. Andina",    area: "Bodega IMO",      stock: 28, estado: "Normal"  },
  { id: "ALM-006", nombre: "RESPEL — Aceites contaminados",    categoria: "Residuo peligroso",cliente: "Enex S.A.",               area: "Zona RESPEL",     stock: 3,  estado: "Bajo"    },
  { id: "ALM-007", nombre: "Isotanque T11 — Ácido sulfúrico",  categoria: "Isotanque",        cliente: "Brenntag Chile S.A.",      area: "Zona Isotanques", stock: 1,  estado: "Normal"  },
  { id: "ALM-008", nombre: "Alimentos secos — Pallet UV",      categoria: "Carga general",    cliente: "Agencias Universales S.A.",area: "Bodega General",  stock: 40, estado: "Normal"  },
]

const estadoBadge: Record<string, string> = {
  Normal:  "bg-emerald-50 text-emerald-700",
  Bajo:    "bg-amber-50 text-amber-700",
  Crítico: "bg-red-50 text-red-700",
}

const areaColor: Record<string, string> = {
  "Bodega IMO":      "bg-blue-50 text-blue-700",
  "Zona Isotanques": "bg-purple-50 text-purple-700",
  "Zona RESPEL":     "bg-orange-50 text-orange-700",
  "Bodega General":  "bg-teal-50 text-teal-700",
}

export default function InventarioPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Inventario" subtitle="Carga almacenada" />

      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 bg-muted/20">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Inventario de carga</h2>
            <p className="text-xs text-muted-foreground">{items.length} ítems almacenados · Bodega IMO, Isotanques, RESPEL y General</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <Input placeholder="Buscar ítem o cliente..." className="pl-8 h-7 w-52 text-xs bg-background border-border/60" />
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs border-border/60">
              <SlidersHorizontal className="h-3 w-3" /> Filtros
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90">
              <Plus className="h-3 w-3" /> Registrar ítem
            </Button>
          </div>
        </div>

        <Card className="flex-1 min-h-0 border-border/40 shadow-sm bg-background flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 z-10">
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead className="text-[11px] font-semibold text-muted-foreground pl-4 py-2">Ítem / Carga</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">Categoría</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden lg:table-cell py-2">Cliente</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden sm:table-cell py-2">Área</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground text-right py-2">Unid.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground text-right pr-4 py-2">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30 border-border/20 cursor-pointer">
                    <TableCell className="pl-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
                          <Package className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{p.nombre}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell py-2.5">{p.categoria}</TableCell>
                    <TableCell className="text-xs font-medium hidden lg:table-cell py-2.5 max-w-[150px] truncate">{p.cliente}</TableCell>
                    <TableCell className="hidden sm:table-cell py-2.5">
                      <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${areaColor[p.area] ?? "bg-muted text-muted-foreground"}`}>
                        {p.area}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right py-2.5">
                      <span className="text-sm font-bold">{p.stock}</span>
                    </TableCell>
                    <TableCell className="text-right pr-4 py-2.5">
                      <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${estadoBadge[p.estado]}`}>
                        {p.estado}
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
