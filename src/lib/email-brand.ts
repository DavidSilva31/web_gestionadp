import { readFileSync } from "fs"
import { join } from "path"

// Los clientes de correo no soportan CSS variables/oklch — mismos colores de
// marca que src/app/globals.css (--color-adp-blue/celeste), pero en hex plano.
export const emailColors = {
  navy:         "#0A4A7F",
  navyMid:      "#1A5276",
  celeste:      "#29ABE2",
  celesteLight: "#E8F7FD",
  text:         "#1F2937",
  muted:        "#6B7280",
  bg:           "#F4F6F8",
  border:       "#E2E8F0",
}

let logoCache: string | null = null

// Base64 inline en vez de una URL pública: la mayoría de los clientes de
// correo bloquean imágenes remotas por defecto, y en dev NEXT_PUBLIC_SITE_URL
// apunta a localhost (inalcanzable para quien recibe el correo).
function getLogoBase64(): string {
  if (!logoCache) logoCache = readFileSync(join(process.cwd(), "public", "adp_logo.png")).toString("base64")
  return logoCache
}

// Envuelve el contenido de un correo con el mismo header (logo + borde
// celeste) y footer que usa el resto de la marca ADP.
export function wrapBrandedEmail(bodyHtml: string): string {
  const logo = getLogoBase64()
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${emailColors.bg};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${emailColors.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${emailColors.border};">
            <tr>
              <td style="padding:28px 32px 20px;text-align:center;border-bottom:3px solid ${emailColors.celeste};">
                <img src="data:image/png;base64,${logo}" alt="Altos del Puerto" width="150" style="display:block;margin:0 auto;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:${emailColors.bg};text-align:center;border-top:1px solid ${emailColors.border};">
                <p style="margin:0;font-size:11px;color:${emailColors.muted};">Altos del Puerto — Logística Integral</p>
                <p style="margin:4px 0 0;font-size:11px;color:${emailColors.muted};">Este es un correo automático, no respondas a esta dirección.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function brandButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${emailColors.navy};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;">${label}</a>`
}
