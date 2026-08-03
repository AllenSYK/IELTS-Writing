import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { AiProviderError, apiStatusForAiError } from '../lib/ai'
import { resolveAuthRedirect } from '../lib/auth/route-access'
import { isExpiredAt } from '../lib/ielts-scoring'
import { countWords, normalizeEvaluation } from '../lib/writing-records'
import {
  getEffectiveBindingStatus,
  getEffectiveLicenseStatus,
  UNBOUND_BINDING_REASON
} from '../lib/web-license/admin-license-data'
import { readStorageValue } from '../lib/user-storage'
import { accountDisplayName, maskPhone, normalizeMainlandPhone } from '../lib/phone-auth'
import { LegalContactEmail, PrivacySections, TermsEffectiveDate, TermsSections } from '../lib/legal-content'
import {
  MonthlyStudyPlanAdjustmentLimit,
  studyPlanAdjustmentMonthRange,
  studyPlanAdjustmentQuota
} from '../lib/study-plan-adjustments'
import { writingQuestionFromPastPaper } from '../lib/past-paper-practice'
import { studyPlanWritingHref } from '../lib/study-plan-writing'

test('Word count handles punctuation and contractions', () => {
  assert.equal(countWords("It's a well-developed, high-scoring essay."), 5)
})

test('Expiry date parser rejects past licenses', () => {
  assert.equal(isExpiredAt('2026-01-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), true)
  assert.equal(isExpiredAt('2026-12-01T00:00:00.000Z', new Date('2026-06-15T00:00:00.000Z').getTime()), false)
})

test('study plan adjustments reset monthly with three chances per account', () => {
  const range = studyPlanAdjustmentMonthRange(new Date('2026-12-15T08:00:00.000Z'))
  assert.equal(MonthlyStudyPlanAdjustmentLimit, 3)
  assert.equal(range.monthKey, '2026-12')
  assert.equal(range.startsAt, '2026-12-01T00:00:00+08:00')
  assert.equal(range.endsAt, '2027-01-01T00:00:00+08:00')
  assert.deepEqual(studyPlanAdjustmentQuota(2, new Date('2026-12-15T08:00:00.000Z')), {
    monthKey: '2026-12',
    usedCount: 2,
    remainingCount: 1,
    limit: 3
  })
})

test('study plan question-bank tasks open the exact assigned backend question', async () => {
  const task = {
    id: 'plan-task-1',
    taskType: 'task2' as const,
    questionId: 'backend-question-42',
    questionSource: 'question_bank' as const
  }
  assert.equal(
    studyPlanWritingHref(task),
    '/write/task2?studyPlanTaskId=plan-task-1&pastPaper=backend-question-42'
  )
  assert.equal(
    studyPlanWritingHref({ ...task, questionId: null }),
    '/write/task2?studyPlanTaskId=plan-task-1'
  )

  const question = writingQuestionFromPastPaper({
    id: 'backend-question-42',
    taskType: 'task2',
    title: '后台题库原题',
    questionText: 'Some people think public transport should be free. To what extent do you agree or disagree?',
    task2QuestionType: 'agree_disagree'
  })
  assert.equal(question.id, 'backend-question-42')
  assert.equal(question.promptLead, 'Some people think public transport should be free. To what extent do you agree or disagree?')
  assert.equal(question.promptDetail, '')
  assert.equal(question.questionType, 'agree_disagree')
  assert.equal(question.generatedSource, 'static-bank')

  const [assignedQuestionRoute, writingPage, studyPlanDialogs] = await Promise.all([
    readFile(new URL('../app/api/study-plan/tasks/[id]/question/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/write/[mode]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/study-plan/StudyPlanDialogs.tsx', import.meta.url), 'utf8')
  ])
  assert.match(assignedQuestionRoute, /\.eq\('user_id', check\.user\.id\)/)
  assert.match(assignedQuestionRoute, /export async function POST/)
  assert.match(assignedQuestionRoute, /\.update\(\{ question_id: question\.id \}\)/)
  assert.match(assignedQuestionRoute, /questionIsReady/)
  assert.match(assignedQuestionRoute, /\.eq\('is_visible', true\)/)
  assert.match(assignedQuestionRoute, /\.eq\('status', 'published'\)/)
  assert.match(writingPage, /loadAssignedPracticeQuestion/)
  assert.match(writingPage, /let question: WritingQuestion \| null = assignedQuestionResult\.question/)
  assert.match(writingPage, /window\.location\.replace\(studyPlanTaskId \? '\/study-plan' : '\/ielts\/past-papers'\)/)
  assert.match(studyPlanDialogs, /studyPlanWritingHref\(task\)/)
})

test('study plan background work stays attached to the serverless lifecycle', async () => {
  const [generationRoute, retryRoute, analysisRoute] = await Promise.all([
    readFile(new URL('../app/api/study-plan/generation-jobs/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/study-plan/generation-jobs/[id]/retry/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/study-plan/analysis-refresh/route.ts', import.meta.url), 'utf8')
  ])

  for (const route of [generationRoute, retryRoute, analysisRoute]) {
    assert.match(route, /import \{ after \} from 'next\/server'/)
    assert.match(route, /export const maxDuration = 300/)
    assert.match(route, /after\(async \(\) => \{/)
    assert.doesNotMatch(route, /process(?:Generation|AnalysisRefresh)Job\([^)]*\)\.catch/)
  }
})

test('past-paper detail query uses only deployed columns and distinguishes database failures from missing questions', async () => {
  const route = await readFile(
    new URL('../app/api/past-papers/[id]/route.ts', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(route, /task2_topic/)
  assert.doesNotMatch(route, /\btags\b/)
  assert.match(route, /\.maybeSingle\(\)/)
  assert.match(route, /if \(error\)[\s\S]*status: 500/)
  assert.match(route, /if \(!data\)[\s\S]*status: 404/)
})

test('account average override is persisted and learning analytics applies half-band rounding', async () => {
  const [profileRoute, accountSettings, analyticsPage, scoring] = await Promise.all([
    readFile(new URL('../app/api/profile/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/dashboard/AccountSettings.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/analytics/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ielts-scoring.ts', import.meta.url), 'utf8')
  ])

  assert.match(profileRoute, /manual_average_score/)
  assert.match(profileRoute, /manualAverageScore/)
  assert.match(accountSettings, /调整平均分/)
  assert.match(accountSettings, /保存并同步/)
  assert.match(analyticsPage, /manualAverageScore \?\?/)
  assert.match(analyticsPage, /roundToHalfBand\(calculatedAverage\)/)
  assert.match(scoring, /fraction < 0\.25[\s\S]*?fraction < 0\.75/)
})

test('legacy browser storage values migrate without deleting the original value', () => {
  const values = new Map<string, string>([['aerowrite-writing-records-v1:user:user-a', '[{"id":"record-1"}]']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  } as Storage

  const currentKey = 'ielts-writing-writing-records-v1:user:user-a'
  assert.equal(readStorageValue(storage, currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem(currentKey), '[{"id":"record-1"}]')
  assert.equal(storage.getItem('aerowrite-writing-records-v1:user:user-a'), '[{"id":"record-1"}]')
})

test('grading and question routes expose only the authenticated web flow', async () => {
  const [evaluationRoute, promptRoute] = await Promise.all([
    readFile(new URL('../app/api/ai/evaluate/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/generate-prompt/route.ts', import.meta.url), 'utf8')
  ])

  for (const source of [evaluationRoute, promptRoute]) {
    assert.match(source, /requireActiveWebLicense/)
    assert.doesNotMatch(source, /x-device-id|desktop|licenseToken|LICENSE_SERVER_URL/i)
  }
})

test('provider authentication failures stay server errors while rate limits remain retryable', () => {
  assert.equal(apiStatusForAiError(new AiProviderError('bad key', 401, 'ai_api_key_invalid')), 502)
  assert.equal(apiStatusForAiError(new AiProviderError('busy', 429, 'ai_rate_limited')), 429)
  assert.equal(apiStatusForAiError(new AiProviderError('slow', undefined, 'ai_request_timeout')), 504)
  assert.equal(apiStatusForAiError(new AiProviderError('quota', 403, 'ai_quota_exhausted')), 503)
})

test('settings and support pages use browser services only', async () => {
  const [settingsPage, supportPage] = await Promise.all([
    readFile(new URL('../app/settings/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/support/page.tsx', import.meta.url), 'utf8')
  ])

  for (const source of [settingsPage, supportPage]) {
    assert.doesNotMatch(source, /desktopApp|desktopLicense|desktopUpdater|nativeBridge/i)
  }
  // Settings page now redirects to dashboard
  assert.match(settingsPage, /redirect/)
})

test('Stored legacy evaluations normalize into the new result shape', () => {
  const normalized = normalizeEvaluation({
    bandEstimate: '6.5',
    criteria: { taskAchievement: { score: '6.0', feedback: 'overview is limited' } },
    overallFeedback: '旧记录评价。',
    sentenceErrors: [],
    suggestions: ['写清 overview'],
    feedback: ['旧记录评价。']
  })
  assert.equal(normalized?.overallBand, '6.5')
  assert.equal(normalized?.summary, '旧记录评价。')
  assert.deepEqual(normalized?.criteria?.taskAchievement?.evidence, undefined)
  assert.equal(normalized?.criteria?.taskAchievement?.whyNotHigher, undefined)
  assert.deepEqual(normalized?.nextSteps, [])
  assert.deepEqual(normalized?.suggestions, ['写清 overview'])
})

test('Admin routes use the dedicated admin login before license routing', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: false }), '/admin/login')
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: true, role: 'user', licenseActive: false }),
    '/admin/login?reason=not_admin'
  )
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/licenses', isAuthenticated: true, role: 'user', licenseActive: true }),
    '/admin/login?reason=not_admin'
  )
})

