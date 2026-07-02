import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getUserAccess, hasModuleAccess, moduleForPath } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } })

  function withCookies(target: NextResponse) {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
    return target
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (path === '/login') return response
    return withCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  if (path === '/login') {
    return withCookies(NextResponse.redirect(new URL('/', request.url)))
  }

  const access = await getUserAccess(supabaseAdmin, user.id)
  if (!access) {
    return withCookies(NextResponse.redirect(new URL('/login', request.url)))
  }

  const isAccountsRoute =
    path === '/accounts' || path === '/api/accounts' || path.startsWith('/api/accounts/')
  if (isAccountsRoute && access.role !== 'admin') {
    if (path.startsWith('/api/')) {
      return withCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    }
    return withCookies(NextResponse.redirect(new URL('/', request.url)))
  }

  const moduleKey = moduleForPath(path)
  if (moduleKey && !hasModuleAccess(access, moduleKey)) {
    return withCookies(NextResponse.redirect(new URL('/', request.url)))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/locked-retailers).*)'],
}
