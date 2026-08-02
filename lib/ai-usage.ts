import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { WebLicenseCheck } from '@/lib/web-license/auth'

type ActiveWebLicense = Extract<WebLicenseCheck, { ok: true }>

export async function recordAiUsage({
  check,
  action,
  inputCharacters,
  result,
  error,
  model
}: {
  check: ActiveWebLicense
  action: 'evaluate' | 'generate_prompt' | 'generate_study_plan' | 'recognize_image'
  inputCharacters: number
  result: unknown
  error?: unknown
  model?: string | null
}) {
  try {
    const service = createSupabaseServiceRoleClient()
    const nowIso = new Date().toISOString()
    const [activationUpdate, usageInsert] = await Promise.all([
      service
        .from('license_activations')
        .update({ last_used_at: nowIso })
        .eq('id', check.activation.id),
      service
        .from('usage_records')
        .insert({
          user_id: check.user.id,
          license_id: check.activation.license_id,
          action,
          model: model || null,
          input_tokens: Math.ceil(inputCharacters / 4),
          output_tokens: result ? Math.ceil(JSON.stringify(result).length / 4) : null,
          success: !error,
          error_message: error instanceof Error ? error.message.slice(0, 500) : null
        })
    ])

    const storageError = activationUpdate.error || usageInsert.error
    if (storageError) {
      console.error('[ai-usage-record]', {
        action,
        userId: check.user.id,
        code: storageError.code
      })
    }
  } catch (storageError) {
    console.error('[ai-usage-record]', {
      action,
      userId: check.user.id,
      code: storageError instanceof Error ? storageError.name : 'unknown'
    })
  }
}
