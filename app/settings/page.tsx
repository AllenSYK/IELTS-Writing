'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { AsyncButton, ConfirmDialog, useMotionPreference, useToast } from '@/components/interaction-system'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'
import { LogoutButton } from '@/app/dashboard/LogoutButton'
import {
  EnglishLevelLabels,
  IELTS_BAND_OPTIONS,
  StudyPreferenceLabels,
  StudyPreferenceOptions,
  formatBandOption,
  hasProfileErrors,
  normalizeUserProfile,
  validateUserProfile,
  type StudyPreference,
  type UserProfile
} from '@/lib/user-profile'
import { useUserProfile } from '@/stores/user-profile-store'
import { useUserSession } from '@/components/auth/UserSessionProvider'
import { belongsToUserStorageKey, removeStorageValue } from '@/lib/user-storage'

type LicenseInfo = {
  status: 'loading' | 'active' | 'inactive' | 'error'
  plan?: string
  expiresAt?: string
  lastUsedAt?: string
}

type ProfileSaveStatus = 'clean' | 'dirty' | 'saving' | 'success' | 'error'

function formatDateTime(value?: string | null) {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN')
}

export default function SettingsPage() {
  const { userId, accountLabel } = useUserSession()
  const { pushToast } = useToast()
  const motion = useMotionPreference()
  const { profile, saveProfile } = useUserProfile()
  const [draftProfile, setDraftProfile] = useState<UserProfile>(() => profile)
  const [profileSaveStatus, setProfileSaveStatus] = useState<ProfileSaveStatus>('clean')
  const [attemptedProfileSave, setAttemptedProfileSave] = useState(false)
  const [license, setLicense] = useState<LicenseInfo>({ status: 'active' })
  const [refreshingLicense, setRefreshingLicense] = useState(false)
  const [confirmResetLayout, setConfirmResetLayout] = useState(false)

  const profileErrors = useMemo(() => validateUserProfile(draftProfile), [draftProfile])
  const profileHasErrors = hasProfileErrors(profileErrors)
  const profileDirty = useMemo(
    () => JSON.stringify(normalizeUserProfile(draftProfile)) !== JSON.stringify(normalizeUserProfile(profile)),
    [draftProfile, profile]
  )

  useEffect(() => {
    if (!profileDirty && profileSaveStatus !== 'saving' && profileSaveStatus !== 'success') {
      window.queueMicrotask(() => {
        setDraftProfile(profile)
        setProfileSaveStatus('clean')
      })
    }
  }, [profile, profileDirty, profileSaveStatus])

  useEffect(() => {
    if (profileSaveStatus === 'saving') return
    if (profileDirty) {
      window.queueMicrotask(() => setProfileSaveStatus((current) => (current === 'error' ? 'error' : 'dirty')))
    } else if (profileSaveStatus === 'dirty') {
      window.queueMicrotask(() => setProfileSaveStatus('clean'))
    }
  }, [profileDirty, profileSaveStatus])

  const refreshLicense = useCallback(async (showResult = true) => {
    setRefreshingLicense(true)
    try {
      const response = await fetch('/api/license/status', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      setLicense({
        status: data.licenseActive ? 'active' : 'inactive',
        plan: data.license?.plan,
        expiresAt: data.activation?.expires_at,
        lastUsedAt: data.activation?.last_used_at
      })
      if (showResult) pushToast({ kind: 'success', title: '授权状态已刷新' })
    } catch {
      setLicense({ status: 'error' })
      if (showResult) pushToast({ kind: 'error', title: '授权状态读取失败', message: '请稍后重试。' })
    } finally {
      setRefreshingLicense(false)
    }
  }, [pushToast])

  function resetLayout() {
    if (!userId) return
    Object.keys(window.localStorage)
      .filter((key) => belongsToUserStorageKey(key, userId) && (
        key.startsWith('ielts-writing-editor-position-') ||
        key.startsWith('ielts-writing-editor-split-') ||
        key.startsWith('ielts-writing-history-filters-v1')
      ))
      .forEach((key) => removeStorageValue(window.localStorage, key))
    Object.keys(window.sessionStorage)
      .filter((key) => belongsToUserStorageKey(key, userId) && key.startsWith('ielts-writing-scroll:'))
      .forEach((key) => removeStorageValue(window.sessionStorage, key))
    setConfirmResetLayout(false)
    pushToast({ kind: 'success', title: '布局已重置', message: '作文历史和草稿未被清除。' })
  }

  function updateProfileField<Key extends keyof UserProfile>(key: Key, value: UserProfile[Key]) {
    setDraftProfile((current) => ({ ...current, [key]: value }))
  }

  function togglePreference(preference: StudyPreference) {
    setDraftProfile((current) => {
      const selected = new Set(current.studyPreferences)
      if (selected.has(preference)) selected.delete(preference)
      else selected.add(preference)
      return { ...current, studyPreferences: Array.from(selected) }
    })
  }

  async function savePersonalProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttemptedProfileSave(true)
    if (profileHasErrors) {
      setProfileSaveStatus('error')
      pushToast({ kind: 'error', title: '个人资料未保存', message: '请先修正表单中的提示。' })
      return
    }

    setProfileSaveStatus('saving')
    try {
      const saved = await saveProfile(draftProfile)
      setDraftProfile(saved)
      setProfileSaveStatus('success')
      setAttemptedProfileSave(false)
      pushToast({ kind: 'success', title: '个人资料已保存', message: '头像、目标分和分析页已同步更新。' })
      window.setTimeout(() => setProfileSaveStatus('clean'), 1600)
    } catch (error) {
      setProfileSaveStatus('error')
      pushToast({ kind: 'error', title: '保存失败', message: error instanceof Error ? error.message : '请稍后重试。' })
    }
  }

  return (
    <main className="settings-page" data-main-content tabIndex={-1}>
      <section className="settings-main">
        <GlassPanel className="settings-profile-card ui-hover-glow">
          <div className="settings-profile-identity">
            <ProfileAvatar profile={draftProfile} size="lg" label="个人资料头像" />
            <div className="settings-profile-copy">
              <span className="settings-profile-kicker">个人资料</span>
              <h2 className="ui-title-headline">{draftProfile.fullName}</h2>
              <p className="settings-account-label" title={accountLabel || undefined}>
                {accountLabel || '账号信息加载中'}
              </p>
              <div className="settings-profile-meta" aria-label="账号摘要">
                <span>目标 {formatBandOption(draftProfile.targetOverall)}</span>
                <span>{license.status === 'active' ? '会员已激活' : license.status === 'loading' ? '正在读取会员状态' : '会员未激活'}</span>
                {userId ? <span title={userId}>ID {userId.slice(0, 8)}</span> : null}
              </div>
              {draftProfile.bio ? <p className="settings-profile-bio">{draftProfile.bio}</p> : null}
            </div>
          </div>
          <div className="settings-profile-actions">
            <p>安全退出当前账号</p>
            <LogoutButton />
          </div>
        </GlassPanel>

        <div className="settings-sections">
          <GlassPanel className="settings-section">
            <form className="profile-form" onSubmit={savePersonalProfile}>
              <div className="settings-section-header">
              <h2 className="ui-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MaterialIcon name="person" filled className="text-primary" />
                个人资料
              </h2>
                <span className={`profile-save-state is-${profileSaveStatus}`} role="status">
                  {profileSaveStatus === 'clean'
                    ? '未修改'
                    : profileSaveStatus === 'dirty'
                      ? '有未保存修改'
                      : profileSaveStatus === 'saving'
                        ? '保存中'
                        : profileSaveStatus === 'success'
                          ? '保存成功'
                          : '保存失败'}
                </span>
              </div>

              <div className="profile-form-grid">
                <label className="field">
                  <span>用户姓名</span>
                  <input
                    value={draftProfile.fullName}
                    onChange={(event) => updateProfileField('fullName', event.target.value)}
                    aria-invalid={Boolean((attemptedProfileSave || profileDirty) && profileErrors.fullName)}
                  />
                  {(attemptedProfileSave || profileDirty) && profileErrors.fullName ? <em className="field-error">{profileErrors.fullName}</em> : null}
                </label>

                <label className="field">
                  <span>英文昵称（可选）</span>
                  <input
                    value={draftProfile.englishNickname}
                    onChange={(event) => updateProfileField('englishNickname', event.target.value)}
                    placeholder="例如 Allen"
                    aria-invalid={Boolean((attemptedProfileSave || profileDirty) && profileErrors.englishNickname)}
                  />
                  {(attemptedProfileSave || profileDirty) && profileErrors.englishNickname ? <em className="field-error">{profileErrors.englishNickname}</em> : null}
                </label>

                <label className="field profile-field-wide">
                  <span>个人简介</span>
                  <textarea
                    value={draftProfile.bio}
                    rows={3}
                    onChange={(event) => updateProfileField('bio', event.target.value)}
                    aria-invalid={Boolean((attemptedProfileSave || profileDirty) && profileErrors.bio)}
                  />
                  {(attemptedProfileSave || profileDirty) && profileErrors.bio ? <em className="field-error">{profileErrors.bio}</em> : null}
                </label>

                <label className="field">
                  <span>目标总分</span>
                  <select value={draftProfile.targetOverall} onChange={(event) => updateProfileField('targetOverall', Number(event.target.value) as UserProfile['targetOverall'])}>
                    {IELTS_BAND_OPTIONS.map((score) => <option key={score} value={score}>{formatBandOption(score)}</option>)}
                  </select>
                </label>

                <label className="field">
                  <span>Task 1目标分</span>
                  <select value={draftProfile.task1Target} onChange={(event) => updateProfileField('task1Target', Number(event.target.value) as UserProfile['task1Target'])}>
                    {IELTS_BAND_OPTIONS.map((score) => <option key={score} value={score}>{formatBandOption(score)}</option>)}
                  </select>
                </label>

                <label className="field">
                  <span>Task 2目标分</span>
                  <select value={draftProfile.task2Target} onChange={(event) => updateProfileField('task2Target', Number(event.target.value) as UserProfile['task2Target'])}>
                    {IELTS_BAND_OPTIONS.map((score) => <option key={score} value={score}>{formatBandOption(score)}</option>)}
                  </select>
                </label>

                <label className="field">
                  <span>预计考试日期</span>
                  <input type="date" value={draftProfile.examDate} onChange={(event) => updateProfileField('examDate', event.target.value)} />
                  {(attemptedProfileSave || profileDirty) && profileErrors.examDate ? <em className="field-error">{profileErrors.examDate}</em> : null}
                </label>

                <label className="field">
                  <span>每周练习目标</span>
                  <input
                    min={1}
                    max={14}
                    type="number"
                    value={draftProfile.weeklyPracticeTarget}
                    onChange={(event) => updateProfileField('weeklyPracticeTarget', Number(event.target.value))}
                  />
                  {(attemptedProfileSave || profileDirty) && profileErrors.weeklyPracticeTarget ? <em className="field-error">{profileErrors.weeklyPracticeTarget}</em> : null}
                </label>

                <label className="field">
                  <span>当前英语水平</span>
                  <select value={draftProfile.currentLevel} onChange={(event) => updateProfileField('currentLevel', event.target.value as UserProfile['currentLevel'])}>
                    {Object.entries(EnglishLevelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>

                <fieldset className="field profile-field-wide preference-field">
                  <legend>学习偏好</legend>
                  <div className="preference-grid">
                    {StudyPreferenceOptions.map((preference) => (
                      <label key={preference} className="preference-option">
                        <input
                          type="checkbox"
                          checked={draftProfile.studyPreferences.includes(preference)}
                          onChange={() => togglePreference(preference)}
                        />
                        <span>{StudyPreferenceLabels[preference]}</span>
                      </label>
                    ))}
                  </div>
                  {(attemptedProfileSave || profileDirty) && profileErrors.studyPreferences ? <em className="field-error">{profileErrors.studyPreferences}</em> : null}
                </fieldset>
              </div>

              <div className="settings-save-bar">
                <p className="settings-message">
                  {profileSaveStatus === 'error'
                    ? '保存失败时不会丢失当前填写内容，请修正后重试。'
                    : '保存后，账号中心、分析页和头像会同步更新。'}
                </p>
                <AsyncButton
                  icon="save"
                  loading={profileSaveStatus === 'saving'}
                  success={profileSaveStatus === 'success'}
                  error={profileSaveStatus === 'error'}
                  disabled={!profileDirty}
                  type="submit"
                >
                  保存个人资料
                </AsyncButton>
              </div>
            </form>
          </GlassPanel>

          <GlassPanel className="settings-section">
            <div className="settings-section-header">
              <h2 className="ui-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MaterialIcon name="lock" filled className="text-primary" />
                账号与安全
              </h2>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="verified_user" />
                  </span>
                  <div>
                    <p className="ui-body-md" style={{ color: 'var(--on-surface)' }}>授权状态</p>
                    <p className="ui-label">
                      {license.status === 'loading'
                        ? '正在读取'
                        : license.status === 'active'
                          ? '已激活'
                          : license.status === 'error'
                            ? '读取失败'
                            : '未激活'}
                    </p>
                  </div>
                </div>
                <AsyncButton className="ui-secondary-button" icon="refresh" loading={refreshingLicense} onClick={refreshLicense}>
                  刷新
                </AsyncButton>
              </div>

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="license" />
                  </span>
                  <div>
                    <p className="ui-body-md" style={{ color: 'var(--on-surface)' }}>授权详情</p>
                    <p className="ui-label">套餐：{license.plan || '暂无'} · 到期时间：{formatDateTime(license.expiresAt)}</p>
                  </div>
                </div>
                <span className="ui-label">最近使用：{formatDateTime(license.lastUsedAt)}</span>
              </div>
            </div>

          </GlassPanel>

          <GlassPanel className="settings-section">
            <div className="settings-section-header">
              <h2 className="ui-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MaterialIcon name="keyboard_command_key" className="text-primary" />
                交互偏好与快捷键
              </h2>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="settings-toggle-row">
                <div>
                  <p className="ui-body-md" style={{ color: 'var(--on-surface)' }}>减弱动效</p>
                  <p className="ui-label">开启后页面过渡和通知动画会缩短。</p>
                </div>
                <button
                  className={`switch-button ${motion.enabled ? 'is-on' : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={motion.enabled}
                  aria-label="减弱动效"
                  onClick={() => {
                    motion.setPreference(!motion.enabled)
                    pushToast({ kind: 'success', title: !motion.enabled ? '已减弱动效' : '已恢复标准动效' })
                  }}
                >
                  <span />
                </button>
              </div>

              {[
                ['Cmd/Ctrl + K', '打开快速导航'],
                ['Cmd/Ctrl + S', '保存当前草稿'],
                ['Cmd/Ctrl + Enter', '打开提交确认'],
                ['Cmd/Ctrl + 1', '进入 Task 1'],
                ['Cmd/Ctrl + 2', '进入 Task 2'],
                ['Cmd/Ctrl + ,', '打开设置'],
                ['/', '聚焦历史搜索']
              ].map(([shortcut, label]) => (
                <div key={shortcut} className="shortcut-row">
                  <span className="ui-body-md">{label}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="restart_alt" />
                  </span>
                  <div>
                    <p className="ui-body-md" style={{ color: 'var(--on-surface)' }}>重置布局</p>
                    <p className="ui-label">仅重置分栏、滚动位置和筛选条件，不删除作文历史。</p>
                  </div>
                </div>
                <button className="ui-secondary-button" type="button" onClick={() => setConfirmResetLayout(true)}>
                  重置
                </button>
              </div>
            </div>
          </GlassPanel>
        </div>
      </section>
      <ConfirmDialog
        open={confirmResetLayout}
        title="重置布局偏好？"
        message="将恢复分栏宽度、滚动位置和历史筛选条件，作文历史与草稿不会删除。"
        confirmLabel="重置"
        cancelLabel="取消"
        tone="danger"
        onCancel={() => setConfirmResetLayout(false)}
        onConfirm={resetLayout}
      />
    </main>
  )
}
