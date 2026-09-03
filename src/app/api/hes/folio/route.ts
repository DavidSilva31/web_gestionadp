import { NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]

interface ReqBody {
  clienteId:  string
  tarifaId?:  string
  tarifaIds?: string[]
  mes:        number
  anio:       number
  periodStart: string
  periodEnd:   string
  totalUF?:  number
  totalCLP?: number
}

// Asigna un folio correlativo único cada vez que se genera un HES (botón
// "Generar HES") — antes dos generaciones del mismo cliente/mes eran
// documentos idénticos sin nada que los distinga entre sí.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    // proxy.ts excluye /api/* del chequeo de activo — cada ruta lo hace sola.
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("nombre, activo").eq("id", user.id).single()
    if (profileErr) {
      console.error("[hes/folio] error obteniendo perfil:", profileErr)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!profile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })

    let body: ReqBody
    try {
      body = await req.json() as ReqBody
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { clienteId, tarifaId, tarifaIds, mes, anio, periodStart, periodEnd, totalUF, totalCLP } = body

    const ids = tarifaIds?.length ? tarifaIds : (tarifaId ? [tarifaId] : [])
    if (!clienteId || ids.length === 0)
      return NextResponse.json({ error: "Cliente o tarifa no especificados" }, { status: 400 })
    if (!Number.isInteger(mes) || mes < 0 || mes > 11)
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
    if (!Number.isInteger(anio) || anio < 2020 || anio > 2100)
      return NextResponse.json({ error: "Año inválido" }, { status: 400 })
    if (!periodStart || !periodEnd)
      return NextResponse.json({ error: "Período no especificado" }, { status: 400 })

    const { data: cliente } = await supabase.from("clientes").select("nombre").eq("id", clienteId).single()

    const { data, error } = await supabase
      .from("hes_folios")
      .insert({
        cliente_id: clienteId,
        tarifa_ids: ids,
        mes, anio,
        periodo_start: periodStart,
        periodo_end:   periodEnd,
        total_uf:  totalUF  ?? null,
        total_clp: totalCLP ?? null,
        generado_por: user.id,
        generado_por_nombre: profile?.nombre ?? user.email,
      })
      .select("id, numero")
      .single()

    if (error || !data) {
      console.error("[hes/folio] error asignando folio:", error)
      return NextResponse.json({ error: "No se pudo asignar el folio." }, { status: 500 })
    }

    // El folio ya quedó insertado arriba — si esto falla no debe tumbar la
    // respuesta ni hacer creer al cliente que el folio no se asignó (un
    // reintento suyo generaría un segundo folio correlativo para el mismo HES).
    await logAuditServer({
      tabla:          "hes_folios",
      registro_id:    data.id,
      accion:         "hes.generar",
      descripcion:    `HES N° HES-${String(data.numero).padStart(6, "0")} generado — ${cliente?.nombre ?? clienteId} — ${MESES[mes]} ${anio}`,
      usuario_id:     user.id,
      usuario_nombre: profile?.nombre ?? user.email,
    }).catch(err => console.error("[hes/folio] error registrando auditoría:", err))

    return NextResponse.json({ id: data.id, numero: data.numero })
  } catch (err) {
    console.error("[hes/folio] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo asignar el folio." }, { status: 500 })
  }
}
