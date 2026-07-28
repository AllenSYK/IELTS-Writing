import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Sidebar hover does not trigger business API calls', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(sidebar, /pageDataPrefetchers/)
  assert.doesNotMatch(sidebar, /fetch\('\/api\/study-plan'/)
  assert.doesNotMatch(sidebar, /fetch\('\/api\/user\/writing-records/)
  assert.doesNotMatch(sidebar, /fetch\('\/api\/profile'/)
  assert.doesNotMatch(sidebar, /cache:\s*'no-store'/)
})

test('all private navigation Links use prefetch={false}', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  const linkPrefetchTrue = sidebar.match(/prefetch=\{true\}/g)
  assert.equal(linkPrefetchTrue, null, 'No Link should use prefetch={true}')

  const prefetchFalseCount = (sidebar.match(/prefetch=\{false\}/g) || []).length
  assert.ok(prefetchFalseCount >= 5, `Expected at least 5 prefetch={false} declarations, got ${prefetchFalseCount}`)
})

test('no router.prefetch calls exist in Sidebar', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(sidebar, /router\.prefetch/)
  assert.doesNotMatch(sidebar, /useRouter/)
})

test('NavigationProgress starts on click, not on pathname change', async () => {
  const navProgress = await readFile(new URL('../components/layout/NavigationProgress.tsx', import.meta.url), 'utf8')

  assert.match(navProgress, /navigationEvents/)
  assert.doesNotMatch(navProgress, /document\.readyState/)
  assert.doesNotMatch(navProgress, /window.*load/)
  assert.doesNotMatch(navProgress, /setInterval/)
})

test('UserPerformanceProvider does not remount on userId change via React key', async () => {
  const provider = await readFile(new URL('../components/performance/UserPerformanceProvider.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(provider, /key=\{userId/)
  assert.doesNotMatch(provider, /key=\{'anonymous/)
})

test('SWR provider uses stable cache reference', async () => {
  const provider = await readFile(new URL('../components/performance/UserPerformanceProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /useRef\(new Map\(\)\)/)
  assert.doesNotMatch(provider, /provider:\s*\(\)\s*=>\s*new Map\(\)/)
})

test('UserSessionProvider uses session.user from onAuthStateChange', async () => {
  const provider = await readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8')

  assert.match(provider, /onAuthStateChange\(\(event, session\)/)
  assert.match(provider, /applyUser\(session\?\.user/)
})

test('UserSessionProvider does not call refreshUser in onAuthStateChange', async () => {
  const provider = await readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8')

  const authChangeMatch = provider.match(/onAuthStateChange[\s\S]*?return \(\) =>/)
  assert.ok(authChangeMatch, 'Should find onAuthStateChange handler')
  assert.doesNotMatch(authChangeMatch[0], /refreshUser/)
})

test('UserProfileProvider wraps all authenticated routes without conditional', async () => {
  const runtime = await readFile(new URL('../components/layout/AppRuntime.tsx', import.meta.url), 'utf8')

  assert.match(runtime, /<UserProfileProvider>/)
  assert.doesNotMatch(runtime, /needsUserProfile/)
  assert.doesNotMatch(runtime, /pathname\s*===\s*'\/dashboard'/)
  assert.doesNotMatch(runtime, /pathname\s*===\s*'\/analytics'/)
})

test('study-plan SWR key includes userId', async () => {
  const page = await readFile(new URL('../app/study-plan/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /\['study-plan',\s*userId\]/)
})

test('no global transition:none or animation:none is injected at runtime', async () => {
  try {
    await readFile(new URL('../components/providers/InteractionOptimizer.tsx', import.meta.url), 'utf8')
    assert.fail('InteractionOptimizer.tsx should have been deleted')
  } catch (err: unknown) {
    assert.ok(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')
  }

  try {
    await readFile(new URL('../lib/interaction-optimizer.ts', import.meta.url), 'utf8')
    assert.fail('interaction-optimizer.ts should have been deleted')
  } catch (err: unknown) {
    assert.ok(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')
  }
})

test('navigation-events module provides start/complete/subscribe API', async () => {
  const mod = await readFile(new URL('../lib/navigation-events.ts', import.meta.url), 'utf8')

  assert.match(mod, /start\(\)/)
  assert.match(mod, /complete\(\)/)
  assert.match(mod, /subscribe\(listener/)
  assert.doesNotMatch(mod, /setInterval/)
  assert.doesNotMatch(mod, /document\.readyState/)
})
