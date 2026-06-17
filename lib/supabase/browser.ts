'use client'

import { createBrowserClient } from '@supabase/ssr'
import { assertSupabasePublicConfig } from './env'

export function createSupabaseBrowserClient() {
  const { url, key } = assertSupabasePublicConfig()
  return createBrowserClient(url, key)
}
