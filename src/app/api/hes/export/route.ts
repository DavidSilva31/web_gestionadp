import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { getPeriodRange, isValidPeriodOverride } from "@/lib/hes-calc"
import {
  loadCliente, buildHesData, buildWorkbook, excelBuffer, excelFilename,
  type ServicioSeleccion,
} from "@/lib/hes-workbook"

interface ReqBody {
  clienteId:  string
  tarifaId?:  string    // modo normal: una sola tarifa
  tarifaIds?: string[]  // modo unificado: todas las tarifas del cliente
  mes:        number
  anio:       number
  ufValue:    string
  // Elección real del usuario (cuánto de cada servicio opcional facturar) —
  // no son totales, así que es seguro confiar en esto; los montos finales
  // siempre se recalculan server-side con los datos de la base.
  servicioSeleccion?: ServicioSeleccion
  // Rango de fechas elegido a mano (ej. el cliente solo usó bodegaje una
  // parte del mes) — si viene, pisa el período calculado a partir de mes/anio.
  periodStart?: string
  periodEnd?:   string
  // Folio asignado por /api/hes/folio al abrir la vista previa — se estampa
  // en el documento, pero si no viene el Excel igual se genera sin número.
  folioNumero?: number | null
}

export async function POST(req: NextRequest) {
  try {
    return await handleExport(req)
  } catch (err) {
    console.error("[hes/export] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo generar el archivo Excel." }, { status: 500 })
  }
}

async function handleExport(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  let body: ReqBody
  try {
    body = await req.json() as ReqBody
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
  }
  const { clienteId, tarifaId, tarifaIds, mes, anio, ufValue, servicioSeleccion = {}, periodStart, periodEnd, folioNumero } = body

  if (!clienteId || (!tarifaId && !tarifaIds?.length))
    return NextResponse.json({ error: "Cliente o tarifa no especificados" }, { status: 400 })
  if (!Number.isInteger(mes) || mes < 0 || mes > 11)
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100)
    return NextResponse.json({ error: "Año inválido" }, { status: 400 })

  const clienteInfo = await loadCliente(supabase, clienteId)
  if (!clienteInfo)
    return NextResponse.json({ error: "Cliente no encontrado o sin permiso para verlo." }, { status: 404 })
  const { cliente, diaCorte } = clienteInfo
  const override = { start: periodStart, end: periodEnd }
  const period = isValidPeriodOverride(override) ? override : getPeriodRange(anio, mes, diaCorte)

  const ufNum  = parseFloat(ufValue)
  const ufSafe = Number.isFinite(ufNum) && ufNum > 0 ? ufNum : 0

  const built = await buildHesData(supabase, clienteId, { tarifaId, tarifaIds }, period, ufSafe, servicioSeleccion)
  if (!built.ok)
    return NextResponse.json({ error: built.error }, { status: built.status })

  const wb = buildWorkbook(cliente, mes, anio, period, ufSafe, built, servicioSeleccion, folioNumero)
  const buffer = await excelBuffer(wb)
  return new NextResponse(buffer as unknown as ArrayBuffer, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${excelFilename(cliente.nombre, mes, anio)}"`,
    },
  })
}
