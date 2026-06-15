import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "super_admin")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })

  const { targetId } = await req.json()
  if (!targetId) return NextResponse.json({ error: "ID requerido" }, { status: 400 })
  if (targetId === user.id) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 })

  await supabaseAdmin.from("profiles").delete().eq("id", targetId)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
