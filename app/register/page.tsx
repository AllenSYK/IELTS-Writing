'use client'

import Link from 'next/link'
import { FormEvent, KeyboardEvent, ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, Mail, PencilLine, RotateCcw, ShieldCheck, UserPlus } from 'lucide-react'

type SendCodeResponse = {
  success?: boolean
  message?: string
  maskedEmail?: string
  expiresAt?: string
  cooldownSeconds?: number
}

type VerifyCodeResponse = {
  success?: boolean
  message?: string
  registrationToken?: string
}

type RegisterResponse = {
  success?: boolean
  message?: string
}

type RegisterStep = 'account' | 'code' | 'success'
type LoadingState = 'send' | 'verify' | 'resend' | 'invalidate' | null

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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export default function RegisterPage() {
  const router = useRouter()
  const codeRefs = useRef<Array<HTMLInputElement | null>>([])
  const [step, setStep] = useState<RegisterStep>('account')
  const [email, setEmail] = useState('')
  const [codeEmail, setCodeEmail] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState<LoadingState>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const passwordChecks = useMemo(() => [
    { label: '至少 8 位', ok: password.length >= 8 },
    { label: '包含字母', ok: /[A-Za-z]/.test(password) },
    { label: '包含数字或符号', ok: /[\d\W_]/.test(password) }
  ], [password])

  const passwordScore = passwordChecks.filter((item) => item.ok).length
  const codeValue = digits.join('')
  const cooldownLeft = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0
  const validLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0

  useEffect(() => {
    if (step !== 'code') return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [step])

  useEffect(() => {
    if (step !== 'success') return undefined
    const timer = window.setTimeout(() => router.replace('/login'), 2000)
    return () => window.clearTimeout(timer)
  }, [router, step])

  function validateAccount() {
    const normalized = normalizeEmail(email)
    if (!isEmail(normalized)) return '请输入有效的邮箱地址'
    if (password.length < 8) return '密码至少需要 8 位'
    if (password !== confirmPassword) return '两次输入的密码不一致'
    return ''
  }

  async function sendCode(mode: 'send' | 'resend') {
    if (loading) return
    const validationError = validateAccount()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(mode)
    setError('')
    setMessage('')

    try {
      const normalized = normalizeEmail(email)
      const { response, data } = await postWithTimeout<SendCodeResponse>('/api/auth/send-register-code', {
        email: normalized,
        previousEmail: codeEmail && codeEmail !== normalized ? codeEmail : undefined
      })

      if (!response.ok || !data.success) {
        setError(data.message || '验证码发送失败，请稍后重试')
        return
      }

      setCodeEmail(normalized)
      setMaskedEmail(data.maskedEmail || normalized)
      setDigits(['', '', '', '', '', ''])
      setExpiresAt(data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 10 * 60 * 1000)
      setCooldownUntil(Date.now() + (data.cooldownSeconds || 60) * 1000)
      setStep('code')
      setMessage('邮箱验证码已发送')
      window.setTimeout(() => codeRefs.current[0]?.focus(), 80)
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '请求超时，请检查网络后重试。' : '验证码发送失败，请稍后重试')
    } finally {
      setLoading(null)
    }
  }

  async function invalidateAndReturn() {
    if (!codeEmail) {
      setStep('account')
      return
    }

    setLoading('invalidate')
    setError('')
    setMessage('')

    try {
      const { response, data } = await postWithTimeout<SendCodeResponse>('/api/auth/send-register-code', {
        email: codeEmail,
        invalidateOnly: true
      })

      if (!response.ok || !data.success) {
        setError(data.message || '无法作废当前验证码，请稍后重试')
        return
      }

      setDigits(['', '', '', '', '', ''])
      setExpiresAt(null)
      setCooldownUntil(null)
      setCodeEmail('')
      setMaskedEmail('')
      setStep('account')
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '请求超时，请检查网络后重试。' : '无法作废当前验证码，请稍后重试')
    } finally {
      setLoading(null)
    }
  }

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendCode('send')
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (codeValue.length !== 6) {
      setError('请输入 6 位邮箱验证码')
      return
    }

    setLoading('verify')
    setError('')
    setMessage('')

    try {
      const { response: verifyResponse, data: verifyData } = await postWithTimeout<VerifyCodeResponse>('/api/auth/verify-register-code', {
        email: codeEmail,
        code: codeValue
      })

      if (!verifyResponse.ok || !verifyData.success || !verifyData.registrationToken) {
        setError(verifyData.message || '验证码错误')
        return
      }

      const { response: registerResponse, data: registerData } = await postWithTimeout<RegisterResponse>('/api/auth/register', {
        email: codeEmail,
        password,
        registrationToken: verifyData.registrationToken
      })

      if (!registerResponse.ok || !registerData.success) {
        setError(registerData.message || '账号创建失败，请稍后重试')
        return
      }

      setStep('success')
      setMessage(registerData.message || '账号已创建，现在可以登录。')
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === 'AbortError' ? '请求超时，请检查网络后重试。' : '注册失败，请稍后重试')
    } finally {
      setLoading(null)
    }
  }

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)))
    if (digit && index < 5) {
      window.setTimeout(() => codeRefs.current[index + 1]?.focus(), 0)
    }
  }

  function handleCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length < 2) return
    event.preventDefault()
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] || ''))
    window.setTimeout(() => codeRefs.current[Math.min(5, pasted.length - 1)]?.focus(), 0)
  }

  function handleCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      codeRefs.current[index - 1]?.focus()
    }
  }

  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <section className="auth-panel auth-panel-modern auth-register-panel">
        {step === 'success' ? (
          <div className="auth-success-state">
            <span className="auth-success-orb"><CheckCircle2 size={34} /></span>
            <p className="auth-kicker">邮箱验证成功</p>
            <h1>您的账号已创建</h1>
            <p>{message || '现在可以登录，并使用软件激活码开通网站使用权限。'}</p>
            <Link className="stitch-primary-button auth-main-button" href="/login">前往登录</Link>
          </div>
        ) : null}

        {step === 'account' ? (
          <>
            <div className="auth-brand-mark" aria-hidden="true"><span>W</span></div>
            <header className="auth-copy">
              <p className="auth-kicker">创建账号</p>
              <h1>注册 IELTS Writing</h1>
              <p>先验证邮箱，再创建账号；注册后需要输入软件激活码开通使用权限。</p>
            </header>

            <form className="auth-form auth-form-modern" onSubmit={handleAccountSubmit}>
              <label>
                <span>邮箱</span>
                <div className="auth-input-shell">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </label>

              <label>
                <span>密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="至少 8 位"
                  required
                />
              </label>

              <div className="password-strength" data-score={passwordScore}>
                <div className="password-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="password-checks">
                  {passwordChecks.map((item) => (
                    <span key={item.label} className={item.ok ? 'is-ok' : ''}>{item.label}</span>
                  ))}
                </div>
              </div>

              <label>
                <span>确认密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="再次输入密码"
                  required
                />
              </label>

              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <button className="stitch-primary-button auth-submit auth-main-button" type="submit" disabled={Boolean(loading)}>
                {loading === 'send' ? <Loader2 className="admin-spin" size={18} /> : <UserPlus size={18} />}
                {loading === 'send' ? '正在发送' : '发送邮箱验证码'}
              </button>
            </form>

            <p className="auth-switch">
              已有账号？<Link href="/login">登录</Link>
            </p>
          </>
        ) : null}

        {step === 'code' ? (
          <>
            <header className="auth-copy">
              <p className="auth-kicker">邮箱验证码</p>
              <h1>输入 6 位验证码</h1>
              <p>验证码已发送至 <strong>{maskedEmail}</strong></p>
            </header>

            <form className="auth-form auth-form-modern" onSubmit={handleVerifySubmit}>
              <div className="code-input-grid" role="group" aria-label="6 位邮箱验证码">
                {digits.map((digit, index) => (
                  <input
                    key={String(index)}
                    ref={(node) => {
                      codeRefs.current[index] = node
                    }}
                    value={digit}
                    onChange={(event) => updateDigit(index, event.target.value)}
                    onPaste={handleCodePaste}
                    onKeyDown={(event) => handleCodeKeyDown(index, event)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    aria-label={`第 ${index + 1} 位验证码`}
                  />
                ))}
              </div>

              <div className="code-meta">
                <span><ShieldCheck size={15} />剩余有效时间 {formatSeconds(validLeft)}</span>
                <button type="button" onClick={() => sendCode('resend')} disabled={Boolean(loading) || cooldownLeft > 0}>
                  <RotateCcw size={15} />
                  {cooldownLeft > 0 ? `${cooldownLeft} 秒后重新发送` : '重新发送'}
                </button>
              </div>

              {message ? <p className="auth-success" role="status">{message}</p> : null}
              {error ? <p className="auth-error" role="alert">{error}</p> : null}

              <button className="stitch-primary-button auth-submit auth-main-button" type="submit" disabled={Boolean(loading) || codeValue.length !== 6 || validLeft <= 0}>
                {loading === 'verify' ? <Loader2 className="admin-spin" size={18} /> : <ShieldCheck size={18} />}
                {loading === 'verify' ? '正在创建账号' : '验证并创建账号'}
              </button>

              <div className="auth-secondary-actions">
                <button type="button" onClick={invalidateAndReturn} disabled={Boolean(loading)}>
                  <PencilLine size={16} />
                  修改邮箱
                </button>
                <button type="button" onClick={invalidateAndReturn} disabled={Boolean(loading)}>
                  <ArrowLeft size={16} />
                  返回上一步
                </button>
              </div>
            </form>

            <p className="auth-switch">
              邮箱验证码只用于注册验证，软件激活码会在登录后单独输入。
            </p>
          </>
        ) : null}
      </section>
    </main>
  )
}
