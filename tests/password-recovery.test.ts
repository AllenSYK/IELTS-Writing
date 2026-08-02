import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import { maskEmail, normalizeEmail } from '../lib/auth/email-utils'
import { isEmailOtpCode, sanitizeEmailOtpCode } from '../lib/auth/email-otp'
import { toPasswordRecoveryError } from '../lib/auth/error-messages'
import { EMAIL_OTP_LENGTH } from '../lib/auth/otp-constants'
import {
  applyOtpBackspace,
  applyOtpInput,
  applyOtpPaste,
  createOtpCells,
  getOtpNavigationIndex
} from '../lib/auth/otp-input-model'
import { createForgotPasswordPost } from '../lib/auth/password-recovery-handler'
import {
  PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_RESEND_SECONDS,
  validateRecoveryPassword
} from '../lib/auth/password-recovery'

process.env.EMAIL_VERIFICATION_SECRET ||= 'password-recovery-test-secret-with-32-bytes'

const Endpoint = 'http://localhost/api/auth/forgot-password'
const UniformMessage = '如果该邮箱已注册，六位验证码将发送到该邮箱。'

type MockAuthError = {
  code?: string
  message?: string
  status?: number
}

function recoveryRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(Endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

function createMockDependencies(options: {
  authError?: MockAuthError | null
  allowed?: boolean
  throwRateLimit?: Error
} = {}) {
  const sentEmails: string[] = []
  const rateLimitInputs: Array<{ emailHash: string; ipHash: string | null; requestId: string }> = []
  const statuses: Array<{ requestId: string; status: string }> = []

  return {
    sentEmails,
    rateLimitInputs,
    statuses,
    dependencies: {
      createRequestId: () => '00000000-0000-4000-8000-000000000001',
      async checkRateLimit(input: { emailHash: string; ipHash: string | null; requestId: string }) {
        if (options.throwRateLimit) throw options.throwRateLimit
        rateLimitInputs.push(input)
        return {
          allowed: options.allowed ?? true,
          retryAfter: 60,
          reason: options.allowed === false ? 'email_cooldown' : 'accepted'
        }
      },
      async updateRequestStatus(requestId: string, status: 'accepted' | 'completed' | 'failed') {
        statuses.push({ requestId, status })
        return true
      },
      async sendRecoveryOtp(email: string) {
        sentEmails.push(email)
        return { error: options.authError ?? null }
      }
    }
  }
}

test('email and OTP helpers normalize, mask, sanitize, and enforce exact bounds', () => {
  assert.equal(normalizeEmail('  User.Name@Example.COM  '), 'user.name@example.com')
  assert.equal(maskEmail('User.Name@Example.COM'), 'u******@example.com')
  assert.equal(sanitizeEmailOtpCode(' 1a2-3 4中56 78'), '123456')
  assert.equal(sanitizeEmailOtpCode('abc中文!@#'), '')
  assert.equal(EMAIL_OTP_LENGTH, 6)
  assert.equal(isEmailOtpCode('12345'), false)
  assert.equal(isEmailOtpCode('123456'), true)
  assert.equal(isEmailOtpCode('12345678'), false)
  assert.equal(PASSWORD_RECOVERY_RESEND_SECONDS, 60)
  assert.equal(PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH, 128)
})

test('the shared OTP model handles input, filtering, paste, backspace, and navigation', () => {
  const empty = createOtpCells('', EMAIL_OTP_LENGTH)
  const first = applyOtpInput(empty, 0, '1')
  assert.deepEqual(first, { cells: ['1', '', '', '', '', ''], focusIndex: 1 })

  const filtered = applyOtpInput(first.cells, 1, 'a中-2')
  assert.deepEqual(filtered, { cells: ['1', '2', '', '', '', ''], focusIndex: 2 })

  const pasted = applyOtpPaste(empty, 0, '12 34-56')
  assert.deepEqual(pasted, { cells: ['1', '2', '3', '4', '5', '6'], focusIndex: 5 })
  assert.deepEqual(applyOtpPaste(empty, 0, '12345678').cells, ['1', '2', '3', '4', '5', '6'])

  const cleared = applyOtpBackspace(pasted.cells, 5)
  assert.deepEqual(cleared, { cells: ['1', '2', '3', '4', '5', ''], focusIndex: 5 })
  assert.equal(applyOtpBackspace(cleared.cells, 5).focusIndex, 4)
  assert.equal(getOtpNavigationIndex('ArrowLeft', 3), 2)
  assert.equal(getOtpNavigationIndex('ArrowRight', 3), 4)
  assert.equal(getOtpNavigationIndex('Home', 3), 0)
  assert.equal(getOtpNavigationIndex('End', 1), 5)
})

test('password validation preserves input and enforces length and confirmation', () => {
  assert.equal(validateRecoveryPassword('1234567', '1234567'), '新密码至少需要 8 位。')
  assert.equal(validateRecoveryPassword('a'.repeat(129), 'a'.repeat(129)), '新密码不能超过 128 位。')
  assert.equal(validateRecoveryPassword(' 1234567', '12345678'), '两次输入的密码不一致。')
  assert.equal(validateRecoveryPassword(' 1234567', ' 1234567'), '')
})

test('password recovery errors map to safe Chinese messages', () => {
  assert.equal(toPasswordRecoveryError('otp_expired'), '验证码已过期，请重新发送。')
  assert.equal(toPasswordRecoveryError('Invalid OTP'), '验证码不正确，请重新输入。')
  assert.equal(toPasswordRecoveryError('Email rate limit exceeded'), '操作过于频繁，请稍后再试。')
  assert.equal(toPasswordRecoveryError('Password should be at least 8 characters'), '新密码强度不足，请使用至少 8 位密码。')
  assert.equal(toPasswordRecoveryError('New password should be different from the old password'), '新密码不能与原密码相同。')
  assert.equal(toPasswordRecoveryError('Auth session missing'), '验证状态已失效，请重新获取验证码。')
  assert.equal(toPasswordRecoveryError('fetch failed'), '网络连接失败，请稍后重试。')
})

test('forgot-password API validates, trims, lowercases, hashes identifiers, and calls the mocked Recovery sender', async () => {
  const mock = createMockDependencies()
  const post = createForgotPasswordPost(mock.dependencies)
  const response = await post(recoveryRequest(
    { email: '  Registered.User@Example.COM  ' },
    { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }
  ))
  const payload = await response.json() as Record<string, unknown>

  assert.equal(response.status, 200)
  assert.deepEqual(payload, { success: true, message: UniformMessage })
  assert.deepEqual(mock.sentEmails, ['registered.user@example.com'])
  assert.equal(mock.rateLimitInputs[0]?.emailHash.length, 64)
  assert.equal(mock.rateLimitInputs[0]?.ipHash?.length, 64)
  assert.doesNotMatch(JSON.stringify(mock.rateLimitInputs), /registered\.user@example\.com|203\.0\.113\.10/)
  assert.deepEqual(mock.statuses.map((entry) => entry.status), ['completed'])
})

test('forgot-password API rejects invalid and overlong email without calling Supabase Auth', async () => {
  const mock = createMockDependencies()
  const post = createForgotPasswordPost(mock.dependencies)

  const invalid = await post(recoveryRequest({ email: 'not-an-email' }))
  const overlong = await post(recoveryRequest({ email: `${'a'.repeat(309)}@example.com` }))

  assert.equal(invalid.status, 400)
  assert.equal(overlong.status, 400)
  assert.deepEqual(mock.sentEmails, [])
  assert.deepEqual(await invalid.json(), { success: false, message: '请输入有效的邮箱地址。' })
})

test('registered and missing users receive the same anti-enumeration response', async () => {
  const registered = createMockDependencies()
  const missing = createMockDependencies({
    authError: { code: 'user_not_found', message: 'User not found', status: 422 }
  })
  const unconfirmed = createMockDependencies({
    authError: { code: 'email_not_confirmed', message: 'Email not confirmed', status: 400 }
  })

  const registeredResponse = await createForgotPasswordPost(registered.dependencies)(recoveryRequest({ email: 'person@example.com' }))
  const missingResponse = await createForgotPasswordPost(missing.dependencies)(recoveryRequest({ email: 'person@example.com' }))

  assert.equal(registeredResponse.status, missingResponse.status)
  assert.deepEqual(await registeredResponse.json(), await missingResponse.json())
  assert.deepEqual(
    await createForgotPasswordPost(unconfirmed.dependencies)(recoveryRequest({ email: 'person@example.com' })).then((result) => result.json()),
    { success: true, message: UniformMessage }
  )
  assert.deepEqual(await createForgotPasswordPost(missing.dependencies)(recoveryRequest({ email: 'other@example.com' })).then((result) => result.json()), {
    success: true,
    message: UniformMessage
  })
})

test('API responses never contain OTPs, action links, user IDs, or auth metadata', async () => {
  const mock = createMockDependencies()
  const response = await createForgotPasswordPost(mock.dependencies)(recoveryRequest({ email: 'person@example.com' }))
  const serialized = JSON.stringify(await response.json())

  assert.doesNotMatch(serialized, /token|otp|code|action.?link|user.?id|metadata|session|redirect/i)
  assert.equal(serialized.includes('person@example.com'), false)
})

test('database and Supabase rate limits return safe errors without sending another email', async () => {
  const databaseLimited = createMockDependencies({ allowed: false })
  const databaseResponse = await createForgotPasswordPost(databaseLimited.dependencies)(recoveryRequest({ email: 'person@example.com' }))
  assert.equal(databaseResponse.status, 429)
  assert.equal(databaseResponse.headers.get('Retry-After'), '60')
  assert.deepEqual(databaseLimited.sentEmails, [])
  assert.deepEqual(await databaseResponse.json(), { success: false, message: '操作过于频繁，请稍后再试。' })

  const authLimited = createMockDependencies({ authError: { code: 'over_email_send_rate_limit', status: 429 } })
  const authResponse = await createForgotPasswordPost(authLimited.dependencies)(recoveryRequest({ email: 'person@example.com' }))
  assert.equal(authResponse.status, 429)
  assert.deepEqual(await authResponse.json(), { success: false, message: '操作过于频繁，请稍后再试。' })
})

test('Supabase Auth or SMTP failures return a generic message and safe logs', async () => {
  const originalConsoleError = console.error
  const logged: unknown[][] = []
  console.error = (...values: unknown[]) => { logged.push(values) }

  try {
    const mock = createMockDependencies({
      authError: {
        code: 'smtp_failure',
        message: 'SMTP failed for sensitive.person@example.com with code 654321',
        status: 500
      }
    })
    const response = await createForgotPasswordPost(mock.dependencies)(recoveryRequest({
      email: 'sensitive.person@example.com',
      password: 'NeverLogThisPassword',
      code: '654321'
    }, {
      authorization: 'Bearer NeverLogThisAuthorization',
      cookie: 'NeverLogThisCookie'
    }))
    const serializedLogs = JSON.stringify(logged)

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { success: false, message: '暂时无法发送验证码，请稍后重试。' })
    assert.doesNotMatch(serializedLogs, /sensitive\.person@example\.com|654321|NeverLogThisPassword|NeverLogThisAuthorization|NeverLogThisCookie/)
    assert.match(serializedLogs, /smtp_failure/)
  } finally {
    console.error = originalConsoleError
  }
})

