import { createClient } from '@supabase/supabase-js'
import { assertSupabaseServiceConfig } from './env'

export function createSupabaseServiceRoleClient() {
  const { url, key } = assertSupabaseServiceConfig()
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}
