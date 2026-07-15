"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, LogIn, Loader2, AlertCircle, CheckCircle2, Mail, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UserRole } from "@/types/auth"
import { DEFAULT_ROUTE } from "@/types/auth"

type Mode = "login" | "forgot"

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirect     = searchParams.get("redirect")
  const errorParam   = searchParams.get("error")
  const messageParam = searchParams.get("message")

  const [mode, setMode] = useState<Mode>("login")

  /* ── Login ── */
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  /* ── Recuperar contraseña ── */
  const [forgotEmail,   setForgotEmail]   = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotResult,  setForgotResult]  = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !session) {
      setError("Correo o contraseña incorrectos.")
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, activo")
      .eq("id", session.user.id)
      .single()

    if (!profile?.activo) {
      await supabase.auth.signOut()
      setError("Tu cuenta está desactivada. Contacta al administrador.")
      setLoading(false)
      return
    }

    const role = (profile?.role ?? "operador") as UserRole
    const safePath = (() => {
      if (!redirect) return null
      try {
        const resolved = new URL(redirect, "https://internal.local")
        return resolved.hostname === "internal.local" ? redirect : null
      } catch { return null }
    })()

    // Mantener spinner durante la navegación — el componente se desmontará al llegar
    router.push(safePath ?? DEFAULT_ROUTE[role])
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setForgotResult(null)
    setForgotLoading(true)

    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: forgotEmail }),
      })
      const json = await res.json()

      if (!res.ok) {
        if (json.error === "not_registered") {
          setForgotResult({ ok: false, text: "No estás registrado en el sistema. Contacta al administrador." })
        } else {
          setForgotResult({ ok: false, text: json.error ?? "Error al enviar el correo." })
        }
      } else {
        setForgotResult({ ok: true, text: "Revisa tu correo. Te hemos enviado un enlace para restablecer tu contraseña." })
      }
    } finally {
      setForgotLoading(false)
    }
  }

  function switchToForgot() {
    setForgotEmail(email) // pre-rellenar con el email del login si ya lo escribió
    setForgotResult(null)
    setMode("forgot")
  }

  function switchToLogin() {
    setForgotResult(null)
    setError(null)
    setMode("login")
  }

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* Panel izquierdo — fondo ADP */}
      <div className="hidden lg:flex flex-col lg:w-[55%] relative bg-[oklch(0.18_0.055_240)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.35_0.12_240)] via-[oklch(0.22_0.07_240)] to-[oklch(0.13_0.03_240)]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[oklch(0.10_0.02_240)] to-transparent" />
        <div className="absolute top-20 right-10 w-64 h-64 rounded-full bg-[oklch(0.67_0.13_215)]/10 blur-3xl" />
        <div className="absolute bottom-32 left-10 w-48 h-48 rounded-full bg-[oklch(0.35_0.12_240)]/20 blur-2xl" />

        <div className="relative z-10 flex flex-col h-full p-12 items-center justify-center text-center">
          <Image src="/adp_logo.png" alt="Altos del Puerto" width={160} height={56}
            className="brightness-0 invert object-contain mb-10" style={{ height: "auto" }} />
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            {mode === "forgot" ? "Recupera tu\nacceso" : "Sistema de gestión\nde almacenamiento"}
          </h2>
          <p className="text-base text-white/50 leading-relaxed max-w-xs mb-10">
            {mode === "forgot"
              ? "Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña."
              : "Control operacional de cargas, contenedores IMO, isotanques y residuos peligrosos."
            }
          </p>

          {mode === "login" && (
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
          )}
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex flex-col justify-center flex-1 px-8 py-12 bg-background">
        <div className="w-full max-w-sm mx-auto">

          {/* Logo mobile */}
          <div className="lg:hidden mb-8">
            <Image src="/adp_logo.png" alt="Altos del Puerto" width={120} height={42}
              className="object-contain dark:brightness-0 dark:invert" style={{ height: "auto" }} />
          </div>

          {/* ── Modo LOGIN ── */}
          {mode === "login" && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Iniciar sesión</h1>
                <p className="text-sm text-muted-foreground mt-1.5">Accede con tu cuenta de ADP Gestión</p>
              </div>

              {/* Banner cuenta desactivada (desde middleware) */}
              {errorParam === "cuenta_desactivada" && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg px-3 py-2.5 text-sm mb-4">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Tu cuenta está desactivada. Contacta al administrador del sistema.
                </div>
              )}

              {/* Banner contraseña actualizada (desde reset-password) */}
              {messageParam === "password_updated" && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-sm mb-4 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Contraseña actualizada correctamente. Ya puedes iniciar sesión.
                </div>
              )}

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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Contraseña</Label>
                    <button
                      type="button"
                      onClick={switchToForgot}
                      className="text-xs text-primary hover:underline underline-offset-4 transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
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
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Ingresando...</>
                    : <><LogIn className="h-4 w-4" />Ingresar</>
                  }
                </Button>
              </form>

              <p className="text-xs text-muted-foreground/60 text-center mt-8">
                ¿Problemas para acceder? Contacta al administrador del sistema.
              </p>
            </>
          )}

          {/* ── Modo RECUPERAR CONTRASEÑA ── */}
          {mode === "forgot" && (
            <>
              <button
                onClick={switchToLogin}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio de sesión
              </button>

              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Recuperar acceso</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                </p>
              </div>

              {/* Resultado: éxito o error */}
              {forgotResult ? (
                <div>
                  {forgotResult.ok ? (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3.5 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">Correo enviado</p>
                        <p className="text-xs mt-0.5 text-emerald-700 dark:text-emerald-400">{forgotResult.text}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 bg-destructive/10 text-destructive rounded-lg px-4 py-3.5">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">No se pudo enviar</p>
                        <p className="text-xs mt-0.5 text-destructive/80">{forgotResult.text}</p>
                      </div>
                    </div>
                  )}

                  {!forgotResult.ok && (
                    <button
                      onClick={() => setForgotResult(null)}
                      className="mt-4 text-xs text-primary hover:underline underline-offset-4"
                    >
                      Intentar con otro correo
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-sm font-medium">Correo electrónico</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="usuario@adp.cl"
                        required
                        autoComplete="email"
                        className="h-10 pl-9"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail}
                    className="w-full h-10 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white font-semibold gap-2"
                  >
                    {forgotLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</>
                      : <><Mail className="h-4 w-4" />Enviar enlace</>
                    }
                  </Button>
                </form>
              )}
            </>
          )}

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
