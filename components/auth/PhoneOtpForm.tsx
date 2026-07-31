'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquareText, Phone, RotateCcw, ShieldCheck } from 'lucide-react'
import { AgreementConsent } from '@/components/auth/AgreementConsent'
import { AuthSubmitButton } from '@/components/auth/AuthSubmitButton'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { CurrentAgreementVersions } from '@/lib/legal-agreements'
import { maskPhone, normalizeMainlandPhone } from '@/lib/phone-auth'
import { createSingleFlight } from '@/lib/web-license/single-flight'

type PhoneStep = 'phone' | 'code'

async function postJson<T>(url: string, body: unknown) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store'
    })
    return { response, data: await response.json().catch(() => ({})) as T }
  } finally {
    window.clearTimeout(timeout)
  }
}

export function PhoneOtpForm({ mode }: { mode: 'login' | 'register' }) {
  const { refreshUser } = useUserSession()
  const sendSingleFlight = useRef(createSingleFlight()).current
  const verifySingleFlight = useRef(createSingleFlight()).current
  const [step, setStep] = useState<PhoneStep>('phone')
  const [phone, setPhone] = useState('')
  const [normalizedPhone, setNormalizedPhone] = useState('')
  const [code, setCode] = useState('')
  const [agreementsAccepted, setAgreementsAccepted] = useState(false)
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState<'send' | 'verify' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (resendAvailableAt === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt])

  const cooldownLeft = resendAvailableAt !== null ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0

  async function sendCode() {
    if (!agreementsAccepted) {
      setError('请先阅读并同意《服务条款》和《隐私政策》')
      return
    }
    if (cooldownLeft > 0) return

    await sendSingleFlight(async () => {
      setLoading('send')
      setError('')
      setMessage('')
      try {
        const normalized = normalizeMainlandPhone(phone)
        const { response, data } = await postJson<{
          success?: boolean
          message?: string
          maskedPhone?: string
          cooldownSeconds?: number
        }>('/api/auth/phone/send', {
          phone: normalized,
          mode,
          agreementsAccepted,
          agreementVersions: CurrentAgreementVersions
        })
        if (!response.ok || !data.success) throw new Error(data.message || '验证码发送失败')
        setNormalizedPhone(normalized)
        setStep('code')
        setCode('')
        setResendAvailableAt(Date.now() + (data.cooldownSeconds || 60) * 1000)
        setMessage(`验证码已发送至 ${data.maskedPhone || maskPhone(normalized)}`)
      } catch (caught) {
        setError(caught instanceof DOMException && caught.name === 'AbortError'
          ? '请求超时，请检查网络后重试。'
          : caught instanceof Error ? caught.message : '验证码发送失败')
      } finally {
        setLoading(null)
      }
    })
  }

  async function verifyCode() {
    if (code.length !== 6 || !agreementsAccepted) return
    await verifySingleFlight(async () => {
      setLoading('verify')
      setError('')
      try {
        const { response, data } = await postJson<{
          success?: boolean
          message?: string
          redirectTo?: string
        }>('/api/auth/phone/verify', {
          phone: normalizedPhone,
          code,
          mode,
          agreementsAccepted,
          agreementVersions: CurrentAgreementVersions
        })
        if (!response.ok || !data.success) throw new Error(data.message || '验证码错误')
        await refreshUser()
        window.location.replace(data.redirectTo || '/activate')
      } catch (caught) {
        setError(caught instanceof DOMException && caught.name === 'AbortError'
          ? '请求超时，请检查网络后重试。'
          : caught instanceof Error ? caught.message : '手机号验证失败')
      } finally {
        setLoading(null)
      }
    })
  }

  if (step === 'code') {
    return (
      <div className="auth-form auth-form-modern">
        <div className="phone-code-copy">
          <span><MessageSquareText size={18} /></span>
          <div>
            <strong>输入短信验证码</strong>
            <p>{message || `验证码已发送至 ${maskPhone(normalizedPhone)}`}</p>
          </div>
        </div>

        <label>
          <span>6 位验证码</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            placeholder="000000"
            className="phone-code-input"
          />
        </label>

        <AgreementConsent checked={agreementsAccepted} disabled={Boolean(loading)} onChange={setAgreementsAccepted} />
        {error ? <p className="auth-error" role="alert">{error}</p> : null}

        <AuthSubmitButton
          type="button"
          disabled={Boolean(loading) || code.length !== 6 || !agreementsAccepted}
          loading={loading === 'verify'}
          loadingLabel="正在验证"
          icon={<ShieldCheck size={18} aria-hidden="true" />}
          onClick={() => void verifyCode()}
        >
          {mode === 'register' ? '验证并创建账号' : '验证并登录'}
        </AuthSubmitButton>

        <div className="auth-secondary-actions">
          <button type="button" disabled={Boolean(loading)} onClick={() => {
            setStep('phone')
            setCode('')
            setError('')
            setResendAvailableAt(null)
          }}>
            <ArrowLeft size={16} />
            修改手机号
          </button>
          <button type="button" disabled={Boolean(loading) || cooldownLeft > 0} onClick={() => void sendCode()}>
            <RotateCcw size={16} />
            {cooldownLeft > 0 ? `${cooldownLeft} 秒后重发` : '重新发送验证码'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-form auth-form-modern">
      <label>
        <span>手机号</span>
        <div className="phone-input-row">
          <span className="phone-country-code">+86</span>
          <div className="auth-input-shell">
            <Phone size={18} aria-hidden="true" />
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel-national"
              inputMode="tel"
              placeholder="138 1234 5678"
            />
          </div>
        </div>
      </label>

      <AgreementConsent checked={agreementsAccepted} disabled={Boolean(loading)} onChange={setAgreementsAccepted} />
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <AuthSubmitButton
        type="button"
        disabled={Boolean(loading) || !agreementsAccepted || phone.trim().length < 11}
        loading={loading === 'send'}
        loadingLabel="正在发送"
        icon={<MessageSquareText size={18} aria-hidden="true" />}
        onClick={() => void sendCode()}
      >
        发送短信验证码
      </AuthSubmitButton>
    </div>
  )
}
