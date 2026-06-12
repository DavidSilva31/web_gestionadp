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

  const { data: { user } } = await supabase.auth.getUser()

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

  // Sin sesión → login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Obtener rol del perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'operador') as UserRole

  // Verificar acceso por rol
  if (!canAccess(role, pathname)) {
    return NextResponse.redirect(new URL(DEFAULT_ROUTE[role], request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|adp_logo.png|.*\\.svg|.*\\.png|.*\\.ico).*)',
  ],
}
