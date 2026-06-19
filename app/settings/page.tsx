'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { AsyncButton, ConfirmDialog, useMotionPreference, useToast } from '@/components/interaction-system'
import { GlassPanel, MaterialIcon } from '@/components/stitch-ui'
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
import { belongsToUserStorageKey } from '@/lib/user-storage'

type LicenseInfo = {
  status: string
  plan?: string
  expiresAt?: string
  lastValidatedAt?: string
}

type UpdateState = {
  status: string
  checking: boolean
  message: string
  currentVersion?: string
  latestVersion?: string
  channel?: string
  updateAvailable?: boolean
  downloaded?: boolean
  mandatory?: boolean
  minimumSupportedVersion?: string | null
  releaseNotes?: string
  publishedAt?: string | null
  fileSize?: number
  manualUpdateOnly?: boolean
  autoUpdateDownloadEnabled?: boolean
  developerContactAvailable?: boolean
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  lastCheckedAt?: string | null
  error?: string | null
  aiRequestsInFlight?: number
}

type DeviceInfo = {
  platform: string
  arch: string
  hostname: string
}

type ProfileSaveStatus = 'clean' | 'dirty' | 'saving' | 'success' | 'error'

function formatDateTime(value?: string | null) {
  if (!value) return '尚未检查'
  return new Date(value).toLocaleString()
}

