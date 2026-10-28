import { posicionesPorClase, TEMPORADA_UTI } from "@/lib/uti-posiciones"

type Mov = { tipo: string; imo: string | null; posiciones: number | null; report_id: string | null }

// Tabla de la hoja POSICIONES del Excel de UTI Chile (solo se usa en el Resumen de ese cliente).
export function UtiPosicionesCard({ movs }: { movs: Mov[] }) {
  const filas = posicionesPorClase(movs)
  const total = (k: "posiciones" | "inicial" | "despacho" | "ingreso") => filas.reduce((s, f) => s + f[k], 0)
  const num = "px-3 py-1.5 text-right tabular-nums"

  return (
    <div className="px-4 pt-4 pb-2">
    <div className="mx-auto max-w-xl rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-[#1a3a5c] text-white">
        <p className="text-xs font-semibold tracking-wide">TEMPORADA {TEMPORADA_UTI}</p>
        <p className="text-[11px] text-white/70">CIERRE INVENTARIO · posiciones por clase</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">CLASE</th>
            <th className="px-3 py-1.5 text-right font-medium">POSICIONES</th>
            <th className="px-3 py-1.5 text-right font-medium">INVENTARIO INICIAL</th>
            <th className="px-3 py-1.5 text-right font-medium">DESPACHO</th>
            <th className="px-3 py-1.5 text-right font-medium">INGRESO</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.clase} className="border-t">
              <td className="px-3 py-1.5 font-medium">{f.clase}</td>
              <td className={`${num} font-semibold`}>{f.posiciones}</td>
              <td className={`${num} text-muted-foreground`}>{f.inicial}</td>
              <td className={`${num} text-muted-foreground`}>{f.despacho}</td>
              <td className={`${num} text-muted-foreground`}>{f.ingreso}</td>
            </tr>
          ))}
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="px-3 py-1.5">TOTAL</td>
            <td className={num}>{total("posiciones")}</td>
            <td className={num}>{total("inicial")}</td>
            <td className={num}>{total("despacho")}</td>
            <td className={num}>{total("ingreso")}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </div>
  )
}
