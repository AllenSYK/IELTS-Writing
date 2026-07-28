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

test('global navigation uses prefetch={false} with no hover prefetching', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /prefetch=\{false\}/)
  assert.doesNotMatch(sidebar, /onMouseEnter/)
  assert.doesNotMatch(sidebar, /router\.prefetch/)
  assert.doesNotMatch(sidebar, /pageDataPrefetchers/)
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

test('InteractionOptimizer files are deleted', async () => {
  await assert.rejects(
    () => readFile(new URL('../components/providers/InteractionOptimizer.tsx', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
  await assert.rejects(
    () => readFile(new URL('../lib/interaction-optimizer.ts', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
})

test('UserPerformanceProvider does not use React key to force remount', async () => {
  const provider = await readFile(new URL('../components/performance/UserPerformanceProvider.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(provider, /key=\{userId/)
  assert.doesNotMatch(provider, /key=\{'anonymous/)
  assert.match(provider, /useRef\(new Map\(\)\)/)
})

test('UserSessionProvider uses session.user from onAuthStateChange', async () => {
  const provider = await readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /onAuthStateChange\(\(event, session\)/)
  assert.match(provider, /applyUser\(session\?\.user/)
  assert.doesNotMatch(provider, /refreshUser\(\)/)
})

test('study-plan SWR key includes userId', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /\['study-plan',\s*userId\]/)
})

test('NavigationProgress uses event-driven approach', async () => {
  const navProgress = await readFile(new URL('../components/layout/NavigationProgress.tsx', import.meta.url), 'utf8')

  assert.match(navProgress, /navigationEvents/)
  assert.doesNotMatch(navProgress, /document\.readyState/)
  assert.doesNotMatch(navProgress, /setInterval/)
})

test('navigation-events module provides clean API', async () => {
  const mod = await readFile(new URL('../lib/navigation-events.ts', import.meta.url), 'utf8')

  assert.match(mod, /start\(\)/)
  assert.match(mod, /complete\(\)/)
  assert.match(mod, /subscribe\(listener/)
  assert.doesNotMatch(mod, /setInterval/)
})
