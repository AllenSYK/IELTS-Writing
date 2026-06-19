import type { NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    '/login/:path*',
    '/register/:path*',
    '/dashboard/:path*',
    '/activate/:path*',
    '/practice/:path*',
    '/history/:path*',
    '/write/:path*',
    '/result/:path*',
    '/analytics/:path*',
    '/level0/:path*',
    '/admin',
    '/admin/:path*'
  ]
}
