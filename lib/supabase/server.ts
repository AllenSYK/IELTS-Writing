import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { assertSupabasePublicConfig } from './env'
import { createFetchWithTimeout } from './fetch'
export { createSupabaseServiceRoleClient } from './service'

export function createSupabasePublicServerClient(requestTimeoutMs = 15000) {
  const { url, key } = assertSupabasePublicConfig()

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      fetch: createFetchWithTimeout(requestTimeoutMs)
    }
  })
}

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
