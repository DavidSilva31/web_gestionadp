import { randomInt } from "crypto"

// Evita caracteres ambiguos en pantalla/impresos (0/O, 1/l/I) — esta
// contraseña se lee a mano desde un correo, no se copia y pega.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

export function generateTempPassword(length = 12): string {
  let pass = ""
  for (let i = 0; i < length; i++) pass += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)]
  return pass
}
