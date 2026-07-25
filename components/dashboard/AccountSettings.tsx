'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MaterialIcon } from '@/components/app-ui'
import { getAvatarInitial } from '@/lib/user-profile'
import { useUserProfile } from '@/stores/user-profile-store'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { LogoutButton } from '@/app/dashboard/LogoutButton'

const NICKNAME_MAX = 20
const DEFAULT_NICKNAME = '雅思追梦人'
const AVERAGE_SCORE_OPTIONS = Array.from({ length: 19 }, (_, index) => index / 2)

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
  const {
    displayName,
    email,
    manualAverageScore,
    displayNameLoading,
    updateDisplayName,
    updateManualAverageScore
  } = useUserProfile()
  const [editing, setEditing] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingAverage, setEditingAverage] = useState(false)
  const [averageInput, setAverageInput] = useState('auto')
  const [averageSaving, setAverageSaving] = useState(false)
  const [averageError, setAverageError] = useState<string | null>(null)
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

  const startAverageEditing = useCallback(() => {
    setAverageInput(manualAverageScore === null ? 'auto' : String(manualAverageScore))
    setAverageError(null)
    setEditingAverage(true)
  }, [manualAverageScore])

  const saveAverage = useCallback(async () => {
    if (averageSaving) return
    const next = averageInput === 'auto' ? null : Number(averageInput)
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 9 || !Number.isInteger(next * 2))) {
      setAverageError('请选择 0 到 9 之间的 0.5 分档')
      return
    }
    setAverageSaving(true)
    setAverageError(null)
    try {
      await updateManualAverageScore(next)
      setEditingAverage(false)
    } catch (err) {
      setAverageError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setAverageSaving(false)
    }
  }, [averageInput, averageSaving, updateManualAverageScore])

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

      <div className="account-average-setting">
        <div className="account-average-copy">
          <span className="account-setting-icon">
            <MaterialIcon name="monitoring" size={20} />
          </span>
          <div>
            <strong>学习分析平均分</strong>
            <p>
              {manualAverageScore === null
                ? '当前按真实批改记录自动计算'
                : `当前手动设为 ${manualAverageScore.toFixed(1)} 分`}
            </p>
          </div>
        </div>

        {editingAverage ? (
          <div className="account-average-editor">
            <label htmlFor="manual-average-score">平均分显示方式</label>
            <select
              id="manual-average-score"
              value={averageInput}
              disabled={averageSaving}
              onChange={(event) => {
                setAverageInput(event.target.value)
                setAverageError(null)
              }}
            >
              <option value="auto">自动（跟随真实批改）</option>
              {AVERAGE_SCORE_OPTIONS.map((score) => (
                <option key={score} value={String(score)}>{score.toFixed(1)} 分</option>
              ))}
            </select>
            {averageError ? <span className="account-setting-error" role="alert">{averageError}</span> : null}
            <div className="account-average-actions">
              <button
                className="ui-secondary-button"
                type="button"
                disabled={averageSaving}
                onClick={() => {
                  setEditingAverage(false)
                  setAverageError(null)
                }}
              >
                取消
              </button>
              <button className="ui-primary-button" type="button" disabled={averageSaving} onClick={() => void saveAverage()}>
                {averageSaving ? '同步中…' : '保存并同步'}
              </button>
            </div>
          </div>
        ) : (
          <button className="ui-secondary-button" type="button" onClick={startAverageEditing}>
            <MaterialIcon name="tune" size={16} />
            调整平均分
          </button>
        )}
      </div>

      <p className="account-average-note">
        手动分数会同步到当前账号的学习分析；恢复“自动”后，将重新使用批改记录计算。
      </p>

      <div style={{ borderTop: '1px solid var(--glass-border-1)', margin: '16px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <LogoutButton />
      </div>
    </section>
  )
}
