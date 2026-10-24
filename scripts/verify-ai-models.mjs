import nextEnv from '@next/env'
import { createSupabaseServiceRoleClient } from '../lib/supabase/service.ts'
import { createAdminModelsHandlers } from '../lib/admin/ai-models-handler.ts'
import { AiModelSlotSchema } from '../lib/ai-model-settings.ts'

nextEnv.loadEnvConfig(process.cwd())
const service = createSupabaseServiceRoleClient()
// This is a local operator check with existing server credentials, never a web auth bypass.
// It only invokes GET and TEST; no settings, users or usage records are written.
const handlers = createAdminModelsHandlers({
  authorize: async () => ({ service, user: { id: 'local-read-only-verification' } }),
  errorResponse: () => Response.json({ success: false, message: '无法读取模型配置，请检查服务端数据库配置。' }, { status: 500 })
})
const endpoint = 'http://localhost/api/admin/models'
const loaded = await handlers.GET(new Request(endpoint))
const data = await loaded.json()
if (!loaded.ok) {
  console.error(JSON.stringify({ success: false, message: data.message }))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ source: data.source, enabled: data.settings.enabled, apiKeySource: data.apiKeySource }))
  for (const slot of AiModelSlotSchema.options) {
    const response = await handlers.TEST(new Request(`${endpoint}/test`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: data.settings, slot })
    }))
    const result = await response.json()
    console.log(JSON.stringify({ slot, model: data.settings[slot], success: result.success, capability: result.capability, latencyMs: result.latencyMs, code: result.code, message: result.message }))
    if (!response.ok) process.exitCode = 1
  }
}
