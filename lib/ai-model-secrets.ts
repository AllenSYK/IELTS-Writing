import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const CONTEXT = 'ielts-writing/admin-ai-api-key/v1'

export class AiModelSecretError extends Error {
  constructor() {
    super('无法解密已保存的 API 密钥，请在管理端重新输入并保存。')
    this.name = 'AiModelSecretError'
  }
}

function encryptionKey(source: string) {
  const secret = source === 'dedicated'
    ? process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim()
    : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) throw new AiModelSecretError()
  return Buffer.from(hkdfSync('sha256', secret, CONTEXT, 'aes-256-gcm', 32))
}

export function encryptAiApiKey(apiKey: string) {
  const source = process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() ? 'dedicated' : 'service-role'
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(source), iv)
  cipher.setAAD(Buffer.from(CONTEXT))
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return ['v1', source, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptAiApiKey(value: string) {
  try {
    const [version, source, iv, tag, encrypted, extra] = value.split('.')
    if (version !== 'v1' || !['dedicated', 'service-role'].includes(source) || !iv || !tag || !encrypted || extra !== undefined) {
      throw new AiModelSecretError()
    }
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(source), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(CONTEXT))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    // Never include ciphertext, credentials, or crypto internals in errors.
    throw new AiModelSecretError()
  }
}

export function storedAiApiKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('encryptedApiKey' in value)) return null
  const encrypted = value.encryptedApiKey
  if (encrypted === undefined || encrypted === null) return null
  if (typeof encrypted !== 'string' || !encrypted) throw new AiModelSecretError()
  return encrypted
}

export function resolveAiApiKey(value: unknown, update: { apiKey?: string; clearApiKey?: boolean } = {}) {
  if (update.apiKey?.trim()) return update.apiKey.trim()
  const encrypted = update.clearApiKey ? null : storedAiApiKey(value)
  return encrypted ? decryptAiApiKey(encrypted) : process.env.AI_API_KEY?.trim() || ''
}

export function aiApiKeyStatus(value: unknown) {
  let hasStoredKey = false
  let apiKeyReadable = true
  try {
    const encrypted = storedAiApiKey(value)
    hasStoredKey = Boolean(encrypted)
    if (encrypted) decryptAiApiKey(encrypted)
  } catch {
    hasStoredKey = true
    apiKeyReadable = false
  }
  const environmentApiKeyConfigured = Boolean(process.env.AI_API_KEY?.trim())
  return {
    apiKeyConfigured: hasStoredKey ? apiKeyReadable : environmentApiKeyConfigured,
    apiKeySource: hasStoredKey ? 'admin' as const : environmentApiKeyConfigured ? 'environment' as const : 'none' as const,
    apiKeyReadable,
    environmentApiKeyConfigured
  }
}
