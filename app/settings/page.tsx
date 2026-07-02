'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MaterialIcon } from '@/components/app-ui'
import { getAvatarInitial } from '@/lib/user-profile'
import { useUserProfile } from '@/stores/user-profile-store'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { LogoutButton } from '@/app/dashboard/LogoutButton'

const NICKNAME_MAX = 20
const DEFAULT_NICKNAME = '雅思追梦人'

function validateNickname(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return '昵称不能为空'
  if (trimmed.length > NICKNAME_MAX) return `昵称不能超过 ${NICKNAME_MAX} 个字符`
  if (/\n|\r/.test(trimmed)) return '昵称不能包含换行'
  if (/<[^>]/.test(trimmed)) return '昵称不能包含 HTML'
  return null
}

export default function SettingsPage() {
  const { userId, accountLabel } = useUserSession()
  const { displayName, email, displayNameLoading, updateDisplayName } = useUserProfile()
  const [editing, setEditing] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const display = displayName || DEFAULT_NICKNAME
  const avatarInitial = getAvatarInitial(display)
  const emailDisplay = email || accountLabel || '—'

  const startEditing = useCallback(() => {
    setNicknameInput(display)
    setError(null)
    setEditing(true)
  }, [display])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const cancelEditing = useCallback(() => {
    setEditing(false)
    setNicknameInput('')
    setError(null)
  }, [])

  const handleSave = useCallback(async () => {
    if (saving) return
    const trimmed = nicknameInput.trim()
    const validationError = validateNickname(trimmed)
    if (validationError) {
      setError(validationError)
      return
    }
    if (trimmed === display) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateDisplayName(trimmed)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }, [nicknameInput, display, updateDisplayName, saving])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancelEditing()
    if (e.key === 'Enter') { e.preventDefault(); void handleSave() }
  }, [cancelEditing, handleSave])

  if (!userId) {
    return (
      <main className="settings-page" data-main-content tabIndex={-1}>
        <section className="settings-main">
          <div className="settings-account-card settings-skeleton" />
        </section>
      </main>
    )
  }

  return (
    <main className="settings-page" data-main-content tabIndex={-1}>
      <section className="settings-main">
        <div className="settings-account-card">
          <div className="settings-account-row">
            <span className="settings-avatar" aria-label={`头像：${avatarInitial}`}>
              <span>{avatarInitial}</span>
            </span>

            <div className="settings-account-info">
              {displayNameLoading && !editing ? (
                <div className="settings-nickname-skeleton" />
              ) : editing ? (
                <div className="settings-nickname-edit">
                  <input
                    ref={inputRef}
                    className="settings-nickname-input"
                    value={nicknameInput}
                    onChange={(e) => { setNicknameInput(e.target.value); setError(null) }}
                    onKeyDown={handleKeyDown}
                    maxLength={NICKNAME_MAX + 5}
                    placeholder="输入昵称"
                    aria-invalid={!!error}
                  />
                  {error && <span className="settings-nickname-error" role="alert">{error}</span>}
                  <div className="settings-nickname-actions">
                    <button
                      className="settings-nickname-btn settings-nickname-cancel"
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                    >
                      取消
                    </button>
                    <button
                      className="settings-nickname-btn settings-nickname-save"
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || nicknameInput.trim() === display}
                    >
                      {saving ? '保存中…' : '保存'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="settings-display-name-row">
                    <span className="settings-display-name">{display}</span>
                    <button
                      className="settings-edit-btn"
                      type="button"
                      onClick={startEditing}
                    >
                      <MaterialIcon name="edit" size={15} />
                      <span>修改</span>
                    </button>
                  </div>
                  <p className="settings-email" title={emailDisplay}>
                    {emailDisplay}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="settings-divider" />

          <div className="settings-logout-row">
            <LogoutButton />
          </div>
        </div>

        <footer className="settings-footer">
          <Link href="/terms">服务条款</Link>
          <span className="settings-footer-dot">·</span>
          <Link href="/privacy">隐私政策</Link>
        </footer>
      </section>
    </main>
  )
}
