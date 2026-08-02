import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function readTsxTree(relativeRoot: string) {
  const root = new URL(relativeRoot, import.meta.url)
  const paths = await readdir(root, { recursive: true })
  return Promise.all(
    paths
      .filter((path) => path.endsWith('.tsx'))
      .map(async (path) => ({
        path,
        source: await readFile(new URL(path, root), 'utf8')
      }))
  )
}

test('web fonts use compressed sources without changing the declared families or weights', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')

  assert.match(css, /font-family:\s*"Inter"/)
  assert.match(css, /font-family:\s*"Material Symbols Outlined"/)
  assert.match(css, /inter-400\.woff2/)
  assert.match(css, /material-symbols-outlined-400\.woff2/)
  assert.doesNotMatch(css, /url\("\/fonts\/[^"]+\.ttf"\)/)
})

test('user shell navigation uses Next links with intentional prefetching', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')
  const header = await readFile(new URL('../components/layout/AppHeader.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /import Link from ['"]next\/link['"]/)
  assert.ok((sidebar.match(/<Link\b/g) ?? []).length >= 5, 'expected desktop and mobile sidebar links')
  assert.match(sidebar, /href:\s*'\/practice',[\s\S]*?prefetch:\s*true/)
  assert.match(sidebar, /label:\s*'帮助与反馈',[\s\S]*?prefetch:\s*false/)
  assert.match(sidebar, /prefetch=\{item\.prefetch\}/)
  assert.match(header, /<a[\s\S]*?href="https:\/\/xhslink\.com\//)
  assert.match(header, /import Link from ['"]next\/link['"]/)
  assert.match(header, /<Link[^>]*href="\/dashboard"[^>]*prefetch/)
  assert.doesNotMatch(sidebar, /onMouseEnter/)
  assert.doesNotMatch(sidebar, /router\.prefetch/)
  assert.doesNotMatch(sidebar, /pageDataPrefetchers/)
  assert.doesNotMatch(sidebar, /preventDefault|stopPropagation|router\.push/)
})

test('interactive buttons declare their form behavior explicitly', async () => {
  const sources = [
    ...await readTsxTree('../app/'),
    ...await readTsxTree('../components/')
  ]

  for (const { path, source } of sources) {
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        && node.tagName.getText(sourceFile) === 'button'
      ) {
        const hasExplicitType = node.attributes.properties.some(
          (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'type'
        )
        assert.equal(hasExplicitType, true, `${path} has a button with implicit form behavior`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
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
  assert.match(provider, /useSWRConfig\(\)/)
  assert.doesNotMatch(provider, /<SWRConfig|provider:\s*\(\)\s*=>/)
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
  const errorsPage = await readFile(new URL('../app/study-plan/errors/page.tsx', import.meta.url), 'utf8')

  assert.match(page, /\['study-plan',\s*userId\]/)
  assert.match(errorsPage, /\[`\/api\/study-plan\/errors\?\$\{params\.toString\(\)\}`, userId\]/)
  assert.match(errorsPage, /\['\/api\/study-plan\/errors\/backfill\/status', userId\]/)
  assert.match(errorsPage, /occurrences\?limit=5`, userId\]/)
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

test('global navigation does not install a document click interceptor', async () => {
  await assert.rejects(
    () => readFile(new URL('../components/layout/NavigationProgress.tsx', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
})

test('navigation-events module is removed', async () => {
  await assert.rejects(
    () => readFile(new URL('../lib/navigation-events.ts', import.meta.url), 'utf8'),
    (err: unknown) => err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
  )
})

test('Sidebar avoids imperative client-router navigation handlers', async () => {
  const sidebar = await readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(sidebar, /navigationEvents/)
  assert.doesNotMatch(sidebar, /handleNavigationStart/)
  assert.doesNotMatch(sidebar, /preventDefault|stopPropagation|router\.(?:push|replace)/)
  assert.match(sidebar, /prefetch=\{item\.prefetch\}/)
})

test('profile loading is lazy and observed APIs expose safe performance timing', async () => {
  const [profileStore, settings, analytics, observability, auth] = await Promise.all([
    readFile(new URL('../stores/user-profile-store.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/dashboard/AccountSettings.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/analytics/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/api-observability.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/web-license/auth.ts', import.meta.url), 'utf8')
  ])

  assert.match(profileStore, /ensureServerProfile/)
  assert.match(settings, /ensureServerProfile\(\)/)
  assert.match(analytics, /ensureServerProfile\(\)/)
  assert.doesNotMatch(profileStore, /useEffect\([\s\S]{0,600}?fetch\('\/api\/profile'/)
  assert.match(observability, /Server-Timing/)
  assert.match(observability, /X-Request-Id/)
  assert.match(observability, /VERCEL_REGION/)
  assert.doesNotMatch(auth, /\.update\(\{\s*status:\s*'expired'/)
})

test('Supabase performance migration keeps access service-only and RLS user-scoped', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260802095744_navigation_auth_performance.sql', import.meta.url),
    'utf8'
  )

  assert.match(migration, /drop policy if exists "allow admin read activations"/)
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/)
  assert.match(migration, /get_web_license_access_state\(p_user_id uuid\)/)
  assert.match(migration, /security invoker/)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/)
  assert.match(migration, /grant execute on function[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /create index/i)
})
