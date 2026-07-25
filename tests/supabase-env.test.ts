import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupabaseUrl } from '@/lib/supabase/env'

function withSupabaseUrl(value: string, assertion: () => void) {
  const previousValue = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = value

  try {
    assertion()
  } finally {
    if (previousValue === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousValue
    }
  }
}

test('keeps a valid Supabase project URL unchanged', () => {
  withSupabaseUrl('https://project.supabase.co', () => {
    assert.equal(getSupabaseUrl(), 'https://project.supabase.co')
  })
})

test('normalizes a REST endpoint to the Supabase project URL', () => {
  withSupabaseUrl('https://project.supabase.co/rest/v1/', () => {
    assert.equal(getSupabaseUrl(), 'https://project.supabase.co')
  })
})
