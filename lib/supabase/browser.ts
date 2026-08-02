'use client'

import { createBrowserClient } from '@supabase/ssr'
import { assertSupabasePublicConfig } from './env'
import { createFetchWithTimeout } from './fetch'

type SupabaseBrowserClientOptions = {
  isolatedSession?: boolean
  requestTimeoutMs?: number
}

function createMemoryCookieMethods() {
  const values = new Map<string, string>()

  return {
    getAll() {
      return Array.from(values, ([name, value]) => ({ name, value }))
    },
    setAll(cookies: Array<{ name: string; value: string }>) {
      for (const cookie of cookies) {
        if (cookie.value) {
          values.set(cookie.name, cookie.value)
        } else {
          values.delete(cookie.name)
        }
      }
    }
  }
}

export function createSupabaseBrowserClient(options: SupabaseBrowserClientOptions = {}) {
  const { url, key } = assertSupabasePublicConfig()

  if (!options.isolatedSession && !options.requestTimeoutMs) {
    return createBrowserClient(url, key)
  }

  return createBrowserClient(url, key, {
    isSingleton: false,
    ...(options.isolatedSession ? { cookies: createMemoryCookieMethods() } : {}),
    auth: options.isolatedSession
      ? {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: true,
          storageKey: `password-recovery-${crypto.randomUUID()}`
        }
      : undefined,
    global: options.requestTimeoutMs
      ? { fetch: createFetchWithTimeout(options.requestTimeoutMs) }
      : undefined
  })
}
