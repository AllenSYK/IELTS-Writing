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

test('UserProfileProvider wraps all authenticated routes in AppRuntime', async () => {
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

test('request-deduper is deleted', async () => {
  await assert.rejects(
    () => readFile(new URL('../lib/performance/request-deduper.ts', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
})

test('UserPerformanceProvider does not use React key to force remount', async () => {
  const provider = await readFile(new URL('../components/performance/UserPerformanceProvider.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(provider, /key=\{userId/)
  assert.doesNotMatch(provider, /key=\{'anonymous/)
  assert.match(provider, /useRef\(new Map\(\)\)/)
})

test('UserSessionProvider splits auth context from session context', async () => {
  const provider = await readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /AuthContext/)
  assert.match(provider, /UserSessionContext/)
  assert.match(provider, /export function useAuth/)
  assert.match(provider, /export function useUserSession/)
  assert.match(provider, /onAuthStateChange\(\(event, session\)/)
  assert.match(provider, /applyUser\(session\?\.user/)
})

test('UserSessionProvider tracks status to prevent permanent loading', async () => {
  const provider = await readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /currentStatusRef/)
  assert.match(provider, /const nextStatus/)
  assert.match(provider, /currentStatusRef\.current === nextStatus/)
})

test('AppShell does not import auth hooks directly', async () => {
  const shell = await readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(shell, /useAuth/)
  assert.doesNotMatch(shell, /useUserSession/)
})

test('UserPerformanceProvider uses lightweight useAuth', async () => {
  const provider = await readFile(new URL('../components/performance/UserPerformanceProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /import.*useAuth.*from/)
  assert.doesNotMatch(provider, /useUserSession/)
})

test('study-plan SWR key includes userId', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /\['study-plan',\s*userId\]/)
})

test('study-plan boot resolution does not depend on jobRestored', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  const bootEffect = page.match(/Boot resolution[\s\S]*?\}, \[data, error, isLoading, authStatus\]/)
  assert.ok(bootEffect, 'Boot resolution effect should exist')
  assert.doesNotMatch(bootEffect[0], /jobRestored/)
})

test('study-plan current job request has timeout', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /AbortController/)
  assert.match(page, /setTimeout.*controller\.abort.*3000/)
})

test('study-plan uses useAuth instead of useUserSession', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /import.*useAuth.*from/)
  assert.doesNotMatch(page, /useUserSession/)
})

test('proxy matcher includes study-plan routes', async () => {
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')

  assert.match(proxy, /\/study-plan\/:path\*/)
})

test('Supabase proxy clears stale refresh tokens and forwards required cache headers', async () => {
  const middleware = await readFile(new URL('../lib/supabase/middleware.ts', import.meta.url), 'utf8')

  assert.match(middleware, /refresh_token_not_found/)
  assert.match(middleware, /validation_failed/)
  assert.match(middleware, /clearStaleAuthCookies/)
  assert.match(middleware, /name\.startsWith\('sb-'\) && name\.includes\('auth-token'\)/)
  assert.match(middleware, /maxAge:\s*0/)
  assert.match(middleware, /setAll\(cookiesToSet, headersToSet\)/)
  assert.match(middleware, /Object\.entries\(headersToSet\)/)
  assert.match(middleware, /X-Auth-Session-Recovered/)
})

test('study-plan API does not scan 100 writing records for bootstrap', async () => {
  const route = await readFile(new URL('../app/api/study-plan/route.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(route, /writing_records/)
  assert.doesNotMatch(route, /buildLiveStudyPlanAnalysis/)
  assert.doesNotMatch(route, /StudyPlanAnalysisRow/)
  assert.match(route, /analysis_snapshot/)
})

test('NavigationProgress detects navigation via click events', async () => {
  const navProgress = await readFile(new URL('../components/layout/NavigationProgress.tsx', import.meta.url), 'utf8')

  assert.match(navProgress, /handleClick/)
  assert.match(navProgress, /addEventListener.*click/)
  assert.doesNotMatch(navProgress, /document\.readyState/)
  assert.doesNotMatch(navProgress, /setInterval/)
})

test('navigation-events module is removed', async () => {
  await assert.rejects(
    () => readFile(new URL('../lib/navigation-events.ts', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
})

test('Sidebar uses plain Links without onClick navigation handlers', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(sidebar, /navigationEvents/)
  assert.doesNotMatch(sidebar, /handleNavigationStart/)
  assert.doesNotMatch(sidebar, /prefetch=\{true\}/)
})