test('Admin login never sends ordinary users into the user activation flow', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: false }), null)
  assert.equal(
    resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: true, role: 'user', licenseActive: false }),
    null
  )
  assert.equal(resolveAuthRedirect({ pathname: '/admin/login', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
})

test('Admin and ordinary login redirects remain separate', () => {
  assert.equal(resolveAuthRedirect({ pathname: '/admin', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
  assert.equal(resolveAuthRedirect({ pathname: '/dashboard', isAuthenticated: true, role: 'admin' }), '/admin/licenses')
  assert.equal(
    resolveAuthRedirect({ pathname: '/login', isAuthenticated: true, role: 'user', licenseActive: false }),
    '/activate'
  )
  assert.equal(
    resolveAuthRedirect({ pathname: '/login', isAuthenticated: true, role: 'user', licenseActive: true }),
    '/practice'
  )
})

test('User Home navigation targets the account center without a client redirect page', async () => {
  const [nextConfig, sidebar, commandPalette, appShell] = await Promise.all([
    readFile(new URL('../next.config.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/interaction-system.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
  ])

  assert.match(nextConfig, /source:\s*['"]\/['"][\s\S]*?destination:\s*['"]\/practice['"][\s\S]*?permanent:\s*false/)
  assert.match(sidebar, /id:\s*['"]ielts['"],\s*href:\s*['"]\/practice['"]/)
  assert.match(sidebar, /id:\s*['"]home['"],\s*href:\s*['"]\/dashboard['"]/)
  assert.doesNotMatch(appShell, /写作概览/)
})

test('shared app header keeps one aligned title and removes duplicate creation controls', async () => {
  const [header, shell, css] = await Promise.all([
    readFile(new URL('../components/layout/AppHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.doesNotMatch(header, /开始创作|Start Writing|app-header-create/)
  assert.doesNotMatch(header, /subtitle|ui-label/)
  assert.match(header, /<h1 className="app-header-title">/)
  assert.match(header, /className="app-header-inner"/)
  assert.match(header, /MaterialIcon name="share"/)
  assert.match(header, /MaterialIcon name="manage_accounts"/)
  assert.doesNotMatch(header, /ProfileAvatar|useUserProfile/)
  assert.match(shell, /<AppHeader title=\{meta\.title\} \/>/)
  assert.match(shell, /useLayoutEffect/)
  assert.match(shell, /scrollTo\(\{ top: 0/)
  assert.match(shell, /contentRef/)
  assert.match(css, /\.app-header\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?z-index:\s*40;/)
  assert.match(css, /\.app-header-inner\s*\{[\s\S]*?width:\s*min\(var\(--content-max\), 100%\);[\s\S]*?margin-inline:\s*auto;/)
})

test('auth forms require explicit agreement consent and record versions server-side', async () => {
  const [loginPage, registerPage, loginRoute, registerRoute, migration] = await Promise.all([
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/register/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260619232239_account_records_and_agreements.sql', import.meta.url), 'utf8')
  ])

  for (const source of [loginPage, registerPage]) {
    assert.match(source, /AgreementConsent/)
    assert.match(source, /agreementsAccepted/)
    assert.match(source, /disabled=\{[^}]*!agreementsAccepted/)
  }
  for (const source of [loginRoute, registerRoute]) {
    assert.match(source, /agreementsAccepted:\s*z\.literal\(true\)/)
    assert.match(source, /recordUserAgreements/)
  }
  assert.match(migration, /create table if not exists public\.user_agreements/i)
  assert.match(migration, /unique \(user_id, agreement_type, agreement_version\)/i)
})

test('mainland phone numbers normalize to E.164 and account labels never render blank', () => {
  assert.equal(normalizeMainlandPhone('138 1234-5678'), '+8613812345678')
  assert.equal(normalizeMainlandPhone('+86 13812345678'), '+8613812345678')
  assert.equal(maskPhone('+8613812345678'), '+86138****5678')
  assert.equal(accountDisplayName({ id: '12345678-abcd', email: null, phone: '+8613812345678' }), '+86138****5678')
  assert.equal(accountDisplayName({ id: '12345678-abcd', email: null, phone: null }), '用户 12345678')
  assert.throws(() => normalizeMainlandPhone('12345'))
})

test('legacy phone OTP routes remain isolated while public auth pages stay email-only', async () => {
  const [sendRoute, verifyRoute, loginPage, registerPage] = await Promise.all([
    readFile(new URL('../app/api/auth/phone/send/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/phone/verify/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8')
  ])

  assert.match(sendRoute, /shouldCreateUser:\s*body\.mode === 'register'/)
  assert.match(sendRoute, /body\.mode === 'login' && !existingProfile/)
  assert.match(verifyRoute, /verifyOtp\(\{[\s\S]*type:\s*'sms'/)
  assert.match(verifyRoute, /recordUserAgreements/)
  assert.match(sendRoute, /console\.error\('\[phone-otp-send\]', \{ error: error instanceof Error \? error\.name/)
  assert.match(verifyRoute, /console\.error\('\[phone-otp-verify\]', \{ error: error instanceof Error \? error\.name/)
  assert.match(loginPage, /邮箱登录/)
  assert.match(registerPage, /邮箱注册/)
  assert.doesNotMatch(loginPage, /手机号登录|PhoneOtpForm/)
  assert.doesNotMatch(registerPage, /手机号注册|PhoneOtpForm/)
})

test('agreement controls use one centered dialog and shared legal content without navigation', async () => {
  const [consent, terms, privacy, css] = await Promise.all([
    readFile(new URL('../components/auth/AgreementConsent.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/terms/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/privacy/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles/web-audit-refactor.css', import.meta.url), 'utf8')
  ])

  assert.match(consent, /CenteredDialog/)
  assert.match(consent, /className="agreement-row"/)
  assert.match(consent, /className="agreement-copy"/)
  assert.match(consent, /setOpenDocument\('terms'\)/)
  assert.match(consent, /setOpenDocument\('privacy'\)/)
  assert.match(consent, /event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)/)
  assert.doesNotMatch(consent, /next\/link|href="\/terms"|href="\/privacy"/)
  assert.match(terms, /TermsSections/)
  assert.match(privacy, /PrivacySections/)
  assert.match(css, /\.auth-form \.agreement-consent\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*flex-start;/)
  assert.match(css, /\.auth-form \.agreement-consent input\[type="checkbox"\]\s*\{[\s\S]*?width:\s*18px;[\s\S]*?min-height:\s*18px;/)
  assert.match(css, /\.agreement-copy\s*\{[\s\S]*?min-width:\s*0;/)
  assert.match(css, /\.agreement-copy button\s*\{[\s\S]*?padding:\s*0;[\s\S]*?line-height:\s*inherit;[\s\S]*?vertical-align:\s*baseline;/)
})

test('runtime providers stay mounted across routes while public auth pages remain scrollable', async () => {
  const [runtime, shell, forgotPage, globalCss] = await Promise.all([
    readFile(new URL('../components/layout/AppRuntime.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(runtime, /UserProfileProvider/)
  assert.match(runtime, /UserPerformanceProvider/)
  assert.doesNotMatch(runtime, /usePathname|isPublicAuthRoute/)
  assert.equal((runtime.match(/<AppShell>/g) ?? []).length, 1)
  assert.match(shell, /pathname\.startsWith\('\/forgot-password'\)/)
  assert.match(shell, /pathname\.startsWith\('\/reset-password'\)/)
  assert.doesNotMatch(forgotPage, /UserPerformanceProvider|UserProfileProvider|WritingActivity|license\/status|api\/user/)
  assert.match(globalCss, /\.auth-page\s*\{[\s\S]*?min-height:\s*100dvh;[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-bottom\)/)
  assert.match(globalCss, /\.app-route-root\.is-full-screen\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-x:\s*hidden;/)
  assert.doesNotMatch(globalCss, /\.app-route-root\.is-full-screen\s*\{[^}]*overflow:\s*hidden;/)
})

test('auth submit buttons share one animated spinner across email and phone flows', async () => {
  const [button, login, register, phone, forgot, css] = await Promise.all([
    readFile(new URL('../components/auth/AuthSubmitButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/PhoneOtpForm.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(button, /aria-busy=\{loading \|\| undefined\}/)
  assert.match(button, /disabled=\{Boolean\(disabled \|\| loading\)\}/)
  for (const source of [login, register, phone, forgot]) {
    assert.match(source, /AuthSubmitButton/)
  }
  assert.match(css, /\.auth-loading-spinner\s*\{[\s\S]*?animation:\s*auth-spin 900ms linear infinite;/)
  assert.match(css, /@keyframes auth-spin\s*\{[\s\S]*?transform:\s*rotate\(360deg\);/)
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.auth-loading-spinner/)
})

test('registration card uses a compact responsive width without fixed height clipping', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(css, /\.auth-page\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*center;/)
  assert.match(css, /\.auth-page\s*>\s*\.auth-panel\s*\{[\s\S]*?margin-block:\s*auto;/)
  assert.match(css, /\.auth-register-panel\s*\{[\s\S]*?width:\s*min\(100%, 460px\);/)
  assert.doesNotMatch(css, /\.auth-register-panel\s*\{[^}]*height:/)
  assert.match(css, /@media \(max-height:\s*900px\)[\s\S]*?\.auth-register-panel\s*\{[\s\S]*?padding-block:\s*18px;/)
  assert.match(css, /@media \(max-height:\s*900px\)[\s\S]*?\.auth-register-panel \.brand-logo-lg\s*\{[\s\S]*?--brand-logo-size:\s*58px;/)
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.auth-register-panel\s*\{[\s\S]*?padding:\s*20px;/)
})

test('favicon metadata remains React-owned across client navigation', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8')

  assert.match(layout, /icons:\s*\{[\s\S]*?kongyumeng-tab-icon-20260725-v2\.png/)
  assert.doesNotMatch(layout, /BrandFaviconRefresher/)
  assert.doesNotMatch(layout, /document\.head|querySelectorAll|removeChild|appendChild/)
})

test('settings profile exposes account identity and a confirmed cache-safe logout', async () => {
  const [logout, session, dashboard, accountSettings, css] = await Promise.all([
    readFile(new URL('../app/dashboard/LogoutButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/UserSessionProvider.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/dashboard/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/dashboard/AccountSettings.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(accountSettings, /<LogoutButton \/>/)
  assert.equal((accountSettings.match(/<LogoutButton \/>/g) || []).length, 1)
  assert.match(accountSettings, /账号设置/)
  assert.match(session, /accountDisplayName/)
  assert.match(logout, /CenteredDialog/)
  assert.match(logout, /确定要退出当前账号吗？/)
  assert.match(logout, /supabase\.auth\.signOut\(\)/)
  assert.match(logout, /clearUserRouteMemoryCaches\(userId\)/)
  assert.match(logout, /prepareForLogout\(\)/)
  assert.match(logout, /window\.location\.replace\('\/login'\)/)
  assert.doesNotMatch(logout, /router\.(?:replace|refresh)\(/)
  assert.match(logout, /loading \? '正在退出' : '退出登录'/)
  assert.doesNotMatch(dashboard, /dashboard-header|练习概览|<LogoutButton/)
  assert.match(dashboard, /<section className="dashboard-main">\s*<section className="dashboard-grid">/)
  assert.doesNotMatch(css, /\.dashboard-header\s*\{/)
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.app-header\s*\{[\s\S]*?flex:\s*0 0 auto;/)
})

test('email auth entry pages switch reliably without a loading gate or redundant method overlay', async () => {
  const [login, register, css] = await Promise.all([
    readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(login, /<a href="\/register">立即注册<\/a>/)
  assert.match(register, /<a href="\/login">登录<\/a>/)
  assert.doesNotMatch(login, /import Link from ['"]next\/link['"]/)
  assert.doesNotMatch(register, /import Link from ['"]next\/link['"]/)
  assert.doesNotMatch(login, /sessionStatus === 'loading'/)
  assert.doesNotMatch(login, /<h1>加载中/)
  assert.match(login, /className="auth-kicker">邮箱登录/)
  assert.match(register, /className="auth-kicker">邮箱注册/)
  assert.doesNotMatch(login, /auth-method-tabs/)
  assert.doesNotMatch(register, /auth-method-tabs/)
  assert.doesNotMatch(css, /\.auth-method-tabs/)
  assert.match(css, /\.app-route-root\.is-full-screen\s*\{[\s\S]*?overflow-y:\s*auto;/)
})

test('legal pages share the current contact email, AI notice, and final terms effective date', async () => {
  const legalSource = await readFile(new URL('../lib/legal-content.ts', import.meta.url), 'utf8')
  const legalSections = await readFile(new URL('../components/legal/LegalSections.tsx', import.meta.url), 'utf8')

  assert.equal(LegalContactEmail, 'qgyxzq@gmail.com')
  assert.equal(TermsEffectiveDate, '2026年7月1日')
  assert.equal(TermsSections.at(-1)?.[0], '生效日期')
  assert.equal(TermsSections.at(-1)?.[1], '生效日期：2026年7月1日。最近更新日期：2026年7月1日')
  assert.ok(TermsSections.some(([title, body]) => title === '人工智能服务说明' && body.includes('阿里云通义千问')))
  assert.ok(TermsSections.some(([, body]) => body.includes(LegalContactEmail)))
  assert.ok(PrivacySections.some(([, body]) => body.includes(LegalContactEmail)))
  assert.doesNotMatch(legalSource, /support@ieltswriting\.online/)
  assert.doesNotMatch(legalSource, /qwen-[a-z0-9._-]+|具体模型版本|官方认证模型/i)
  assert.match(legalSections, /mailto:\$\{LegalContactEmail\}/)
})

test('practice settings include automatic uploaded-task recognition and direct writing navigation', async () => {
  const [selector, uploadPanel, parseRoute, parser, aiProvider, writePage, migration, followupMigration, css] = await Promise.all([
    readFile(new URL('../components/practice/WritingModeSelector.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/practice/UploadedTaskPanel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/parse-uploaded-writing-task/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/uploaded-writing-task-ai.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ai-provider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/write/[mode]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260620131332_custom_task_uploads_and_phone_profiles.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260621040923_automate_uploaded_task_recognition.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])

  assert.match(selector, /function PracticeSettingRow/)
  assert.match(selector, /practice-setting-row/)
  assert.match(selector, /<UploadedTaskPanel/)
  assert.match(css, /\.practice-setting-row\s*\{[\s\S]*?grid-template-columns:/)
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.practice-setting-row,[\s\S]*?grid-template-columns:\s*1fr/)
  assert.match(uploadPanel, /image\/png,image\/jpeg,image\/webp/)
  assert.match(uploadPanel, /自动判断 Task 1 \/ Task 2/)
  assert.match(uploadPanel, /window\.location\.assign\(data\.redirectUrl\)/)
  assert.doesNotMatch(uploadPanel, /确认题目|taskType.*setTaskType|form\.set\('taskType'/)
  assert.match(parseRoute, /requireActiveWebLicense/)
  assert.match(parseRoute, /validateImageUpload/)
  assert.match(parseRoute, /createSignedUrl/)
  assert.match(parseRoute, /confirmed_question:\s*question/)
  assert.match(parseRoute, /status:\s*'confirmed'/)
  assert.match(parseRoute, /redirectUrl/)
  assert.match(parseRoute, /export const maxDuration = 300/)
  assert.match(parser, /responseMode:\s*'non-stream'/)
  assert.match(aiProvider, /stream:\s*false/)
  assert.match(writePage, /customTask/)
  assert.match(writePage, /normalizeGeneratedQuestion/)
  assert.match(writePage, /部分图表数据未能完全复原/)
  assert.match(migration, /'writing-task-uploads',[\s\S]*?false,[\s\S]*?10485760/)
  assert.match(migration, /writing-task-uploads/)
  assert.match(migration, /storage\.foldername\(name\)/)
  assert.match(followupMigration, /task_type in \('unknown', 'task1', 'task2'\)/)
})

test('writing heatmap positions the latest date at the right edge before paint', async () => {
  const [heatmap, css] = await Promise.all([
    readFile(new URL('../components/dashboard/WritingActivityHeatmap.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  ])
  assert.match(heatmap, /useLayoutEffect/)
  assert.match(heatmap, /scrollWidth - container\.clientWidth/)
  assert.match(heatmap, /\[latestDate, range, weeks\.length\]/)
  assert.match(css, /\.activity-chart\s*\{[\s\S]*?margin:\s*0 0 0 auto;/)
  assert.match(css, /\.activity-scroll::\-webkit-scrollbar[\s\S]*?display:\s*none;/)
})

test('result annotations open in one centered dialog without scrollIntoView', async () => {
  const [resultPage, annotatedEssay, dialog, layout] = await Promise.all([
    readFile(new URL('../app/result/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/AnnotatedEssay.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/AnnotationDialog.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/EvaluationLayout.tsx', import.meta.url), 'utf8')
  ])

  assert.match(resultPage, /<AnnotationDialog/)
  assert.doesNotMatch(resultPage, /AnnotationInspector|inspector=/)
  assert.doesNotMatch(annotatedEssay, /scrollIntoView/)
  assert.match(dialog, /CenteredDialog/)
  assert.match(dialog, /onClose/)
  assert.doesNotMatch(layout, /evaluation-inspector-column/)
})

test('result detail keeps scores and content intact while using responsive aligned layout', async () => {
  const [resultPage, scoreSummary, css, appShell] = await Promise.all([
    readFile(new URL('../app/result/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/evaluation/ScoreSummary.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles/web-audit-refactor.css', import.meta.url), 'utf8'),
    readFile(new URL('../components/layout/AppShell.tsx', import.meta.url), 'utf8')
  ])

  assert.match(resultPage, /<h1 className="ui-title-display result-title">\{record\.title\}<\/h1>/)
  assert.match(scoreSummary, /<div className="result-score-label">写作总分<\/div>/)
  assert.match(scoreSummary, /<strong className="result-score-value">\{displayOverall\}<\/strong>/)
  assert.match(scoreSummary, /<div className="result-score-caption">雅思写作模拟评分<\/div>/)
  assert.match(scoreSummary, /Math\.max\(0, Math\.min\(100, \(numericOverall \/ 9\) \* 100\)\)/)
  assert.match(scoreSummary, /className="result-score-decoration" aria-hidden="true"/)
  assert.doesNotMatch(scoreSummary, /接近 7 分|当前水平|分数等级|四项评分明细/)

  assert.match(scoreSummary, /const \[isCommentExpanded, setIsCommentExpanded\] = useState\(false\)/)
  assert.match(scoreSummary, /comment\.scrollHeight > comment\.clientHeight \+ 1/)
  assert.match(scoreSummary, /window\.addEventListener\('resize', measureCommentOverflow\)/)
  assert.match(scoreSummary, /className=\{`result-comment-text \$\{isCommentExpanded \? 'is-expanded' : 'is-collapsed'\}`\}/)
  assert.match(scoreSummary, /\{isCommentOverflowing && \([\s\S]*?type="button"[\s\S]*?aria-expanded=\{isCommentExpanded\}/)
  assert.match(scoreSummary, /aria-controls="result-overall-comment"/)
  assert.match(scoreSummary, /onClick=\{\(\) => setIsCommentExpanded\(\(value\) => !value\)\}/)
  assert.match(scoreSummary, /\{isCommentExpanded \? '收起' : '展开全文'\}/)
  assert.doesNotMatch(scoreSummary, /\bfetch\s*\(/)

  assert.match(scoreSummary, /displayCriteria\.map\(\(criterion\) =>/)
  assert.match(scoreSummary, /<strong className="criterion-card-score">\{criterion\.score\}<\/strong>/)
  assert.match(scoreSummary, /className="criterion-card"[\s\S]*?onClick=\{\(\) => handleCardClick\(criterion\)\}/)
  assert.match(scoreSummary, /className="criteria-detail-btn"[\s\S]*?>[\s\S]*?查看详情/)
  assert.equal((scoreSummary.match(/查看详情/g) ?? []).length, 1)

  const primaryTabs = resultPage.match(/<div className="result-tabs result-primary-tabs"[\s\S]*?<\/div>\s*<article/)?.[0] ?? ''
  assert.equal((primaryTabs.match(/role="tab"/g) ?? []).length, 4)
  for (const label of ['原文', '批改标注', '改写版本', '高分范文']) {
    assert.match(primaryTabs, new RegExp(`<span>${label}<\\/span>`))
  }
  assert.match(primaryTabs, /<MaterialIcon name="auto_awesome" size=\{16\} \/>/)
  for (const tab of ['original', 'corrected', 'revised', 'model']) {
    assert.match(primaryTabs, new RegExp(`onClick=\\{\\(\\) => setTab\\('${tab}'\\)\\}`))
  }

  for (const action of ['基于原题重写', '根据反馈重写', '重新练习', '保存到错题本', '复制高分范文']) {
    assert.match(resultPage, new RegExp(action))
  }

  assert.match(css, /\.result-title\s*\{[\s\S]*?font-size:\s*clamp\(2rem, 3\.1vw, 2\.75rem\);[\s\S]*?overflow:\s*visible;/)
  assert.match(css, /\.score-summary-heading\s*\{[\s\S]*?grid-template-columns:\s*minmax\(260px, 0\.9fr\) minmax\(0, 2\.2fr\);/)
  assert.match(css, /\.score-summary-hero-inner\s*\{[\s\S]*?max-width:\s*220px;[\s\S]*?align-items:\s*center;[\s\S]*?text-align:\s*center;/)
  assert.doesNotMatch(css, /\.score-summary-hero-inner\s*\{[^}]*transform:/)
  assert.match(css, /\.score-summary-hero \.result-score-value\s*\{[\s\S]*?font-size:\s*clamp\(3\.8rem, 5vw, 5rem\);/)
  assert.match(css, /\.result-score-decoration\s*\{[\s\S]*?width:\s*min\(150px, 80%\);[\s\S]*?height:\s*16px;/)
  assert.match(css, /\.result-comment-text\.is-collapsed\s*\{[\s\S]*?-webkit-line-clamp:\s*7;[\s\S]*?overflow:\s*hidden;/)
  assert.match(css, /\.result-comment-text\.is-expanded\s*\{[\s\S]*?overflow:\s*visible;/)
  assert.match(css, /\.result-comment-toggle\s*\{[\s\S]*?align-self:\s*flex-end;[\s\S]*?min-height:\s*32px;/)

  assert.match(css, /\.criteria-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*14px;[\s\S]*?margin-top:\s*24px;/)
  assert.match(css, /\.criterion-card\s*\{[\s\S]*?min-height:\s*210px;[\s\S]*?padding:\s*22px 20px 18px;/)
  assert.match(css, /\.criterion-card-label\s*\{[\s\S]*?min-height:\s*40px;[\s\S]*?align-items:\s*flex-start;/)
  assert.match(css, /\.criteria-detail-btn\s*\{[\s\S]*?margin-top:\s*auto;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*32px;/)
  assert.match(css, /\.result-primary-tabs\s*\{[\s\S]*?overflow-x:\s*auto;/)
  assert.match(css, /\.result-primary-tabs \.result-tab\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;/)
  assert.match(css, /\.result-primary-tabs \.result-tab::after\s*\{[\s\S]*?transform:\s*scaleX\(0\);/)
  assert.match(css, /@media \(max-width: 1040px\)[\s\S]*?\.criteria-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.criteria-grid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.score-summary-heading\s*\{\s*grid-template-columns:\s*1fr;/)
  assert.match(appShell, /pathname\.startsWith\('\/result'\), title: '批改结果'/)
})

test('grading pipeline parallelizes annotation blocks and leaves essays on demand', async () => {
  const [pipeline, provider, derivativeRoute] = await Promise.all([
    readFile(new URL('../lib/ielts-evaluation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ai-provider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/ai/essay-derivative/route.ts', import.meta.url), 'utf8')
  ])

  assert.match(pipeline, /Promise\.allSettled/)
  assert.match(pipeline, /requestId:\s*`\$\{requestId\}-block-\$\{block\.index\}\$\{/)
  assert.match(pipeline, /attempt > 1 \? `-retry-\$\{attempt\}` : ''/)
  assert.match(pipeline, /validateBlockAnnotationResponse\(normalized,\s*block\)/)
  assert.doesNotMatch(pipeline, /requestRewrite\(config/)
  assert.match(provider, /enable_thinking:\s*false/)
  assert.match(provider, /modelEnv:\s*'QWEN_GRADING_MODEL'/)
  assert.match(derivativeRoute, /kind:\s*z\.enum\(\['revised', 'model'\]\)/)
})

test('Admin license status distinguishes unused, partial, exhausted, and expired', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 0, max_activations: 3 }, now), 'unused')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 1, max_activations: 3 }, now), 'partial')
  assert.equal(getEffectiveLicenseStatus({ status: 'active', activation_count: 3, max_activations: 3 }, now), 'exhausted')
  assert.equal(getEffectiveLicenseStatus({
    status: 'active',
    activation_count: 0,
    max_activations: 3,
    expires_at: '2026-06-17T00:00:00.000Z'
  }, now), 'expired')
})

test('Admin binding status distinguishes valid, expiring, expired, revoked, and unbound', () => {
  const now = new Date('2026-06-18T00:00:00.000Z').getTime()
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'active')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-25T00:00:00.000Z' }, now), 'expiring')
  assert.equal(getEffectiveBindingStatus({ status: 'active', expires_at: '2026-06-17T00:00:00.000Z' }, now), 'expired')
  assert.equal(getEffectiveBindingStatus({ status: 'revoked', expires_at: '2026-08-18T00:00:00.000Z' }, now), 'revoked')
  assert.equal(getEffectiveBindingStatus({
    status: 'active',
    expires_at: '2026-08-18T00:00:00.000Z',
    license_status: 'disabled'
  }, now), 'revoked')
  assert.equal(getEffectiveBindingStatus({
    status: 'revoked',
    expires_at: '2026-08-18T00:00:00.000Z',
    revoked_reason: UNBOUND_BINDING_REASON
  }, now), 'unbound')
})
