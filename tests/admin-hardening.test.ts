import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { assertTrustedAdminMutationRequest } from '../lib/admin/trusted-origin'

test('administrator mutations reject cross-site requests', () => {
  assert.doesNotThrow(() => assertTrustedAdminMutationRequest(new Request('https://admin.example.com/api/admin/users', {
    method: 'POST',
    headers: {
      origin: 'https://admin.example.com',
      'sec-fetch-site': 'same-origin'
    }
  })))

  assert.throws(
    () => assertTrustedAdminMutationRequest(new Request('https://admin.example.com/api/admin/users', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site'
      }
    })),
    (error) => error instanceof Response && error.status === 403
  )
})

test('administrator APIs keep activation secrets behind an audited POST reveal', async () => {
  const [listRoute, detailRoute, bindingListRoute, bindingDetailRoute, userListRoute, userDetailRoute, revealRoute] = await Promise.all([
    readFile(new URL('../app/api/admin/licenses/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/licenses/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/bindings/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/bindings/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/list/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/licenses/[id]/reveal/route.ts', import.meta.url), 'utf8')
  ])

  assert.match(listRoute, /Reflect\.deleteProperty\(redacted,\s*'code_value'\)/)
  for (const source of [detailRoute, bindingListRoute, bindingDetailRoute, userListRoute, userDetailRoute]) {
    assert.doesNotMatch(source, /\bcode_value\b/)
  }
  assert.match(revealRoute, /export async function POST/)
  assert.doesNotMatch(revealRoute, /export async function GET/)
  assert.match(revealRoute, /if \(!auditId\)/)
})

test('destructive admin operations are recoverable or explicitly irreversible', async () => {
  const [licenseRoute, pastPaperRoute, userRoute, hardeningMigration] = await Promise.all([
    readFile(new URL('../app/api/admin/licenses/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/past-papers/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260725153201_harden_admin_mutations.sql', import.meta.url), 'utf8')
  ])

  assert.match(licenseRoute, /HARD_DELETE_DISABLED/)
  assert.doesNotMatch(pastPaperRoute, /\.from\('past_paper_questions'\)\.delete\(\)/)
  assert.match(pastPaperRoute, /status:\s*'archived'/)
  assert.match(userRoute, /deleteUser\(id,\s*true\)/)
  assert.match(userRoute, /admin_prepare_user_deletion/)
  assert.match(hardeningMigration, /ACCOUNT_DELETED/)
})

test('administrator concurrency guards execute in the same database mutation', async () => {
  const [settingsRoute, pastPaperRoute, userRoute, hardeningMigration] = await Promise.all([
    readFile(new URL('../app/api/admin/settings/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/past-papers/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/users/[id]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260725153201_harden_admin_mutations.sql', import.meta.url), 'utf8')
  ])

  assert.match(settingsRoute, /\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(settingsRoute, /\bsetting_value:\s*patch/)
  assert.match(pastPaperRoute, /updateQuery = updateQuery\.eq\('updated_at', expectedUpdatedAt\)/)
  assert.match(userRoute, /admin_set_user_role/)
  assert.match(hardeningMigration, /pg_advisory_xact_lock/)
  assert.match(hardeningMigration, /LAST_ADMIN_PROTECTED/)
})

test('AI model settings normalize timestamps and report stale saves as conflicts', async () => {
  const route = await readFile(new URL('../app/api/admin/models/route.ts', import.meta.url), 'utf8')

  assert.match(route, /expectedUpdatedAt:\s*ParseableTimestampSchema\.optional\(\)/)
  assert.match(route, /new Date\(expectedUpdatedAt\)\.toISOString\(\)/)
  assert.match(route, /\.eq\('updated_at', normalizedExpectedUpdatedAt\)/)
  assert.match(route, /ignoreDuplicates:\s*false/)
  assert.match(route, /\.select\('setting_value, updated_at'\)\s*\.single\(\)/)
  assert.match(route, /if \(!data\)[\s\S]*code:\s*'CONFLICT'[\s\S]*status:\s*409/)
  assert.match(route, /updatedAt:\s*toIsoTimestamp\(data\?\.updated_at\)/)
  assert.match(route, /updatedAt:\s*toIsoTimestamp\(data\.updated_at\)/)
})

test('AI model connection tests target the requested workload without exposing a key', async () => {
  const [testRoute, client] = await Promise.all([
    readFile(new URL('../app/api/admin/models/test/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/models/AdminModelsClient.tsx', import.meta.url), 'utf8')
  ])

  assert.match(testRoute, /slot:\s*AiModelSlotSchema/)
  assert.match(testRoute, /const model = settings\[slot\]/)
  assert.match(testRoute, /process\.env\.AI_API_KEY/)
  assert.doesNotMatch(testRoute, /settings\.promptModel/)
  assert.match(client, /testConnection\('gradingModel'\)/)
  assert.match(client, /\{ settings, slot \}/)
  assert.match(client, /未验证图片输入能力/)
})

test('AI workloads use runtime admin slots and usage rows store the resolved model', async () => {
  const [provider, evaluation, prompts, studyPlan, vision, usage] = await Promise.all([
    readFile(new URL('../lib/ai-provider.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ielts-evaluation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/writing-prompt-generation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/study-plan/generate/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/uploaded-writing-task-ai.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/ai-usage.ts', import.meta.url), 'utf8')
  ])

  assert.match(provider, /getEffectivePromptAiConfig[\s\S]*slot:\s*'promptModel'/)
  assert.match(provider, /getEffectiveGradingAiConfig[\s\S]*slot:\s*'gradingModel'/)
  assert.match(provider, /getEffectiveStudyPlanAiConfig[\s\S]*slot:\s*'studyPlanModel'/)
  assert.match(provider, /getEffectiveVisionAiConfig[\s\S]*slot:\s*'visionModel'/)
  assert.match(provider, /getEffectiveVisionFallbackAiConfig[\s\S]*slot:\s*'visionFallbackModel'/)
  assert.match(evaluation, /getEffectiveGradingAiConfig\(\)/)
  assert.match(prompts, /getEffectivePromptAiConfig\(\)/)
  assert.match(studyPlan, /getEffectiveStudyPlanAiConfig\(\)/)
  assert.match(vision, /getEffectiveVisionAiConfig\(\)/)
  assert.match(vision, /getEffectiveVisionFallbackAiConfig\(\)/)
  assert.match(usage, /model:\s*model \|\| null/)
  assert.doesNotMatch(usage, /process\.env\.AI_MODEL/)
})
