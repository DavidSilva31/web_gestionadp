"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
import { invalidarCache } from "@/lib/cache-consultas"
import type { Profile, UserRole } from "@/types/auth"
import { DEFAULT_ROUTE } from "@/types/auth"

interface AuthContextValue {
  user:    User | null
  profile: Profile | null
  role:    UserRole | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, role: null, loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
})

// initialProfile: el layout del servidor ya leyó el perfil para validar la cuenta; se reutiliza
// para no repetir en el navegador getUser() + la consulta del perfil en cada carga de la app.
export function AuthProvider({ children, initialProfile = null }: { children: React.ReactNode; initialProfile?: Profile | null }) {
  const router  = useRouter()
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(!initialProfile)

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = createClient()
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('[auth] error obteniendo perfil:', error)
      // El layout del dashboard ya validó server-side que el perfil existe y
      // está activo hace instantes — esto casi siempre es un blip transitorio
      // del lado cliente, no una cuenta realmente sin perfil. Un reintento
      // evita quedar con profile=null (y todo lo que depende del rol roto)
      // por una falla momentánea; si vuelve a fallar, la próxima navegación
      // pasa de nuevo por el chequeo server-side del layout.
      await new Promise(r => setTimeout(r, 800));
      ({ data, error } = await supabase.from('profiles').select('*').eq('id', userId).single())
      if (error) { console.error('[auth] error obteniendo perfil (reintento):', error); return }
    }
    setProfile(data ?? null)
    document.documentElement.setAttribute('data-accent', data?.accent_color || 'celeste')
  }, [])

  useEffect(() => {
    const supabase = createClient()

    if (initialProfile) document.documentElement.setAttribute('data-accent', initialProfile.accent_color || 'celeste')

    // INITIAL_SESSION entrega la sesión desde las cookies, sin viaje a la red (antes: getUser()).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        // Con el perfil ya cargado por el servidor no hace falta pedirlo de nuevo al iniciar.
        if (event === "INITIAL_SESSION" && initialProfile?.id === u.id) setLoading(false)
        else fetchProfile(u.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
        if (event === "SIGNED_OUT") {
          invalidarCache()
          document.documentElement.setAttribute('data-accent', 'celeste')
          router.replace("/login")
        }
      }
    })

    // Detectar restauración desde bfcache (botón Atrás tras cerrar sesión).
    // Usa window.location en vez de router porque Next.js puede estar congelado.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) window.location.replace("/login")
        })
      }
    }
    window.addEventListener("pageshow", handlePageShow)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener("pageshow", handlePageShow)
    }
  }, [fetchProfile, router, initialProfile])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // onAuthStateChange "SIGNED_OUT" handles state reset and navigation
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  return (
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
