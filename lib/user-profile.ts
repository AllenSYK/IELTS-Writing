import { userScopedStorageKey } from '@/lib/user-storage'

export type IELTSBand = 5 | 5.5 | 6 | 6.5 | 7 | 7.5 | 8 | 8.5 | 9

export type EnglishLevel = 'beginner' | 'intermediate' | 'upper-intermediate' | 'advanced'

export type StudyPreference =
  | 'task1-charts'
  | 'task2-arguments'
  | 'grammar-accuracy'
  | 'lexical-resource'
  | 'coherence'
  | 'exam-timing'

export type UserProfile = {
  fullName: string
  englishNickname: string
  bio: string
  targetOverall: IELTSBand
  task1Target: IELTSBand
  task2Target: IELTSBand
  examDate: string
  weeklyPracticeTarget: number
  currentLevel: EnglishLevel
  studyPreferences: StudyPreference[]
  avatarUrl?: string
  updatedAt: string
}

export type UserProfileValidationError = Partial<Record<keyof UserProfile, string>>

export const UserProfileStorageKey = 'aerowrite-user-profile-v1'

export const IELTS_BAND_OPTIONS: IELTSBand[] = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]

export const EnglishLevelLabels: Record<EnglishLevel, string> = {
  beginner: '基础阶段',
  intermediate: '中级阶段',
  'upper-intermediate': '中高级阶段',
  advanced: '高级冲刺'
}

export const StudyPreferenceLabels: Record<StudyPreference, string> = {
  'task1-charts': 'Task 1 图表描述',
  'task2-arguments': 'Task 2 论证展开',
  'grammar-accuracy': '语法准确性',
  'lexical-resource': '词汇提升',
  coherence: '结构与衔接',
  'exam-timing': '限时练习'
}

export const StudyPreferenceOptions: StudyPreference[] = [
  'task1-charts',
  'task2-arguments',
  'grammar-accuracy',
  'lexical-resource',
  'coherence',
  'exam-timing'
]

export const DefaultUserProfile: UserProfile = {
  fullName: '雅思追梦人',
  englishNickname: '',
  bio: '目标雅思写作稳步提升，持续练习并复盘真实批改记录。',
  targetOverall: 7,
  task1Target: 7,
  task2Target: 7,
  examDate: '',
  weeklyPracticeTarget: 5,
  currentLevel: 'intermediate',
  studyPreferences: ['grammar-accuracy', 'coherence'],
  updatedAt: new Date(0).toISOString()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeBand(value: unknown, fallback: IELTSBand): IELTSBand {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return IELTS_BAND_OPTIONS.includes(numberValue as IELTSBand) ? (numberValue as IELTSBand) : fallback
}

function normalizeLevel(value: unknown): EnglishLevel {
  return value === 'beginner' || value === 'intermediate' || value === 'upper-intermediate' || value === 'advanced'
    ? value
    : DefaultUserProfile.currentLevel
}

function normalizePreferences(value: unknown): StudyPreference[] {
  if (!Array.isArray(value)) return DefaultUserProfile.studyPreferences
  const next = value.filter((item): item is StudyPreference => StudyPreferenceOptions.includes(item as StudyPreference))
  return next.length > 0 ? Array.from(new Set(next)) : DefaultUserProfile.studyPreferences
}

function normalizeText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizeUserProfile(value: unknown): UserProfile {
  if (!isObject(value)) return DefaultUserProfile

  const weekly = typeof value.weeklyPracticeTarget === 'number' ? value.weeklyPracticeTarget : Number(value.weeklyPracticeTarget)

  return {
    fullName: normalizeText(value.fullName, DefaultUserProfile.fullName).trim() || DefaultUserProfile.fullName,
    englishNickname: normalizeText(value.englishNickname).trim(),
    bio: normalizeText(value.bio, DefaultUserProfile.bio).trim(),
    targetOverall: normalizeBand(value.targetOverall, DefaultUserProfile.targetOverall),
    task1Target: normalizeBand(value.task1Target, DefaultUserProfile.task1Target),
    task2Target: normalizeBand(value.task2Target, DefaultUserProfile.task2Target),
    examDate: normalizeText(value.examDate).trim(),
    weeklyPracticeTarget: Number.isFinite(weekly) ? Math.min(14, Math.max(1, Math.round(weekly))) : DefaultUserProfile.weeklyPracticeTarget,
    currentLevel: normalizeLevel(value.currentLevel),
    studyPreferences: normalizePreferences(value.studyPreferences),
    avatarUrl: normalizeText(value.avatarUrl).trim() || undefined,
    updatedAt: normalizeText(value.updatedAt, new Date().toISOString())
  }
}

export function validateUserProfile(profile: UserProfile): UserProfileValidationError {
  const errors: UserProfileValidationError = {}
  if (!profile.fullName.trim()) {
    errors.fullName = '请输入用户姓名。'
  }
  if (profile.fullName.trim().length > 40) {
    errors.fullName = '姓名请控制在 40 个字符以内。'
  }
  if (profile.englishNickname.trim().length > 40) {
    errors.englishNickname = '英文昵称请控制在 40 个字符以内。'
  }
  if (profile.bio.trim().length > 180) {
    errors.bio = '个人简介请控制在 180 个字符以内。'
  }
  if (!IELTS_BAND_OPTIONS.includes(profile.targetOverall)) {
    errors.targetOverall = '请选择有效的目标总分。'
  }
  if (!IELTS_BAND_OPTIONS.includes(profile.task1Target)) {
    errors.task1Target = '请选择有效的 Task 1 目标分。'
  }
  if (!IELTS_BAND_OPTIONS.includes(profile.task2Target)) {
    errors.task2Target = '请选择有效的 Task 2 目标分。'
  }
  if (profile.examDate && Number.isNaN(new Date(`${profile.examDate}T00:00:00`).getTime())) {
    errors.examDate = '请输入有效的考试日期。'
  }
  if (!Number.isFinite(profile.weeklyPracticeTarget) || profile.weeklyPracticeTarget < 1 || profile.weeklyPracticeTarget > 14) {
    errors.weeklyPracticeTarget = '每周练习目标需在 1 到 14 篇之间。'
  }
  if (profile.studyPreferences.length === 0) {
    errors.studyPreferences = '请至少选择一个学习偏好。'
  }
  return errors
}

export function hasProfileErrors(errors: UserProfileValidationError) {
  return Object.values(errors).some(Boolean)
}

export function loadUserProfile(userId: string): UserProfile {
  if (typeof window === 'undefined') return DefaultUserProfile
  try {
    const raw = window.localStorage.getItem(userScopedStorageKey(UserProfileStorageKey, userId))
    return normalizeUserProfile(raw ? JSON.parse(raw) : null)
  } catch {
    return DefaultUserProfile
  }
}

export function saveUserProfile(userId: string, profile: UserProfile): UserProfile {
  const normalized = normalizeUserProfile({ ...profile, updatedAt: new Date().toISOString() })
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(userScopedStorageKey(UserProfileStorageKey, userId), JSON.stringify(normalized))
    window.dispatchEvent(new CustomEvent('aerowrite:user-profile-updated', { detail: { userId, profile: normalized } }))
  }
  return normalized
}

export function initialsFromProfile(profile: Pick<UserProfile, 'fullName' | 'englishNickname'>) {
  const source = profile.englishNickname.trim() || profile.fullName.trim() || DefaultUserProfile.fullName
  const english = source.match(/[A-Za-z]/)?.[0]
  if (english) return english.toUpperCase()
  return Array.from(source)[0] || '雅'
}

export function formatBandOption(value: IELTSBand | number) {
  return Number(value).toFixed(1)
}
