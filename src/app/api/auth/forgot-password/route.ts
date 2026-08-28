import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { resolveSiteUrl } from "@/lib/site-url"
import { generateTempPassword } from "@/lib/temp-password"
import { wrapBrandedEmail, brandButton, emailColors } from "@/lib/email-brand"

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { email } = body
    if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 })

    const normalized = email.toLowerCase().trim()

    // La respuesta es siempre la misma sin importar si el correo existe,
    // está registrado o activo — de lo contrario un atacante puede probar
    // direcciones y usar la diferencia de respuesta (404 vs 200) para
    // enumerar qué correos tienen cuenta en el sistema.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, nombre, activo")
      .eq("email", normalized)
      .single()

    if (profile?.activo) {
      // Antes usaba supabase.auth.resetPasswordForEmail(), que manda el correo
      // nativo de Supabase Auth (su template propio, sin marca ADP y con costo
      // aparte por personalizarlo). Ahora se genera una contraseña temporal y
      // se avisa por Resend, mismo patrón que admin/create-user —
      // must_change_password fuerza el cambio en el primer login igual.
      const tempPassword = generateTempPassword()
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, { password: tempPassword })
      if (pwErr) {
        console.error("[auth/forgot-password] error fijando contraseña temporal:", pwErr)
      } else {
        await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", profile.id)
        await sendResetEmail(req, normalized, profile.nombre ?? "", tempPassword)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[auth/forgot-password] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}

async function sendResetEmail(req: NextRequest, email: string, nombre: string, tempPassword: string) {
  if (!process.env.RESEND_API_KEY) {
    console.error("[auth/forgot-password] RESEND_API_KEY no configurado, no se pudo enviar la clave temporal")
    return
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const fromAddress = process.env.RESEND_FROM_EMAIL || "Altos del Puerto <onboarding@resend.dev>"
    const loginUrl = `${resolveSiteUrl(req)}/login`
    const bodyHtml = `
      <h1 style="margin:0 0 6px;font-size:20px;color:${emailColors.text};">Restablecimos tu contraseña</h1>
      <p style="margin:0 0 20px;font-size:14px;color:${emailColors.muted};line-height:1.6;">Hola ${nombre}, solicitaste restablecer tu contraseña en <strong style="color:${emailColors.text};">ADP Gestión</strong>. Usa esta contraseña temporal para entrar:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:16px 18px;background:${emailColors.celesteLight};border:1px solid ${emailColors.celeste};border-radius:8px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${emailColors.navyMid};text-transform:uppercase;letter-spacing:0.5px;">Correo</p>
            <p style="margin:0 0 16px;font-size:14px;color:${emailColors.text};">${email}</p>
            <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${emailColors.navyMid};text-transform:uppercase;letter-spacing:0.5px;">Contraseña temporal</p>
            <p style="margin:0;font-size:22px;font-weight:bold;letter-spacing:2px;color:${emailColors.navy};font-family:'Courier New',Courier,monospace;">${tempPassword}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:13px;color:${emailColors.text};line-height:1.6;">Por seguridad, el sistema te pedirá cambiarla apenas ingreses. Si no fuiste tú quien la solicitó, contacta de inmediato a tu administrador.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${brandButton(loginUrl, "Ingresar a ADP Gestión")}</td></tr></table>
    `
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [email],
      subject: "Restablecimos tu contraseña — ADP Gestión",
      html: wrapBrandedEmail(bodyHtml),
    })
    if (error) console.error("[auth/forgot-password] Resend devolvió error:", error)
  } catch (err) {
    console.error("[auth/forgot-password] excepción enviando correo:", err)
  }
}
