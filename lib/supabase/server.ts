import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { assertSupabasePublicConfig, assertSupabaseServiceConfig } from './env'

export async function createSupabaseServerClient() {
  const { url, key } = assertSupabasePublicConfig()
  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot write cookies; middleware refreshes sessions.
        }
      }
    }
  })
}

export function createSupabaseServiceRoleClient() {
  const { url, key } = assertSupabaseServiceConfig()
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}
