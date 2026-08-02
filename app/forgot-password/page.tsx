'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, PencilLine, RotateCcw, Send, ShieldCheck } from 'lucide-react'
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader'
import { AuthSpinner, AuthSubmitButton } from '@/components/auth/AuthSubmitButton'
import { isValidEmail, maskEmail, normalizeEmail } from '@/lib/auth/email-utils'
import { toPasswordRecoveryError } from '@/lib/auth/error-messages'
import {
  PASSWORD_RECOVERY_CODE_LENGTH,
  PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_MIN_PASSWORD_LENGTH,
  PASSWORD_RECOVERY_RESEND_SECONDS,
  sanitizePasswordRecoveryCode,
  validateRecoveryPassword
} from '@/lib/auth/password-recovery'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type RecoveryStep = 'email' | 'code' | 'password' | 'success'
type LoadingState = 'send' | 'resend' | 'verify' | 'update' | null

type ForgotResponse = {
  success?: boolean
  message?: string
}

type RecoverySessionIdentity = {
  accessToken: string
  email: string
  userId: string
}

const UNIFORM_SUCCESS_MESSAGE = '如果该邮箱已注册，六位验证码将发送到该邮箱。'

async function postWithTimeout<T>(url: string, payload: unknown, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store'
    })
    const data = (await response.json().catch(() => ({}))) as T
    return { response, data }
  } finally {
    window.clearTimeout(timer)
  }
}

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof DOMException && caught.name === 'AbortError') {
    return '请求超时，请检查网络后重试。'
  }

  if (caught instanceof Error) {
    const mapped = toPasswordRecoveryError(caught.message)
    return mapped === '操作失败，请稍后重试。' ? fallback : mapped
  }

  return fallback
}

