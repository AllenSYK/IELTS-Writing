'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { createSingleFlight } from '@/lib/web-license/single-flight'
import { accountDisplayName } from '@/lib/phone-auth'

type ActivateResponse = {
  success: boolean
  code?: string
  message?: string
  expiresAt?: string
  plan?: string
}

export default function ActivatePage() {
  const router = useRouter()
  const [accountLabel, setAccountLabel] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const runActivation = useRef(createSingleFlight()).current

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login')
        return
      }
      setAccountLabel(accountDisplayName(data.user))
      setChecking(false)
    }).catch(() => {
      setError('无法读取登录状态，请重新登录。')
      setChecking(false)
    })
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return

    await runActivation(async () => {
      setLoading(true)
      setError('')
      setMessage('')

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 12000)
      try {
        const response = await fetch('/api/license/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: controller.signal
        })
        const data = (await response.json().catch(() => ({}))) as ActivateResponse
        if (!response.ok || !data.success) {
          setError(data.message || '激活码无效。')
          return
        }
        setMessage(`激活成功，到期时间：${data.expiresAt ? new Date(data.expiresAt).toLocaleString('zh-CN') : '未知'}`)
        window.setTimeout(() => router.replace('/dashboard'), 700)
      } catch (caught) {
        setError(caught instanceof DOMException && caught.name === 'AbortError' ? '激活请求超时，请重试。' : '激活失败，请稍后重试。')
      } finally {
        window.clearTimeout(timer)
        setLoading(false)
      }
    })
  }

  return (
    <main className="auth-page" data-main-content tabIndex={-1}>
      <section className="auth-panel">
        <div className="auth-heading">
          <span className="auth-icon"><KeyRound size={22} /></span>
          <div>
            <p className="ui-label">{checking ? '正在读取登录状态' : accountLabel}</p>
            <h1>输入账号激活码</h1>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} aria-busy={loading}>
          <label>
            <span>账号激活码</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="IELTS-ABCD-EFGH-1234" autoCapitalize="characters" required disabled={checking} />
          </label>
          {message ? <p className="auth-success" role="status"><CheckCircle2 size={16} />{message}</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="ui-primary-button auth-submit" type="submit" disabled={loading || checking}>
            {loading ? <Loader2 className="admin-spin" size={18} /> : <KeyRound size={18} />}
            激活
          </button>
        </form>
      </section>
    </main>
  )
}
