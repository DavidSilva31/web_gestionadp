import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { createServerSupabaseClient } from "@/lib/supabase-server"

type Asignacion = {
  encargado_nombre: string
  encargado_rut: string | null
  encargado_cargo: string | null
  fecha_entrega: string
  fecha_devolucion: string | null
  acta_path: string | null
}
type EquipoRow = {
  tipo: string
  marca: string
  modelo: string
  numero_serie: string | null
  estado: string
  observaciones: string | null
  equipo_asignaciones: Asignacion[]
}

const fmtFecha = (f: string | null) => (f ? f.split("-").reverse().join("-") : "")

function encabezado(ws: ExcelJS.Worksheet, columnas: { header: string; width: number }[]) {
  ws.columns = columnas.map(c => ({ header: c.header, width: c.width }))
  const fila = ws.getRow(1)
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } }
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } }
  fila.alignment = { vertical: "middle" }
  fila.height = 20
  ws.views = [{ state: "frozen", ySplit: 1 }]
}

// Excel con los equipos (con su encargado vigente) y el historial de entregas.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: profile } = await supabase.from("profiles").select("role, activo").eq("id", user.id).single()
    if (!profile?.activo || profile.role !== "super_admin") {
      return NextResponse.json({ error: "No tienes permiso para esta acción" }, { status: 403 })
    }

    const { data, error } = await supabase.from("equipos")
      .select("tipo, marca, modelo, numero_serie, estado, observaciones, equipo_asignaciones(encargado_nombre, encargado_rut, encargado_cargo, fecha_entrega, fecha_devolucion, acta_path)")
      .order("tipo").order("marca").order("modelo")
    if (error) return NextResponse.json({ error: "No se pudieron obtener los equipos." }, { status: 500 })
    const equipos = (data ?? []) as unknown as EquipoRow[]

    const wb = new ExcelJS.Workbook()
    wb.creator = "ADP Gestión"
    wb.created = new Date()

    const hoja = wb.addWorksheet("Equipos")
    encabezado(hoja, [
      { header: "Tipo", width: 16 }, { header: "Marca", width: 16 }, { header: "Modelo", width: 26 }, { header: "N° serie", width: 22 },
      { header: "Estado", width: 15 }, { header: "Encargado", width: 28 }, { header: "RUT", width: 14 }, { header: "Cargo / área", width: 22 },
      { header: "Fecha de entrega", width: 16 }, { header: "Acta firmada", width: 14 }, { header: "Observaciones", width: 36 },
    ])
    for (const e of equipos) {
      const a = e.equipo_asignaciones.find(x => x.fecha_devolucion === null)
      hoja.addRow([
        e.tipo, e.marca, e.modelo, e.numero_serie ?? "", e.estado,
        a?.encargado_nombre ?? "", a?.encargado_rut ?? "", a?.encargado_cargo ?? "",
        a ? fmtFecha(a.fecha_entrega) : "", a ? (a.acta_path ? "Sí" : "Falta") : "", e.observaciones ?? "",
      ])
    }

    const historial = wb.addWorksheet("Historial de entregas")
    encabezado(historial, [
      { header: "Equipo", width: 34 }, { header: "N° serie", width: 22 }, { header: "Encargado", width: 28 }, { header: "RUT", width: 14 },
      { header: "Cargo / área", width: 22 }, { header: "Entrega", width: 14 }, { header: "Devolución", width: 14 }, { header: "Acta firmada", width: 14 },
    ])
    for (const e of equipos) {
      for (const a of [...e.equipo_asignaciones].sort((x, y) => y.fecha_entrega.localeCompare(x.fecha_entrega))) {
        historial.addRow([
          `${e.marca} ${e.modelo}`, e.numero_serie ?? "", a.encargado_nombre, a.encargado_rut ?? "", a.encargado_cargo ?? "",
          fmtFecha(a.fecha_entrega), fmtFecha(a.fecha_devolucion), a.acta_path ? "Sí" : "Falta",
        ])
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Equipos_ADP_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (err) {
    console.error("[equipos/export] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo generar el archivo Excel." }, { status: 500 })
  }
}