export default function ForgotPasswordPage() {
  const [supabase] = useState(() => createSupabaseBrowserClient({
    isolatedSession: true,
    requestTimeoutMs: 15000
  }))
  const emailInputRef = useRef<HTMLInputElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const successRef = useRef<HTMLDivElement>(null)
  const recoverySessionRef = useRef<RecoverySessionIdentity | null>(null)

  const [step, setStep] = useState<RecoveryStep>('email')
  const [emailInput, setEmailInput] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState<LoadingState>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const maskedEmail = useMemo(() => maskEmail(recoveryEmail), [recoveryEmail])
  const cooldownLeft = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      if (step === 'email') emailInputRef.current?.focus()
      if (step === 'code') codeInputRef.current?.focus()
      if (step === 'password') passwordInputRef.current?.focus()
      if (step === 'success') successRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [step])

  useEffect(() => {
    if (step !== 'code' || !cooldownUntil || cooldownUntil <= Date.now()) return undefined

    const timer = window.setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)
      if (nextNow >= cooldownUntil) window.clearInterval(timer)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [cooldownUntil, step])

  useEffect(() => {
    if (step !== 'success') return undefined

    const timer = window.setTimeout(() => {
      window.location.replace('/login')
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [step])

  function clearFeedback() {
    if (error) setError('')
    if (message) setMessage('')
  }

  function beginCooldown() {
    const startedAt = Date.now()
    setNow(startedAt)
    setCooldownUntil(startedAt + PASSWORD_RECOVERY_RESEND_SECONDS * 1000)
  }

  async function sendRecoveryCode(email: string, mode: 'send' | 'resend') {
    if (loading) return false

    setLoading(mode)
    setError('')
    setMessage('')

    try {
      const { response, data } = await postWithTimeout<ForgotResponse>('/api/auth/forgot-password', { email })
      if (!response.ok || !data.success) {
        setError(data.message || '暂时无法发送验证码，请稍后重试。')
        return false
      }

      setCode('')
      beginCooldown()
      setMessage(data.message || UNIFORM_SUCCESS_MESSAGE)
      return true
    } catch (caught) {
      setError(errorMessage(caught, '暂时无法发送验证码，请稍后重试。'))
      return false
    } finally {
      setLoading(null)
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const normalized = normalizeEmail(emailInput)
    if (!normalized || normalized.length > 320 || !isValidEmail(normalized)) {
      setError('请输入有效的邮箱地址。')
      return
    }

    const sent = await sendRecoveryCode(normalized, 'send')
    if (!sent) return

    recoverySessionRef.current = null
    setRecoveryEmail(normalized)
    setEmailInput(normalized)
    setStep('code')
  }

  async function handleResend() {
    if (loading || cooldownLeft > 0 || !recoveryEmail) return
    await sendRecoveryCode(recoveryEmail, 'resend')
  }

  function handleModifyEmail() {
    if (loading) return

    recoverySessionRef.current = null
    setCode('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setCooldownUntil(null)
    setMessage('')
    setError('')
    setRecoveryEmail('')
    setStep('email')
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || code.length !== PASSWORD_RECOVERY_CODE_LENGTH || !recoveryEmail) return

    setLoading('verify')
    setError('')
    setMessage('')
    recoverySessionRef.current = null

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizeEmail(recoveryEmail),
        token: code,
        type: 'recovery'
      })

      if (verifyError) {
        setError(toPasswordRecoveryError(verifyError.message))
        return
      }

      if (!data || !data.session || !data.user) {
        setError('验证状态已失效，请重新获取验证码。')
        return
      }

      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ])
      const currentSession = sessionData.session
      const verifiedUser = userData.user
      const expectedEmail = normalizeEmail(recoveryEmail)

      if (
        sessionError ||
        userError ||
        !currentSession ||
        !verifiedUser ||
        currentSession.access_token !== data.session.access_token ||
        currentSession.user.id !== data.user.id ||
        verifiedUser.id !== data.user.id ||
        normalizeEmail(verifiedUser.email || '') !== expectedEmail
      ) {
        await supabase.auth.signOut({ scope: 'local' })
        setError('验证状态已失效，请重新获取验证码。')
        return
      }

      recoverySessionRef.current = {
        accessToken: currentSession.access_token,
        email: expectedEmail,
        userId: verifiedUser.id
      }
      setCode('')
      setMessage('')
      setStep('password')
    } catch (caught) {
      setError(errorMessage(caught, '验证码不正确或已过期，请重新输入。'))
    } finally {
      setLoading(null)
    }
  }

  async function resetExpiredRecoveryState() {
    recoverySessionRef.current = null
    await supabase.auth.signOut({ scope: 'local' })
    setCode('')
    setPassword('')
    setConfirmPassword('')
    setCooldownUntil(null)
    setMessage('')
    setError('验证状态已失效，请重新获取验证码。')
    setStep('code')
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const validationError = validateRecoveryPassword(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    const recoveryIdentity = recoverySessionRef.current
    if (!recoveryIdentity) {
      await resetExpiredRecoveryState()
      return
    }

    setLoading('update')
    setError('')
    setMessage('')

    try {
      const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser()
      ])
      const currentSession = sessionData.session
      const verifiedUser = userData.user

      if (
        sessionError ||
        userError ||
        !currentSession ||
        !verifiedUser ||
        currentSession.access_token !== recoveryIdentity.accessToken ||
        verifiedUser.id !== recoveryIdentity.userId ||
        normalizeEmail(verifiedUser.email || '') !== recoveryIdentity.email
      ) {
        await resetExpiredRecoveryState()
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(toPasswordRecoveryError(updateError.message))
        return
      }

      setPassword('')
      setConfirmPassword('')
      recoverySessionRef.current = null

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) {
        await supabase.auth.signOut()
      }

      setMessage('密码已修改，请使用新密码登录。')
      setStep('success')
    } catch (caught) {
      setError(errorMessage(caught, '密码修改失败，请稍后重试。'))
    } finally {
      setLoading(null)
    }
  }

  const activeStep = step === 'email' ? 1 : step === 'code' ? 2 : step === 'password' ? 3 : 4

  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <section className="auth-panel auth-panel-modern auth-recovery-panel">
        <AuthBrandHeader />

        {step !== 'success' ? (
          <nav className="auth-stepper" aria-label="密码找回步骤">
            <ol>
              {['验证邮箱', '输入验证码', '设置新密码'].map((label, index) => {
                const stepNumber = index + 1
                return (
                  <li
                    key={label}
                    className={stepNumber === activeStep ? 'is-current' : stepNumber < activeStep ? 'is-complete' : ''}
                    aria-current={stepNumber === activeStep ? 'step' : undefined}
                  >
                    <span aria-hidden="true">{stepNumber}</span>
                    {label}
                  </li>
                )
              })}
            </ol>
          </nav>
        ) : null}

        {step === 'email' ? (
          <>
            <header className="auth-copy">
              <p className="auth-kicker">找回密码</p>
              <h1>验证你的邮箱</h1>
              <p>输入注册邮箱，我们会发送六位验证码。</p>
            </header>

            <form className="auth-form auth-form-modern" onSubmit={handleEmailSubmit}>
              <label htmlFor="recovery-email">
                <span>邮箱</span>
                <div className="auth-input-shell">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    ref={emailInputRef}
                    id="recovery-email"
                    type="email"
                    value={emailInput}
                    onChange={(event) => { setEmailInput(event.target.value); clearFeedback() }}
                    autoComplete="email"
                    maxLength={320}
                    placeholder="name@example.com"
                    disabled={Boolean(loading)}
                    required
                  />
                </div>
              </label>

              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <AuthSubmitButton
                type="submit"
                loading={loading === 'send'}
                loadingLabel="正在发送"
                disabled={Boolean(loading)}
                icon={<Send size={18} aria-hidden="true" />}
              >
                发送验证码
              </AuthSubmitButton>
            </form>

            <p className="auth-switch">
              <a href="/login"><ArrowLeft size={15} aria-hidden="true" /> 返回登录</a>
            </p>
          </>
        ) : null}

        {step === 'code' ? (
          <>
            <header className="auth-copy">
              <p className="auth-kicker">输入验证码</p>
              <h1>验证码已发送</h1>
              <p>请输入发送至 <strong>{maskedEmail}</strong> 的六位验证码。</p>
            </header>

            <form className="auth-form auth-form-modern" onSubmit={handleCodeSubmit}>
              <label htmlFor="recovery-code">
                <span>六位验证码</span>
                <div className="auth-input-shell">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <input
                    ref={codeInputRef}
                    id="recovery-code"
                    className="auth-otp-input"
                    type="text"
                    value={code}
                    onChange={(event) => { setCode(sanitizePasswordRecoveryCode(event.target.value)); clearFeedback() }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={PASSWORD_RECOVERY_CODE_LENGTH}
                    aria-describedby="recovery-code-hint"
                    disabled={Boolean(loading)}
                    required
                  />
                </div>
              </label>
              <p id="recovery-code-hint" className="auth-field-hint">只输入邮件中的 6 位数字验证码。</p>

              <div className="code-meta">
                <span><Mail size={15} aria-hidden="true" />{maskedEmail}</span>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={Boolean(loading) || cooldownLeft > 0}
                  aria-live="polite"
                >
                  {loading === 'resend' ? <AuthSpinner size={15} /> : <RotateCcw size={15} aria-hidden="true" />}
                  {loading === 'resend'
                    ? '正在重新发送'
                    : cooldownLeft > 0
                      ? `重新发送（${cooldownLeft}s）`
                      : '重新发送验证码'}
                </button>
              </div>

              {message ? <p className="auth-success" role="status">{message}</p> : null}
              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <AuthSubmitButton
                type="submit"
                loading={loading === 'verify'}
                loadingLabel="正在验证"
                disabled={Boolean(loading) || code.length !== PASSWORD_RECOVERY_CODE_LENGTH}
                icon={<ShieldCheck size={18} aria-hidden="true" />}
              >
                验证验证码
              </AuthSubmitButton>

              <div className="auth-secondary-actions">
                <button type="button" onClick={handleModifyEmail} disabled={Boolean(loading)}>
                  <PencilLine size={16} aria-hidden="true" />
                  修改邮箱
                </button>
              </div>
            </form>
          </>
        ) : null}

        {step === 'password' ? (
          <>
            <header className="auth-copy">
              <p className="auth-kicker">设置新密码</p>
              <h1>邮箱验证成功</h1>
              <p>请输入并确认你的新密码。</p>
            </header>

            <form className="auth-form auth-form-modern" onSubmit={handlePasswordSubmit}>
              <label htmlFor="recovery-password">
                <span>新密码</span>
                <div className="auth-input-shell">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    ref={passwordInputRef}
                    id="recovery-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); clearFeedback() }}
                    autoComplete="new-password"
                    minLength={PASSWORD_RECOVERY_MIN_PASSWORD_LENGTH}
                    maxLength={PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH}
                    disabled={Boolean(loading)}
                    required
                  />
                  <button
                    className="auth-icon-button"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={Boolean(loading)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </label>

              <label htmlFor="recovery-password-confirmation">
                <span>确认新密码</span>
                <input
                  id="recovery-password-confirmation"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => { setConfirmPassword(event.target.value); clearFeedback() }}
                  autoComplete="new-password"
                  minLength={PASSWORD_RECOVERY_MIN_PASSWORD_LENGTH}
                  maxLength={PASSWORD_RECOVERY_MAX_PASSWORD_LENGTH}
                  disabled={Boolean(loading)}
                  required
                />
              </label>

              <p className="auth-field-hint">密码长度为 8–128 位，输入内容不会被自动修改。</p>
              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <AuthSubmitButton
                type="submit"
                loading={loading === 'update'}
                loadingLabel="正在修改密码"
                disabled={Boolean(loading)}
                icon={<CheckCircle2 size={18} aria-hidden="true" />}
              >
                确认修改密码
              </AuthSubmitButton>
            </form>
          </>
        ) : null}

        {step === 'success' ? (
          <div ref={successRef} className="auth-success-state" role="status" tabIndex={-1}>
            <span className="auth-success-orb"><CheckCircle2 size={34} aria-hidden="true" /></span>
            <p className="auth-kicker">密码修改成功</p>
            <h1>密码修改成功</h1>
            <p>请使用新密码重新登录。</p>
            <p className="auth-field-hint">正在前往登录页…</p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
