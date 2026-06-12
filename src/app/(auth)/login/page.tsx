"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, LogIn, Loader2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UserRole } from "@/types/auth"
import { DEFAULT_ROUTE } from "@/types/auth"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get("redirect")

  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError("Correo o contraseña incorrectos.")
        return
      }

      // Obtener rol para redirigir al destino correcto
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()

        const role = (profile?.role ?? "operador") as UserRole
        router.push(redirect ?? DEFAULT_ROUTE[role])
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden">
      {/* Panel izquierdo — fondo ADP */}
      <div className="hidden lg:flex flex-col lg:w-[55%] relative bg-[oklch(0.18_0.055_240)]">
        {/* Gradiente decorativo */}
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.35_0.12_240)] via-[oklch(0.22_0.07_240)] to-[oklch(0.13_0.03_240)]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[oklch(0.10_0.02_240)] to-transparent" />

        {/* Círculos decorativos */}
        <div className="absolute top-20 right-10 w-64 h-64 rounded-full bg-[oklch(0.67_0.13_215)]/10 blur-3xl" />
        <div className="absolute bottom-32 left-10 w-48 h-48 rounded-full bg-[oklch(0.35_0.12_240)]/20 blur-2xl" />

        <div className="relative z-10 flex flex-col h-full p-12 items-center justify-center text-center">
          {/* Logo */}
          <Image
            src="/adp_logo.png"
            alt="Altos del Puerto"
            width={160}
            height={56}
            className="brightness-0 invert object-contain mb-10"
          />

          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Sistema de gestión<br />de almacenamiento
          </h2>
          <p className="text-base text-white/50 leading-relaxed max-w-xs mb-10">
            Control operacional de cargas, contenedores IMO, isotanques y residuos peligrosos.
          </p>

          <div className="space-y-3">
            {[
              { label: "Depósito de contenedores", sub: "IMO, isotanques y carga general" },
              { label: "Reportes de despacho",     sub: "Flujo operador → despachador"    },
              { label: "Trazabilidad completa",    sub: "Historial por cliente y patente"  },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-[oklch(0.67_0.13_215)] flex-shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-semibold text-white/80">{item.label}</p>
                  <p className="text-[11px] text-white/40">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex flex-col justify-center flex-1 px-8 py-12 bg-background">
        <div className="w-full max-w-sm mx-auto">
          {/* Logo mobile */}
          <div className="lg:hidden mb-8">
            <Image
              src="/adp_logo.png"
              alt="Altos del Puerto"
              width={120}
              height={42}
              className="object-contain dark:brightness-0 dark:invert"
            />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Accede con tu cuenta de ADP Gestión</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@adp.cl"
                required
                autoComplete="email"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white font-semibold gap-2 mt-2"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Ingresando...</>
              ) : (
                <><LogIn className="h-4 w-4" />Ingresar</>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground/60 text-center mt-8">
            ¿Problemas para acceder? Contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
