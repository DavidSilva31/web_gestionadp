import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { exigirSuperAdmin, listarArchivos, listarTablas } from "@/lib/backup-servidor"

export const dynamic = "force-dynamic"

export async function GET() {
  const admin = await exigirSuperAdmin()
  if (admin instanceof NextResponse) return admin
  try {
    const [tablas, archivos, usuarios] = await Promise.all([
      listarTablas(),
      listarArchivos(),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ])
    if (usuarios.error) throw usuarios.error
    return NextResponse.json({
      tablas,
      archivos,
      // Datos de Auth (sin contraseñas: Supabase no las expone).
      usuarios: usuarios.data.users.map(u => ({
        id: u.id, email: u.email, phone: u.phone, created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at,
        app_metadata: u.app_metadata, user_metadata: u.user_metadata,
        banned_until: (u as { banned_until?: string }).banned_until ?? null,
      })),
    })
  } catch (err) {
    console.error("[backup/manifiesto]", err)
    return NextResponse.json({ error: "No se pudo preparar la copia de seguridad." }, { status: 500 })
  }
}
