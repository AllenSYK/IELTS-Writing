import type { NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/activate/:path*',
    '/practice/:path*',
    '/history/:path*',
    '/write/:path*',
    '/result/:path*',
    '/analytics/:path*',
    '/admin/:path*'
  ]
}
