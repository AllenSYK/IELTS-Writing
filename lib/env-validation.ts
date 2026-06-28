const requiredServerEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
] as const

const optionalServerEnvVars = [
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
  'QWEN_GRADING_MODEL',
  'QWEN_VISION_MODEL',
  'QWEN_STUDY_PLAN_MODEL',
  'AI_PROVIDER',
  'AI_TIMEOUT_MS',
  'NEXT_PUBLIC_SITE_URL'
] as const

let validated = false

export function validateServerEnvironment() {
  if (validated) return
  validated = true

  const missing: string[] = []

  for (const name of requiredServerEnvVars) {
    if (!process.env[name]?.trim()) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    console.error(
      `[env-validation] 缺少必要的服务端环境变量: ${missing.join(', ')}. ` +
      '请在 .env.local 或部署平台中配置这些变量。'
    )
  }

  for (const name of optionalServerEnvVars) {
    if (!process.env[name]?.trim()) {
      console.warn(`[env-validation] 可选环境变量 ${name} 未配置，相关功能可能不可用。`)
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl && !/^https?:\/\/.+/.test(siteUrl)) {
    console.warn(`[env-validation] NEXT_PUBLIC_SITE_URL 格式异常，应以 http:// 或 https:// 开头。`)
  }
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`环境变量 ${name} 未配置。`)
  }
  return value
}
