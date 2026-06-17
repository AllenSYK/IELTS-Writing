import type { EssayEvaluation } from '@/lib/writing-records'
import type { WritingQuestion } from '@/lib/ielts-questions'
import type { PromptSelection } from '@/lib/writing-options'

export {}

type LicenseInfo = {
  status: string
  plan?: string
  expiresAt?: string
  lastValidatedAt?: string
}

type DesktopAiResult = {
  ok: boolean
  data?: EssayEvaluation
  message?: string
  error?: string
  status?: number
}

type DesktopPromptResult = {
  ok: boolean
  question?: WritingQuestion
  message?: string
  error?: string
  status?: number
}

type DesktopUpdateState = {
  status: string
  checking: boolean
  currentVersion: string
  latestVersion?: string
  channel: string
  updateAvailable?: boolean
  downloaded?: boolean
  mandatory?: boolean
  minimumSupportedVersion?: string | null
  releaseNotes?: string
  publishedAt?: string | null
  downloadUrl?: string | null
  metadataUrl?: string | null
  sha512?: string | null
  fileSize?: number
  manualUpdateOnly?: boolean
  autoUpdateDownloadEnabled?: boolean
  developerContactAvailable?: boolean
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  lastCheckedAt?: string | null
  message: string
  error?: string | null
  aiRequestsInFlight?: number
}

declare global {
  interface Window {
    desktopApp?: {
      getVersion: () => Promise<string>
      getDeviceInfo?: () => Promise<{ platform: string; arch: string; hostname: string }>
      clearCache: () => Promise<{ ok: boolean; message: string }>
      openUserHome?: () => Promise<{ ok: boolean; message: string }>
    }
    desktopLicense?: {
      activate: (licenseKey: string) => Promise<{ ok: boolean; message: string }>
      getInfo: () => Promise<LicenseInfo>
    }
    desktopUpdater?: {
      checkForUpdates: () => Promise<{ ok: boolean; message: string; state?: DesktopUpdateState }>
      getState?: () => Promise<DesktopUpdateState>
      downloadUpdate?: () => Promise<{ ok: boolean; message: string; state?: DesktopUpdateState }>
      installUpdate?: () => Promise<{ ok: boolean; message: string; state?: DesktopUpdateState }>
      dismissUpdate?: () => Promise<{ ok: boolean; state?: DesktopUpdateState }>
      contactDeveloper?: () => Promise<{ ok: boolean; message: string }>
      onStatus?: (callback: (state: DesktopUpdateState) => void) => () => void
      onProgress?: (callback: (progress: { percent: number; transferred: number; total: number; bytesPerSecond?: number }) => void) => () => void
    }
    desktopAi?: {
      evaluateEssay: (payload: { essay: string; taskType: 'task1' | 'task2'; prompt?: string; questionType?: string }) => Promise<DesktopAiResult>
      generatePrompt?: (payload: {
        taskType: 'task1' | 'task2'
        selection: PromptSelection
        excludePromptSummaries?: Array<Record<string, unknown>>
      }) => Promise<DesktopPromptResult>
    }
  }
}
