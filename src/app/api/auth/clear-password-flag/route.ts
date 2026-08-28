import { NextResponse } from "next/server"
import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { wrapBrandedEmail, emailColors } from "@/lib/email-brand"

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      if (authError) console.error("[auth/clear-password-flag] error de autenticación:", authError)
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id)
      .select("nombre, email")
      .single()

    if (error) {
      console.error("[auth/clear-password-flag] error actualizando perfil:", error)
      return NextResponse.json({ error: "No se pudo actualizar el estado de la contraseña." }, { status: 500 })
    }

    // Aviso de seguridad de que la contraseña cambió — cubre tanto el cambio
    // forzado del primer login como el flujo de "olvidé mi contraseña"
    // (reset-password/page.tsx llama a este mismo endpoint en ambos casos).
    // Best-effort: si el correo falla, no se revierte el cambio ya aplicado.
    if (profile?.email) {
      await sendPasswordChangedEmail(profile.email, profile.nombre ?? "").catch(err =>
        console.error("[auth/clear-password-flag] error enviando aviso de cambio de contraseña:", err)
      )
    }

    return NextResponse.json({ success: true, userId: user.id })
  } catch (err) {
    console.error("[auth/clear-password-flag] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}

async function sendPasswordChangedEmail(email: string, nombre: string) {
  if (!process.env.RESEND_API_KEY) {
    console.error("[auth/clear-password-flag] RESEND_API_KEY no configurado, no se pudo avisar el cambio de contraseña")
    return
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromAddress = process.env.RESEND_FROM_EMAIL || "Altos del Puerto <onboarding@resend.dev>"
  const fecha = new Date().toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" })

  const bodyHtml = `
    <h1 style="margin:0 0 6px;font-size:20px;color:${emailColors.text};">Contraseña actualizada</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${emailColors.muted};line-height:1.6;">Hola ${nombre || ""}, te confirmamos que la contraseña de tu cuenta en <strong style="color:${emailColors.text};">ADP Gestión</strong> se actualizó correctamente.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:14px 18px;background:${emailColors.celesteLight};border:1px solid ${emailColors.celeste};border-radius:8px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${emailColors.navyMid};text-transform:uppercase;letter-spacing:0.5px;">Cuenta</p>
          <p style="margin:0 0 12px;font-size:14px;color:${emailColors.text};">${email}</p>
          <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:${emailColors.navyMid};text-transform:uppercase;letter-spacing:0.5px;">Fecha</p>
          <p style="margin:0;font-size:14px;color:${emailColors.text};">${fecha}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:${emailColors.text};line-height:1.6;">Si no fuiste tú quien hizo este cambio, contacta de inmediato a tu administrador del sistema.</p>
  `
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [email],
    subject: "Tu contraseña fue actualizada — ADP Gestión",
    html: wrapBrandedEmail(bodyHtml),
  })
  if (error) console.error("[auth/clear-password-flag] Resend devolvió error:", error)
}
