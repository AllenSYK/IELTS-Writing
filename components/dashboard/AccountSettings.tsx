'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

export function AccountSettings() {
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

  if (!userId) return null

  return (
    <section className="dashboard-panel dashboard-license-panel">
      <h2>账号设置</h2>
      <div className="settings-account-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="settings-avatar" aria-label={`头像：${avatarInitial}`} style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-container-low)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, flexShrink: 0
        }}>
          <span>{avatarInitial}</span>
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {displayNameLoading && !editing ? (
            <div style={{ height: 20, width: 120, borderRadius: 4, background: 'var(--surface-container-low)' }} />
          ) : editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                ref={inputRef}
                value={nicknameInput}
                onChange={(e) => { setNicknameInput(e.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
                maxLength={NICKNAME_MAX + 5}
                placeholder="输入昵称"
                aria-invalid={!!error}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--glass-border-1)', maxWidth: 280, fontSize: 14 }}
              />
              {error && <span style={{ color: 'var(--error)', fontSize: 12 }} role="alert">{error}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ui-secondary-button" type="button" onClick={cancelEditing} disabled={saving} style={{ fontSize: 12, padding: '4px 12px' }}>
                  取消
                </button>
                <button className="ui-primary-button" type="button" onClick={() => void handleSave()} disabled={saving || nicknameInput.trim() === display} style={{ fontSize: 12, padding: '4px 12px' }}>
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{display}</span>
                <button className="settings-edit-btn" type="button" onClick={startEditing} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: 0 }}>
                  <MaterialIcon name="edit" size={15} />
                  <span>修改</span>
                </button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }} title={emailDisplay}>
                {emailDisplay}
              </p>
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--glass-border-1)', margin: '16px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <LogoutButton />
      </div>
    </section>
  )
}
