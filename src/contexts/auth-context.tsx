"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) console.error('[auth] error obteniendo perfil:', error)
    setProfile(data ?? null)
    document.documentElement.setAttribute('data-accent', data?.accent_color || 'celeste')
  }, [])

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) fetchProfile(user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) fetchProfile(u.id)
      else {
        setProfile(null)
        setLoading(false)
        if (event === "SIGNED_OUT") {
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
  }, [fetchProfile, router])

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
