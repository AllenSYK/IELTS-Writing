import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const BulkSchema = z.object({
  count: z.number().int().min(1).max(500),
  plan: z.string().min(1).default('standard'),
  duration: z.enum(['1', '7', '30', '90', '180', '365', 'permanent', 'custom']).default('30'),
  customDays: z.number().int().positive().optional().nullable(),
  startsOnFirstActivation: z.boolean().default(true),
  maxDevices: z.number().int().positive().nullable().default(1),
  maxActivations: z.number().int().positive().nullable().default(null),
  autoUpdateEnabled: z.boolean().default(true),
  adminNote: z.string().optional().nullable()
})

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = BulkSchema.parse(await request.json())
    const data = await callAdminFunction('createKeys', {
      count: body.count,
      plan: body.plan,
      durationDays: durationToDays(body.duration, body.customDays),
      startsOnFirstActivation: body.startsOnFirstActivation,
      maxDevices: body.maxDevices,
      maxActivations: body.maxActivations,
      autoUpdateEnabled: body.autoUpdateEnabled,
      internalNote: body.adminNote || null
    })
    return json(data)
  } catch (error) {
    return apiError(error, '无法批量生成激活码。')
  }
}

function durationToDays(duration: z.infer<typeof BulkSchema>['duration'], customDays?: number | null) {
  if (duration === 'permanent') return null
  if (duration === 'custom') return customDays || null
  return Number(duration)
}
