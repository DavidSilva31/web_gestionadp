import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { type UserRole, canAccess, DEFAULT_ROUTE } from '@/types/auth'

const IS_DEV_PLACEHOLDER =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes('tu-proyecto')

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // En desarrollo sin Supabase configurado: acceso libre a todo
  if (IS_DEV_PLACEHOLDER) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Las rutas /api nunca pasan por auth ni redirecciones
  if (pathname.startsWith('/api/')) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) console.error("[proxy] error verificando sesión:", userError.message)

  // Ruta raíz → redirigir según estado de sesión
  if (pathname === '/') {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Rutas de auth: si ya tiene sesión, redirigir al dashboard
  if (pathname.startsWith('/login')) {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url))
    return supabaseResponse
  }

  // Restablecimiento de contraseña: pública (llega con ?code= de Supabase)
  if (pathname === '/reset-password') {
    return supabaseResponse
  }

  // Sin sesión → login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Obtener rol, permisos y flag de cambio de contraseña del perfil
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, permisos, must_change_password')
    .eq('id', user.id)
    .single()

  // Si no se pudo leer el perfil, no asumir un rol por defecto (podría escalar
  // privilegios de un operador_carga a operador) — se falla cerrado hacia login.
  if (profileError) {
    console.error('[proxy] error obteniendo perfil:', profileError.message)
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role               = (profile?.role ?? 'operador') as UserRole
  const permisos           = (profile?.permisos ?? null) as string[] | null
  const mustChangePassword = profile?.must_change_password === true

  // Si debe cambiar contraseña, solo puede acceder a /configuracion
  if (mustChangePassword && !pathname.startsWith('/configuracion')) {
    return NextResponse.redirect(new URL('/configuracion', request.url))
  }

  // Verificar acceso por rol (o permisos personalizados si existen)
  if (!canAccess(role, pathname, permisos)) {
    return NextResponse.redirect(new URL(DEFAULT_ROUTE[role], request.url))
  }

  // Impedir que el browser guarde páginas autenticadas en bfcache.
  // Sin esto, el botón Atrás restaura el dashboard aunque la sesión haya cerrado.
  supabaseResponse.headers.set("Cache-Control", "no-store")

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|adp_logo.png|.*\\.svg|.*\\.png|.*\\.ico).*)',
  ],
}
