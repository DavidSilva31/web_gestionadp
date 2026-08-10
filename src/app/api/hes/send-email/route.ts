import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { getPeriodRange } from "@/lib/hes-calc"
import {
  loadCliente, buildHesData, buildWorkbook, excelBuffer, excelFilename, MESES,
  type ServicioSeleccion,
} from "@/lib/hes-workbook"
import { renderResumenPdfBuffer, renderResumenUnificadoPdfBuffer } from "@/lib/hes-pdf-server"

interface ReqBody {
  clienteId:  string
  tarifaId?:  string
  tarifaIds?: string[]
  mes:        number
  anio:       number
  ufValue:    string
  ufDate:     string
  servicioSeleccion?: ServicioSeleccion
  adjuntos: { resumen: boolean; detalle: boolean }
  // Opcional — por defecto se usan los emails de contacto del cliente.
  destinatarios?: string[]
}

export async function POST(req: NextRequest) {
  try {
    return await handleSendEmail(req)
  } catch (err) {
    console.error("[hes/send-email] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo enviar el correo." }, { status: 500 })
  }
}

async function handleSendEmail(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  if (!process.env.RESEND_API_KEY)
    return NextResponse.json({ error: "Servicio de email no configurado (falta RESEND_API_KEY)." }, { status: 503 })

  let body: ReqBody
  try {
    body = await req.json() as ReqBody
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
  }
  const { clienteId, tarifaId, tarifaIds, mes, anio, ufValue, ufDate, servicioSeleccion = {}, adjuntos, destinatarios } = body

  if (!clienteId || (!tarifaId && !tarifaIds?.length))
    return NextResponse.json({ error: "Cliente o tarifa no especificados" }, { status: 400 })
  if (!Number.isInteger(mes) || mes < 0 || mes > 11)
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100)
    return NextResponse.json({ error: "Año inválido" }, { status: 400 })
  if (!adjuntos?.resumen && !adjuntos?.detalle)
    return NextResponse.json({ error: "Selecciona al menos un adjunto (resumen o detalle)." }, { status: 400 })

  const clienteInfo = await loadCliente(supabase, clienteId)
  if (!clienteInfo)
    return NextResponse.json({ error: "Cliente no encontrado o sin permiso para verlo." }, { status: 404 })
  const { cliente, diaCorte } = clienteInfo
  const period = getPeriodRange(anio, mes, diaCorte)

  const destino = (destinatarios?.length ? destinatarios : cliente.emails).filter(Boolean)
  if (destino.length === 0)
    return NextResponse.json({ error: "El cliente no tiene un email de contacto registrado." }, { status: 400 })

  const ufNum  = parseFloat(ufValue)
  const ufSafe = Number.isFinite(ufNum) && ufNum > 0 ? ufNum : 0

  const built = await buildHesData(supabase, clienteId, { tarifaId, tarifaIds }, period, ufSafe, servicioSeleccion)
  if (!built.ok)
    return NextResponse.json({ error: built.error }, { status: built.status })

  const clienteData = { nombre: cliente.nombre, rut: cliente.rut ?? "", emails: cliente.emails, contacto: cliente.contacto }
  const attachments: { filename: string; content: Buffer }[] = []

  if (adjuntos.detalle) {
    const wb = buildWorkbook(cliente, mes, anio, period, ufSafe, built, servicioSeleccion)
    attachments.push({ filename: excelFilename(cliente.nombre, mes, anio), content: await excelBuffer(wb) })
  }

  if (adjuntos.resumen) {
    let pdfBuffer: Buffer
    if (built.isUnificado) {
      const filas: { label: string; cotizacion: string | null; totalUF: number; totalCLP: number }[] = built.results.map(r => ({
        label:      r.tarifa.clase_imo ?? r.tarifa.cotizacion_numero,
        cotizacion: r.tarifa.cotizacion_numero,
        totalUF:    r.billing.finalUF,
        totalCLP:   r.billing.finalCLP,
      }))
      for (const sr of built.srvBilling.rows) {
        filas.push({
          label: `Servicio: ${sr.label}`, cotizacion: null,
          totalUF: sr.moneda === "CLP" ? 0 : sr.totalCLP / (ufSafe || 1), totalCLP: sr.totalCLP,
        })
      }
      const totalUF  = built.results.reduce((s, r) => s + r.billing.finalUF, 0) + built.srvBilling.finalUF
      const totalCLP = built.results.reduce((s, r) => s + r.billing.finalCLP, 0) + built.srvBilling.finalCLP
      pdfBuffer = await renderResumenUnificadoPdfBuffer({ cliente: clienteData, filas, totalUF, totalCLP, mes, anio, ufValue, ufDate })
    } else {
      const r = built.results[0]
      pdfBuffer = await renderResumenPdfBuffer({
        cliente: clienteData,
        tarifa: { cotizacion_numero: r.tarifa.cotizacion_numero, clase_imo: r.tarifa.clase_imo },
        billing: r.billing, mes, anio, ufValue, ufDate,
      })
    }
    attachments.push({ filename: `HES_${cliente.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${MESES[mes]}_${anio}_Resumen.pdf`, content: pdfBuffer })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const periodoLabel = `${MESES[mes]} ${anio}`
  const fromAddress = process.env.RESEND_FROM_EMAIL || "HES Altos del Puerto <onboarding@resend.dev>"

  const { error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: destino,
    subject: `HES ${cliente.nombre} — ${periodoLabel}`,
    html: `
      <p>Estimado(a) ${cliente.contacto ?? "cliente"},</p>
      <p>Adjuntamos la Hoja de Estado de Servicio (HES) de <strong>${cliente.nombre}</strong> correspondiente a <strong>${periodoLabel}</strong>.</p>
      <p>Saludos cordiales,<br/>Altos del Puerto — Logística Integral</p>
    `,
    attachments,
  })
  if (sendError)
    return NextResponse.json({ error: `No se pudo enviar el correo: ${sendError.message}` }, { status: 502 })

  return NextResponse.json({ success: true, enviadoA: destino })
}
