import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const CreateSchema = z.object({
  plan: z.string().min(1).default('standard'),
  duration: z.enum(['1', '7', '30', '90', '180', '365', 'permanent', 'custom']).default('30'),
  customDays: z.number().int().positive().optional().nullable(),
  startsOnFirstActivation: z.boolean().default(true),
  maxDevices: z.number().int().positive().nullable().default(1),
  maxActivations: z.number().int().positive().nullable().default(null),
  autoUpdateEnabled: z.boolean().default(true),
  minimumAppVersion: z.string().optional().nullable(),
  maximumAppVersion: z.string().optional().nullable(),
  adminNote: z.string().optional().nullable()
})

export async function GET() {
  try {
    await requireAdmin()
    const data = await callAdminFunction('listKeys', { page: 1, pageSize: 200 })
    return json(data)
  } catch (error) {
    return apiError(error, '无法加载激活码。')
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = CreateSchema.parse(await request.json())
    const data = await callAdminFunction('createKeys', {
      count: 1,
      plan: body.plan,
      durationDays: durationToDays(body.duration, body.customDays),
      startsOnFirstActivation: body.startsOnFirstActivation,
      maxDevices: body.maxDevices,
      maxActivations: body.maxActivations,
      autoUpdateEnabled: body.autoUpdateEnabled,
      minimumAppVersion: body.minimumAppVersion || null,
      maximumAppVersion: body.maximumAppVersion || null,
      internalNote: body.adminNote || null
    })
    return json(data)
  } catch (error) {
    return apiError(error, '无法生成激活码。')
  }
}

function durationToDays(duration: z.infer<typeof CreateSchema>['duration'], customDays?: number | null) {
  if (duration === 'permanent') return null
  if (duration === 'custom') return customDays || null
  return Number(duration)
}
