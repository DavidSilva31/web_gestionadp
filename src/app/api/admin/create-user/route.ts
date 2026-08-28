import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { logAuditServer } from "@/lib/audit"
import { resolveSiteUrl } from "@/lib/site-url"
import { wrapBrandedEmail, brandButton, emailColors } from "@/lib/email-brand"
import { generateTempPassword } from "@/lib/temp-password"

const VALID_ROLES = ["super_admin", "operador", "operador_carga"] as const

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: adminProfile, error: adminError } = await supabase
      .from("profiles").select("role, nombre, activo").eq("id", user.id).single()
    if (adminError) {
      console.error("[admin/create-user] error obteniendo perfil admin:", adminError)
      return NextResponse.json({ error: "No se pudo verificar el perfil." }, { status: 500 })
    }
    if (!adminProfile?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })
    if (adminProfile.role !== "super_admin")
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

    let body: { nombre?: string; email?: string; role?: string; permisos?: string[] | null }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 })
    }
    const { nombre, email, role, permisos } = body
    if (!nombre || !email || !role)
      return NextResponse.json({ error: "Todos los campos son obligatorios" }, { status: 400 })

    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number]))
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 })

    // Contraseña temporal en vez de link mágico: el usuario entra directo a
    // /login con esta clave, y must_change_password (abajo) hace que el
    // middleware lo encierre en /configuracion hasta que la cambie — evita
    // depender de que el link de invitación de Supabase llegue/funcione.
    const tempPassword = generateTempPassword()
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password:      tempPassword,
      email_confirm: true,
    })
    if (authError) {
      console.error("[admin/create-user] error de Supabase Auth al crear usuario:", {
        code: authError.code, status: authError.status, message: authError.message,
      })
      let msg = "No se pudo crear el usuario. Intenta de nuevo."
      if (/already.*registered/i.test(authError.message)) {
        msg = "Ya existe un usuario con ese correo electrónico."
      } else if (authError.code === "email_address_invalid" || authError.status === 400) {
        msg = "El correo electrónico no es válido."
      } else if (authError.code === "over_email_send_rate_limit" || authError.status === 429) {
        msg = "Se alcanzó el límite de envío de correos. Espera unos minutos e intenta de nuevo."
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id:                   newUser.user.id,
      email,
      nombre,
      role,
      activo:               true,
      permisos:             permisos ?? null,
      must_change_password: true,
    })
    if (profileError) {
      console.error("[admin/create-user] error creando perfil:", profileError)
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: "Error al crear el perfil del usuario." }, { status: 500 })
    }

    await logAuditServer({
      tabla:          "profiles",
      registro_id:    newUser.user.id,
      accion:         "admin.crear_usuario",
      descripcion:    `Usuario ${email} creado con rol ${role} por ${adminProfile?.nombre ?? user.email} (contraseña temporal enviada por correo)`,
      usuario_id:     user.id,
      usuario_nombre: adminProfile?.nombre ?? user.email,
    }).catch(err => console.error("[admin/create-user] error registrando auditoría:", err))

    // El usuario ya quedó creado y puede entrar con la clave temporal aunque
    // el correo falle — por eso esto no revierte nada, solo avisa para que
    // el admin la comparta a mano.
    if (!process.env.RESEND_API_KEY) {
      console.error("[admin/create-user] RESEND_API_KEY no configurado, no se pudo enviar la clave temporal")
      return NextResponse.json({ success: true, emailSent: false, tempPassword })
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const fromAddress = process.env.RESEND_FROM_EMAIL || "Altos del Puerto <onboarding@resend.dev>"
      const loginUrl = `${resolveSiteUrl(req)}/login`
      const bodyHtml = `
        <h1 style="margin:0 0 6px;font-size:20px;color:${emailColors.text};">¡Bienvenido(a), ${nombre}!</h1>
        <p style="margin:0 0 24px;font-size:14px;color:${emailColors.muted};line-height:1.6;">Se creó tu cuenta en <strong style="color:${emailColors.text};">ADP Gestión</strong>. Estos son tus datos de acceso:</p>
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
        <p style="margin:0 0 24px;font-size:13px;color:${emailColors.text};line-height:1.6;">Ingresa con estos datos — por seguridad, el sistema te pedirá cambiar la contraseña antes de continuar.</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${brandButton(loginUrl, "Ingresar a ADP Gestión")}</td></tr></table>
      `
      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: [email],
        subject: "Tu cuenta en ADP Gestión",
        html: wrapBrandedEmail(bodyHtml),
      })
      if (sendError) {
        console.error("[admin/create-user] error enviando correo con clave temporal:", sendError)
        return NextResponse.json({ success: true, emailSent: false, tempPassword })
      }
    } catch (err) {
      console.error("[admin/create-user] excepción enviando correo con clave temporal:", err)
      return NextResponse.json({ success: true, emailSent: false, tempPassword })
    }

    return NextResponse.json({ success: true, emailSent: true })
  } catch (err) {
    console.error("[admin/create-user] error inesperado:", err)
    return NextResponse.json({ error: "Error inesperado del servidor." }, { status: 500 })
  }
}
