import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"
import { hashBytes, hashContenidoReport, ROL_FIRMA_LABEL, type EvidenciaFirma, type FirmaEvidencia, type RolFirma } from "@/lib/firma-hash"
import { decodeFirmaPng, clientIp } from "@/lib/firma-server"

// Registra la firma electrónica (simple, Ley 19.799) de un report: guarda la
// imagen y la evidencia (quién, cuándo, desde qué IP y la huella del contenido
// firmado). Conductor: dibujada en pantalla. Recepción / encargado de bodega:
// la firma guardada en el perfil del usuario que firma.
interface ReqBody {
  reportId?: string
  rol?:      RolFirma
  firma?:    string    // data URL PNG — solo rol "conductor"
}

const BUCKET = "reports-firmados"

// Columna de reports donde queda el path de la imagen, según quién firma.
const COLUMNA: Record<RolFirma, string> = {
  conductor: "firma_conductor_url",
  recepcion: "firma_recepcion_url",
  bodega:    "firma_bodega_url",
}
const PREFIJO: Record<RolFirma, string> = { conductor: "firma", recepcion: "firma-rec", bodega: "firma-bod" }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles").select("nombre, activo, firma_url").eq("id", user.id).single()
    if (profileErr || !profile) {
      console.error("[reports/firmar] error obteniendo perfil:", profileErr)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!profile.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })

    let body: ReqBody
    try { body = await req.json() as ReqBody }
    catch { return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 }) }

    const { reportId, rol } = body
    if (!reportId || (rol !== "conductor" && rol !== "recepcion" && rol !== "bodega"))
      return NextResponse.json({ error: "Solicitud incompleta." }, { status: 400 })

    let bytes: Uint8Array
    if (rol === "conductor") {
      const decoded = decodeFirmaPng(body.firma)
      if (!decoded) return NextResponse.json({ error: "La firma no es válida. Vuelve a firmar." }, { status: 400 })
      bytes = decoded
    } else {
      // Solo se acepta un archivo del propio usuario — profiles.firma_url es
      // editable por el cliente, así que no se confía en su valor.
      if (!profile.firma_url || !profile.firma_url.startsWith(`firma-perfil-${user.id}`))
        return NextResponse.json({ error: "Aún no registras tu firma. Regístrala en Configuración → Mi firma." }, { status: 400 })
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(BUCKET).download(profile.firma_url)
      if (dlErr || !blob) {
        console.error("[reports/firmar] error leyendo la firma del perfil:", dlErr)
        return NextResponse.json({ error: "No se pudo leer tu firma guardada." }, { status: 500 })
      }
      bytes = new Uint8Array(await blob.arrayBuffer())
    }

    const { data: report, error: reportErr } = await supabaseAdmin
      .from("reports").select("*").eq("id", reportId).single()
    if (reportErr || !report) return NextResponse.json({ error: "Report no encontrado." }, { status: 404 })
    if (report.estado === "despachado")
      return NextResponse.json({ error: "El report ya fue despachado — la firma no se puede modificar." }, { status: 409 })

    const path = `${PREFIJO[rol]}-${report.numero}-${report.id}.png`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET).upload(path, bytes, { upsert: true, contentType: "image/png" })
    if (uploadErr) {
      console.error("[reports/firmar] error subiendo firma:", uploadErr)
      return NextResponse.json({ error: "No se pudo guardar la firma." }, { status: 500 })
    }

    const entrada: EvidenciaFirma = {
      at:           new Date().toISOString(),
      user_id:      user.id,
      user_nombre:  profile.nombre ?? "",
      ip:           clientIp(req),
      user_agent:   (req.headers.get("user-agent") ?? "").slice(0, 300),
      hash:         await hashContenidoReport(report, rol),
      firma_sha256: await hashBytes(bytes),
    }
    const evidencia: FirmaEvidencia = { ...((report.firma_evidencia as FirmaEvidencia | null) ?? {}), [rol]: entrada }

    const { error: updateErr } = await supabaseAdmin.from("reports")
      .update({ [COLUMNA[rol]]: path, firma_evidencia: evidencia })
      .eq("id", reportId)
    if (updateErr) {
      console.error("[reports/firmar] error guardando firma en el report:", updateErr)
      return NextResponse.json({ error: "No se pudo registrar la firma en el report." }, { status: 500 })
    }

    await logAuditServer({
      tabla:          "reports",
      registro_id:    reportId,
      accion:         "report.firmar",
      descripcion:    `Firma de ${ROL_FIRMA_LABEL[rol]} — Report #${report.numero}`,
      usuario_id:     user.id,
      usuario_nombre: profile.nombre ?? null,
    })

    return NextResponse.json({ success: true, path, evidencia })
  } catch (err) {
    console.error("[reports/firmar] error inesperado:", err)
    return NextResponse.json({ error: "No se pudo registrar la firma." }, { status: 500 })
  }
}
