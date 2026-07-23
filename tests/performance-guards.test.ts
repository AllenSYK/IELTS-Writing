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

test('global navigation prefetches primary routes only on user intent', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /prefetch=\{false\}/)
  assert.match(sidebar, /onPointerEnter=\{\(\) => prefetchItem\(item\)\}/)
  assert.match(sidebar, /onFocus=\{\(\) => prefetchItem\(item\)\}/)
  assert.doesNotMatch(sidebar, /\n\s+prefetch\n/)
})

test('past-paper filters cancel superseded and unmounted requests', async () => {
  const page = await readFile(new URL('../app/ielts/past-papers/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /activeRequestRef\.current\?\.controller\.abort\(\)/)
  assert.match(page, /request\.controller\.signal/)
  assert.match(page, /request\.timedOut/)
})

test('non-profile routes avoid the profile provider and error queries run concurrently', async () => {
  const [runtime, route] = await Promise.all([
    readFile(new URL('../components/layout/AppRuntime.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/study-plan/errors/route.ts', import.meta.url), 'utf8')
  ])

  assert.match(runtime, /needsUserProfile/)
  assert.match(runtime, /pathname === '\/dashboard'/)
  assert.match(runtime, /pathname === '\/analytics'/)
  assert.match(route, /Promise\.all\(\[/)
})
