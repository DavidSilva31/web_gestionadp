import { Topbar } from "@/components/layout/topbar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Plus, Search, Package } from "lucide-react"

const clientes = [
  { id: "CLI-001", nombre: "Brenntag Chile S.A.",          rut: "76.543.210-K", contacto: "Rodrigo Fernández", email: "rfernandez@brenntag.cl",  items: 6,  sector: "Importación",   estado: "Activo" },
  { id: "CLI-002", nombre: "CSAV Líneas Marítimas",         rut: "90.160.000-7", contacto: "Claudia Morales",   email: "cmorales@csav.com",        items: 4,  sector: "Marítimo",      estado: "Activo" },
  { id: "CLI-003", nombre: "Ultramar Agencia Marítima",     rut: "82.236.000-5", contacto: "Felipe Arriagada",  email: "farriagada@ultramar.cl",   items: 3,  sector: "Marítimo",      estado: "Activo" },
  { id: "CLI-004", nombre: "Enex S.A.",                     rut: "76.348.440-3", contacto: "Daniela Riquelme",  email: "driquelme@enex.cl",        items: 5,  sector: "Industrial",    estado: "Activo" },
  { id: "CLI-005", nombre: "Codelco — Div. Andina",         rut: "61.704.000-K", contacto: "Marco Espinoza",    email: "mespinoza@codelco.cl",     items: 8,  sector: "Minería",       estado: "Activo" },
  { id: "CLI-006", nombre: "Agencias Universales S.A.",     rut: "90.701.000-3", contacto: "Valentina Lagos",   email: "vlagos@agunsa.cl",         items: 3,  sector: "Marítimo",      estado: "Activo" },
  { id: "CLI-007", nombre: "Solvay Chile S.A.",             rut: "76.182.300-9", contacto: "Hernán Muñoz",      email: "hmunoz@solvay.com",        items: 0,  sector: "Industria química", estado: "Inactivo" },
]

const sectorColor: Record<string, string> = {
  "Marítimo":         "bg-blue-50 text-blue-700",
  "Importación":      "bg-cyan-50 text-cyan-700",
  "Industrial":       "bg-orange-50 text-orange-700",
  "Minería":          "bg-amber-50 text-amber-700",
  "Industria química":"bg-purple-50 text-purple-700",
}

const avatarColors = [
  "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
]

export default function ClientesPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Clientes" subtitle="Empresas registradas" />

      <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 bg-muted/20">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold tracking-tight">Gestión de clientes</h2>
            <p className="text-xs text-muted-foreground">{clientes.filter(c => c.estado === "Activo").length} activos · {clientes.length} en total · Sectores portuario e industrial</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <Input placeholder="Buscar empresa o RUT..." className="pl-8 h-7 w-52 text-xs bg-background border-border/60" />
            </div>
            <Button size="sm" className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90">
              <Plus className="h-3 w-3" /> Nuevo cliente
            </Button>
          </div>
        </div>

        <Card className="flex-1 min-h-0 border-border/40 shadow-sm bg-background flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 z-10">
                <TableRow className="hover:bg-transparent border-border/30">
                  <TableHead className="text-[11px] font-semibold text-muted-foreground pl-4 py-2">Empresa</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">RUT</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden sm:table-cell py-2">Contacto</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden lg:table-cell py-2">Email</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground hidden md:table-cell py-2">Sector</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground text-right py-2">Ítems</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground text-right pr-4 py-2">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c, idx) => {
                  const initials = c.nombre.split(" ").slice(0, 2).map(w => w[0]).join("")
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/30 border-border/20 cursor-pointer">
                      <TableCell className="pl-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarFallback className={`text-[10px] font-bold ${avatarColors[idx % avatarColors.length]}`}>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-semibold max-w-[160px] truncate">{c.nombre}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{c.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground hidden md:table-cell py-2.5">{c.rut}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell py-2.5">{c.contacto}</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell py-2.5">{c.email}</TableCell>
                      <TableCell className="hidden md:table-cell py-2.5">
                        <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${sectorColor[c.sector] ?? "bg-muted text-muted-foreground"}`}>
                          {c.sector}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Package className="h-3 w-3 text-muted-foreground/40" />
                          <span className="text-sm font-bold">{c.items}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-4 py-2.5">
                        <Badge className={`text-[10px] px-1.5 py-0 rounded-md font-medium border-0 ${c.estado === "Activo" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                          {c.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
