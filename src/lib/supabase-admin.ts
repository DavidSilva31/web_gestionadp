import { createClient } from "@supabase/supabase-js"

// Guard defensivo: este cliente usa la service-role key (bypassa RLS) y
// nunca debe importarse desde código que corra en el navegador. Falla ruidoso
// en vez de silencioso si algún día se importa por error desde un componente
// cliente (Next.js ya no inyecta SUPABASE_SERVICE_ROLE_KEY en el bundle del
// navegador al no tener prefijo NEXT_PUBLIC_, pero este check lo hace explícito).
if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin (service-role) nunca debe importarse en código de cliente.")
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