test('the recovery page implements accessible email, OTP, password, resend, focus, and success steps', async () => {
  const [page, registerPage, otpInput] = await Promise.all([
    readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/OtpCodeInput.tsx', import.meta.url), 'utf8')
  ])

  assert.match(page, /type RecoveryStep = 'email' \| 'code' \| 'password' \| 'success'/)
  assert.match(page, /aria-current=\{stepNumber === activeStep \? 'step'/)
  assert.match(page, /type="email"[\s\S]*?autoComplete="email"[\s\S]*?maxLength=\{320\}/)
  assert.match(page, /<OtpCodeInput[\s\S]*?id="recovery-code"[\s\S]*?ariaLabel="六位验证码"/)
  assert.match(registerPage, /<OtpCodeInput/)
  assert.match(otpInput, /length = EMAIL_OTP_LENGTH/)
  assert.match(otpInput, /inputMode="numeric"/)
  assert.match(otpInput, /autoComplete=\{index === 0 \? 'one-time-code' : 'off'\}/)
  assert.match(otpInput, /pattern="\[0-9\]\*"/)
  assert.match(otpInput, /aria-label=\{`\$\{ariaLabel\}，第 \$\{index \+ 1\} 位，共 \$\{safeLength\} 位`\}/)
  assert.match(otpInput, /event\.key === 'Backspace'/)
  assert.match(otpInput, /getOtpNavigationIndex/)
  assert.doesNotMatch(page, /className="auth-otp-input"/)
  assert.match(page, /请输入邮件中的 6 位数字验证码。/)
  assert.match(page, /isEmailOtpCode\(code\)/)
  assert.match(page, /重新发送（\$\{cooldownLeft\}s）/)
  assert.match(page, /window\.clearInterval\(timer\)/)
  assert.match(page, /emailInputRef\.current\?\.focus\(\)/)
  assert.match(page, /codeInputRef\.current\?\.focus\(\)/)
  assert.match(page, /passwordInputRef\.current\?\.focus\(\)/)
  assert.match(page, /role="alert"/)
  assert.match(page, /role="status"/)
  assert.match(page, /aria-label=\{showPassword \? '隐藏密码' : '显示密码'\}/)
})

test('OTP verification establishes and revalidates a real isolated recovery session before password update', async () => {
  const [page, browserClient] = await Promise.all([
    readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/supabase/browser.ts', import.meta.url), 'utf8')
  ])

  assert.match(page, /createSupabaseBrowserClient\(\{[\s\S]*?isolatedSession: true/)
  assert.match(page, /verifyOtp\(\{[\s\S]*?email:[\s\S]*?token: code,[\s\S]*?type: 'recovery'/)
  assert.match(page, /!data \|\| !data\.session \|\| !data\.user/)
  assert.match(page, /supabase\.auth\.getSession\(\)/)
  assert.match(page, /supabase\.auth\.getUser\(\)/)
  assert.match(page, /currentSession\.access_token !== recoveryIdentity\.accessToken/)
  assert.match(page, /supabase\.auth\.updateUser\(\{ password \}\)/)
  assert.match(page, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
  assert.match(page, /window\.location\.replace\('\/login'\)/)
  assert.match(page, /}, 1200\)/)
  assert.match(browserClient, /createMemoryCookieMethods/)
  assert.match(browserClient, /isSingleton: false/)
  assert.match(browserClient, /detectSessionInUrl: false/)
  assert.doesNotMatch(page, /localStorage|sessionStorage|useSearchParams|exchangeCodeForSession/)
})

test('the send route uses Recovery OTP and contains no legacy link generator or app email sender', async () => {
  const [route, handler, emailSender] = await Promise.all([
    readFile(new URL('../app/api/auth/forgot-password/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/auth/password-recovery-handler.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/email/send-register-code.tsx', import.meta.url), 'utf8')
  ])

  assert.match(route, /resetPasswordForEmail\(email\)/)
  assert.match(handler, /z\.string\(\)\.trim\(\)\.email\(\)\.max\(320\)/)
  assert.doesNotMatch(`${route}\n${handler}`, /admin\.generateLink|action_link|resetUrl|redirectTo|sendPasswordResetEmail/)
  assert.doesNotMatch(emailSender, /PasswordResetEmail|sendPasswordResetEmail|resetUrl/)
})

test('the rolling database limiter stores hashes only and enforces all required windows atomically', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260802184926_password_recovery_request_limits.sql', import.meta.url), 'utf8')

  assert.match(migration, /create table if not exists public\.password_recovery_requests/)
  assert.match(migration, /email_hash text not null/)
  assert.match(migration, /ip_hash text/)
  assert.match(migration, /interval '60 seconds'/)
  assert.match(migration, /v_count >= 5[\s\S]*?interval '1 hour'/)
  assert.match(migration, /v_count >= 12[\s\S]*?interval '1 day'/)
  assert.match(migration, /v_count >= 10[\s\S]*?interval '1 hour'/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.password_recovery_requests from public, anon, authenticated/)
  assert.match(migration, /grant execute[\s\S]*to service_role/)
  assert.doesNotMatch(migration, /\botp\s+text|\bpassword\s+text|recovery_token\s+text|raw_email\s+text/i)
})

test('legacy reset links redirect to the single OTP flow and the Dashboard template uses Token only', async () => {
  const [resetPage, templateDoc, layout, registerEmail, recoveryEmail, previewPage] = await Promise.all([
    readFile(new URL('../app/reset-password/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../docs/supabase-password-recovery-otp-template.md', import.meta.url), 'utf8'),
    readFile(new URL('../emails/AuthCodeEmailLayout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../emails/RegisterVerificationEmail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../emails/PasswordRecoveryCodeEmail.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/dev/email-preview/page.tsx', import.meta.url), 'utf8')
  ])

  assert.match(resetPage, /redirect\('\/forgot-password'\)/)
  assert.doesNotMatch(resetPage, /exchangeCodeForSession|useSearchParams|getSession|updateUser/)
  assert.match(templateDoc, /【空与梦的雅思写作】密码重置验证码/)
  assert.match(templateDoc, /\{\{ \.Token \}\}/)
  const htmlBlock = templateDoc.match(/```html([\s\S]*?)```/)?.[1] || ''
  assert.match(htmlBlock, /\{\{ \.Token \}\}/)
  assert.doesNotMatch(htmlBlock, /ConfirmationURL|href=|重置链接/)
  assert.match(templateDoc, /Email OTP Length[\s\S]*?设置为 `6`/)
  assert.match(templateDoc, /SMTP host/)
  assert.match(templateDoc, /SPF、DKIM 和 DMARC/)
  assert.match(registerEmail, /AuthCodeEmailLayout/)
  assert.match(recoveryEmail, /AuthCodeEmailLayout/)
  assert.match(recoveryEmail, /重置登录密码/)
  assert.match(layout, /maxWidth: '560px'/)
  assert.match(layout, /borderRadius: '24px'/)
  assert.match(layout, /fontSize: '38px'/)
  assert.match(previewPage, /RegisterVerificationEmail code="123456"/)
  assert.match(previewPage, /PasswordRecoveryCodeEmail code="123456"/)
})

test('registration OTP remains separate and tracked production secrets are removed', async () => {
  const [registerRoute, verifyRoute, registerPage, verificationHelpers, gitignore] = await Promise.all([
    readFile(new URL('../app/api/auth/send-register-code/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/verify-register-code/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/auth/email-verification.ts', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8')
  ])

  assert.match(registerRoute, /generateRegisterCode\(\)/)
  assert.match(registerRoute, /hashRegisterCode\(email, code\)/)
  assert.match(registerPage, /\/api\/auth\/verify-register-code/)
  assert.match(registerPage, /OtpCodeInput/)
  assert.match(verifyRoute, /EMAIL_OTP_LENGTH/)
  assert.match(verificationHelpers, /10 \*\* \(EMAIL_OTP_LENGTH - 1\)/)
  assert.doesNotMatch(registerRoute, /type:\s*'recovery'/)
  assert.match(gitignore, /\.env\.\*/)
  await assert.rejects(access(new URL('../.env.production', import.meta.url)))
})
