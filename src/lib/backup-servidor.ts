import { NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export { BUCKET_FIRMADOS, listarTablas, listarArchivos, listarUsuariosAuth, type TablaRespaldo } from "@/lib/backup-core"

export type SuperAdmin = { id: string; nombre: string }

// Solo super_admin activo puede usar las rutas de respaldo. Devuelve el usuario o la respuesta de error.
export async function exigirSuperAdmin(): Promise<SuperAdmin | NextResponse> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const { data: perfil } = await supabase
    .from("profiles").select("role, nombre, activo").eq("id", user.id).single()
  if (!perfil?.activo) return NextResponse.json({ error: "Cuenta desactivada" }, { status: 403 })
  if (perfil.role !== "super_admin") return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  return { id: user.id, nombre: perfil.nombre ?? user.email ?? "super_admin" }
}
