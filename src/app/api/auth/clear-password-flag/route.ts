import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { createServerSupabaseClient } from "@/lib/supabase-server"

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log("[clear-password-flag] user:", user?.id ?? null, "authError:", authError?.message ?? null)
  if (!user) return NextResponse.json({ error: "No autenticado", detail: authError?.message }, { status: 401 })

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id)

  console.log("[clear-password-flag] update error:", error?.message ?? null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, userId: user.id })
}
