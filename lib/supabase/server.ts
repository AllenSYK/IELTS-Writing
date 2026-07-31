import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertSupabasePublicConfig } from './env'
export { createSupabaseServiceRoleClient } from './service'

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
