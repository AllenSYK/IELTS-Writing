import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('web fonts use compressed sources without changing the declared families or weights', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

  assert.match(css, /font-family:\s*"Inter"/)
  assert.match(css, /font-family:\s*"Material Symbols Outlined"/)
  assert.match(css, /inter-400\.woff2/)
  assert.match(css, /material-symbols-outlined-400\.woff2/)
  assert.doesNotMatch(css, /url\("\/fonts\/[^"]+\.ttf"\)/)
})

test('global navigation uses prefetch={false} and no hover prefetching', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /prefetch=\{false\}/)
  assert.doesNotMatch(sidebar, /onMouseEnter/)
  assert.doesNotMatch(sidebar, /router\.prefetch/)
  assert.doesNotMatch(sidebar, /pageDataPrefetchers/)
  assert.doesNotMatch(sidebar, /\n\s+prefetch\n/)
})

test('past-paper filters cancel superseded and unmounted requests', async () => {
  const page = await readFile(new URL('../app/ielts/past-papers/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /activeRequestRef\.current\?\.controller\.abort\(\)/)
  assert.match(page, /request\.controller\.signal/)
  assert.match(page, /request\.timedOut/)
})

test('user profile provider wraps all authenticated routes uniformly', async () => {
  const runtime = await readFile(new URL('../components/layout/AppRuntime.tsx', import.meta.url), 'utf8')

  assert.match(runtime, /UserProfileProvider/)
  assert.match(runtime, /UserPerformanceProvider/)
  assert.doesNotMatch(runtime, /needsUserProfile/)
})
