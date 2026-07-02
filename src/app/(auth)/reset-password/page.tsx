"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, KeyRound, Loader2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

function ResetPasswordForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const code         = searchParams.get("code")

  const [exchanging,     setExchanging]     = useState(true)
  const [exchangeError,  setExchangeError]  = useState<string | null>(null)
  const [sessionReady,   setSessionReady]   = useState(false)

  const [password,  setPassword]  = useState("")
  const [confirm,   setConfirm]   = useState("")
  const [showPass,  setShowPass]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Intercambiar el code por una sesión de recuperación
  useEffect(() => {
    async function exchange() {
      if (!code) {
        setExchangeError("Enlace inválido. Solicita un nuevo correo de recuperación.")
        setExchanging(false)
        return
      }
      const supabase = createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        setExchangeError("Este enlace ha expirado o ya fue utilizado. Solicita uno nuevo.")
      } else {
        setSessionReady(true)
      }
      setExchanging(false)
    }
    exchange()
  }, [code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return }
    if (password.length < 8)  { setError("Mínimo 8 caracteres.");          return }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError("No se pudo actualizar la contraseña. Intenta de nuevo.")
      setSaving(false)
      return
    }

    // Limpiar flag de cambio obligatorio si estaba activo
    await fetch("/api/auth/clear-password-flag", { method: "POST" }).catch(() => {})

    await supabase.auth.signOut()
    router.push("/login?message=password_updated")
  }

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* Panel izquierdo */}
      <div className="hidden lg:flex flex-col lg:w-[55%] relative bg-[oklch(0.18_0.055_240)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.35_0.12_240)] via-[oklch(0.22_0.07_240)] to-[oklch(0.13_0.03_240)]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[oklch(0.10_0.02_240)] to-transparent" />
        <div className="absolute top-20 right-10 w-64 h-64 rounded-full bg-[oklch(0.67_0.13_215)]/10 blur-3xl" />
        <div className="absolute bottom-32 left-10 w-48 h-48 rounded-full bg-[oklch(0.35_0.12_240)]/20 blur-2xl" />

        <div className="relative z-10 flex flex-col h-full p-12 items-center justify-center text-center">
          <Image src="/adp_logo.png" alt="Altos del Puerto" width={160} height={56}
            className="brightness-0 invert object-contain mb-10" />
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Recupera tu<br />acceso
          </h2>
          <p className="text-base text-white/50 leading-relaxed max-w-xs">
            Establece una nueva contraseña para volver a ingresar al sistema de gestión.
          </p>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="flex flex-col justify-center flex-1 px-8 py-12 bg-background">
        <div className="w-full max-w-sm mx-auto">

          <div className="lg:hidden mb-8">
            <Image src="/adp_logo.png" alt="Altos del Puerto" width={120} height={42}
              className="object-contain dark:brightness-0 dark:invert" />
          </div>

          {/* Estado: verificando enlace */}
          {exchanging && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Verificando enlace...</span>
            </div>
          )}

          {/* Estado: enlace inválido o expirado */}
          {!exchanging && exchangeError && (
            <div>
              <div className="flex items-start gap-3 bg-destructive/10 text-destructive rounded-lg px-4 py-3.5">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Enlace inválido</p>
                  <p className="text-xs mt-0.5 text-destructive/80">{exchangeError}</p>
                </div>
              </div>
              <button
                onClick={() => router.push("/login")}
                className="mt-5 text-sm text-primary hover:underline underline-offset-4"
              >
                ← Volver al inicio de sesión
              </button>
            </div>
          )}

          {/* Estado: sesión lista → formulario nueva contraseña */}
          {!exchanging && sessionReady && (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Nueva contraseña</h1>
                <p className="text-sm text-muted-foreground mt-1.5">Elige una contraseña segura de al menos 8 caracteres.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      className="h-10 pr-10"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-sm font-medium">Confirmar contraseña</Label>
                  <Input
                    id="confirm"
                    type={showPass ? "text" : "password"}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={cn("h-10",
                      confirm && password !== confirm && "border-red-400 focus-visible:ring-red-400"
                    )}
                  />
                  {confirm && password !== confirm && (
                    <p className="text-[11px] text-red-500 mt-0.5">Las contraseñas no coinciden</p>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg px-3 py-2.5 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={saving || !password || !confirm || password !== confirm || password.length < 8}
                  className="w-full h-10 bg-[oklch(0.35_0.12_240)] hover:bg-[oklch(0.30_0.12_240)] text-white font-semibold gap-2 mt-2"
                >
                  {saving
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</>
                    : <><KeyRound className="h-4 w-4" />Establecer contraseña</>
                  }
                </Button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