export default function SettingsPage() {
  const { userId } = useUserSession()
  const { pushToast } = useToast()
  const motion = useMotionPreference()
  const { profile, saveProfile } = useUserProfile()
  const [draftProfile, setDraftProfile] = useState<UserProfile>(() => profile)
  const [profileSaveStatus, setProfileSaveStatus] = useState<ProfileSaveStatus>('clean')
  const [attemptedProfileSave, setAttemptedProfileSave] = useState(false)
  const [version, setVersion] = useState('Desktop only')
  const [license, setLicense] = useState<LicenseInfo>({ status: 'browser-preview' })
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle', checking: false, message: 'Ready', channel: 'stable' })
  const [refreshingLicense, setRefreshingLicense] = useState(false)
  const [cacheMessage, setCacheMessage] = useState('')
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ platform: 'browser', arch: 'preview', hostname: 'Not available' })
  const [confirmClearCache, setConfirmClearCache] = useState(false)
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

  useEffect(() => {
    window.desktopApp?.getVersion().then(setVersion).catch(() => undefined)
    window.desktopApp?.getDeviceInfo?.().then(setDeviceInfo).catch(() => undefined)
    window.desktopLicense?.getInfo().then(setLicense).catch(() => undefined)
    window.desktopUpdater?.getState?.().then((state) => setUpdateState((current) => ({ ...current, ...state }))).catch(() => undefined)
    const removeStatus = window.desktopUpdater?.onStatus?.((state) => {
      setUpdateState((current) => ({ ...current, ...state }))
    })
    return () => {
      removeStatus?.()
    }
  }, [])

  async function checkForUpdates() {
    setUpdateState((current) => ({ ...current, checking: true, status: 'checking-for-update', message: '正在检查更新...' }))
    try {
      const result = await window.desktopUpdater?.checkForUpdates()
      setUpdateState((current) => ({ ...current, ...(result?.state || {}), checking: false, message: result?.message || current.message }))
      pushToast({ kind: result?.ok === false ? 'warning' : 'success', title: result?.message || '更新检查完成' })
    } catch {
      setUpdateState((current) => ({ ...current, checking: false, status: 'error', message: '暂时无法检查更新，请稍后重试。' }))
      pushToast({ kind: 'error', title: '暂时无法检查更新，请稍后重试。' })
    }
  }

  async function clearCache() {
    try {
      const result = await window.desktopApp?.clearCache()
      setCacheMessage(result?.message || 'Cache cleanup is available in the desktop app.')
      pushToast({ kind: result?.ok === false ? 'warning' : 'success', title: result?.message || '缓存处理完成' })
    } catch (error) {
      setCacheMessage(error instanceof Error ? error.message : 'Cache cleanup failed.')
      pushToast({ kind: 'error', title: '清除缓存失败', message: error instanceof Error ? error.message : '请稍后重试。' })
    }
  }

  async function refreshLicense() {
    setRefreshingLicense(true)
    try {
      const next = await window.desktopLicense?.getInfo()
      if (next) setLicense(next)
      pushToast({ kind: 'success', title: '授权状态已刷新' })
    } catch (error) {
      pushToast({ kind: 'error', title: '授权刷新失败', message: error instanceof Error ? error.message : '请检查网络或稍后重试。' })
    } finally {
      setRefreshingLicense(false)
    }
  }

  function resetLayout() {
    if (!userId) return
    Object.keys(window.localStorage)
      .filter((key) => belongsToUserStorageKey(key, userId) && (
        key.startsWith('aerowrite-editor-position-') ||
        key.startsWith('aerowrite-editor-split-') ||
        key.startsWith('aerowrite-history-filters-v1')
      ))
      .forEach((key) => window.localStorage.removeItem(key))
    Object.keys(window.sessionStorage)
      .filter((key) => belongsToUserStorageKey(key, userId) && key.startsWith('aerowrite-scroll:'))
      .forEach((key) => window.sessionStorage.removeItem(key))
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
        <GlassPanel className="settings-profile-card stitch-hover-glow">
          <ProfileAvatar profile={draftProfile} size="lg" label="个人资料头像" />
          <div>
            <h1 className="stitch-title-headline">{draftProfile.fullName}</h1>
            <p className="stitch-body-md" style={{ marginTop: 8 }}>
              目标总分 {formatBandOption(draftProfile.targetOverall)} · Task 1 {formatBandOption(draftProfile.task1Target)} · Task 2 {formatBandOption(draftProfile.task2Target)}
            </p>
            <p className="stitch-body-md" style={{ marginTop: 8 }}>{draftProfile.bio}</p>
          </div>
        </GlassPanel>

        <div className="settings-sections">
          <GlassPanel className="settings-section">
            <form className="profile-form" onSubmit={savePersonalProfile}>
              <div className="settings-section-header">
              <h2 className="stitch-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    : '保存后 Home、Analytics 和右上角头像会立即同步。'}
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
              <h2 className="stitch-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MaterialIcon name="lock" filled className="text-primary" />
                账号与安全 (Account & Security)
              </h2>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="verified_user" />
                  </span>
                  <div>
                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>授权状态</p>
                    <p className="stitch-label">{license.status}</p>
                  </div>
                </div>
                <AsyncButton className="stitch-secondary-button" icon="refresh" loading={refreshingLicense} onClick={refreshLicense}>
                  刷新
                </AsyncButton>
              </div>

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="license" />
                  </span>
                  <div>
                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>License</p>
                    <p className="stitch-label">Plan: {license.plan || 'Unknown'} • Expires: {license.expiresAt || 'Not available'}</p>
                  </div>
                </div>
                <span className="stitch-label">Last verified: {license.lastValidatedAt || 'Not available'}</span>
              </div>

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="computer" />
                  </span>
                  <div>
                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>Device</p>
                    <p className="stitch-label">{deviceInfo.hostname} • {deviceInfo.platform} • {deviceInfo.arch}</p>
                  </div>
                </div>
                <span className="stitch-label">Desktop runtime</span>
              </div>

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="deployed_code_update" />
                  </span>
	                  <div>
	                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>当前版本 {updateState.currentVersion || version}</p>
	                    <p className="stitch-label">
	                      最新版本 {updateState.latestVersion || updateState.currentVersion || version} • 上次检查 {formatDateTime(updateState.lastCheckedAt)}
	                    </p>
	                  </div>
	                </div>
	                <AsyncButton icon="refresh" loading={updateState.checking} onClick={checkForUpdates}>
	                  检查更新
	                </AsyncButton>
	              </div>

	              <div className={`update-panel ${updateState.mandatory ? 'is-mandatory' : ''}`}>
	                <div className="update-panel-header">
	                  <div>
	                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>
	                      {updateState.updateAvailable ? '发现新版本' : updateState.message}
	                    </p>
	                    <p className="stitch-label">
	                      当前版本 {updateState.currentVersion || version} • 最新版本 {updateState.latestVersion || updateState.currentVersion || version}
	                      {updateState.minimumSupportedVersion ? ` • 最低支持 ${updateState.minimumSupportedVersion}` : ''}
	                    </p>
	                  </div>
	                  <span className={`status ${updateState.status === 'error' || updateState.mandatory ? 'bad' : ''}`}>
	                    {updateState.mandatory ? '强制提示' : updateState.updateAvailable ? '联系开发者更新' : updateState.status}
	                  </span>
	                </div>

	                {updateState.releaseNotes ? <p className="settings-message">{updateState.releaseNotes}</p> : null}

	                <div className="meta-row" style={{ marginTop: 14 }}>
	                  <span className="stitch-label">更新方式：联系开发者更新</span>
	                  {updateState.publishedAt ? <span className="stitch-label">发布时间：{formatDateTime(updateState.publishedAt)}</span> : null}
	                </div>
	                {updateState.error ? <p className="settings-message">{updateState.error}</p> : null}
	                {updateState.aiRequestsInFlight ? <p className="settings-message">AI evaluation is still running.</p> : null}
              </div>

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="cleaning_services" />
                  </span>
                  <div>
                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>Cache</p>
                    <p className="stitch-label">{cacheMessage || 'Temporary files are stored in the Electron user data area.'}</p>
                  </div>
                </div>
                <button className="stitch-secondary-button" type="button" onClick={() => setConfirmClearCache(true)}>
                  Clear Cache
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <button className="danger-link" type="button" onClick={() => window.close()}>
                <MaterialIcon name="logout" size={18} />
                退出登录
              </button>
            </div>
          </GlassPanel>

          <GlassPanel className="settings-section">
            <div className="settings-section-header">
              <h2 className="stitch-title-md" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MaterialIcon name="keyboard_command_key" className="text-primary" />
                交互偏好与快捷键
              </h2>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="settings-toggle-row">
                <div>
                  <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>减弱动效</p>
                  <p className="stitch-label">开启后页面过渡、Toast 和面板动画会缩短。</p>
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
                  <span className="stitch-body-md">{label}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}

              <div className="account-row">
                <div className="account-main">
                  <span className="account-icon">
                    <MaterialIcon name="restart_alt" />
                  </span>
                  <div>
                    <p className="stitch-body-md" style={{ color: 'var(--on-surface)' }}>Reset layout</p>
                    <p className="stitch-label">仅重置分栏、滚动位置和筛选条件，不删除作文历史。</p>
                  </div>
                </div>
                <button className="stitch-secondary-button" type="button" onClick={() => setConfirmResetLayout(true)}>
                  Reset
                </button>
              </div>
            </div>
          </GlassPanel>
        </div>
      </section>
      <ConfirmDialog
        open={confirmClearCache}
        title="清除缓存？"
        message="这只会清理 Electron 临时缓存，不会删除作文历史、草稿或授权信息。"
        confirmLabel="清除"
        cancelLabel="取消"
        onCancel={() => setConfirmClearCache(false)}
        onConfirm={() => {
          setConfirmClearCache(false)
          void clearCache()
        }}
      />
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
