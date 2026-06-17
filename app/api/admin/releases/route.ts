import { z } from 'zod'
import { requireAdmin } from '@/lib/admin-auth'
import { callAdminFunction } from '@/lib/admin-edge'
import { apiError, json } from '@/lib/http'

const ReleaseSchema = z.object({
  version: z.string().min(1),
  channel: z.enum(['stable', 'beta']).default('stable'),
  platform: z.string().min(1),
  architecture: z.string().min(1),
  downloadUrl: z.string().url().optional().nullable(),
  releaseNotes: z.string().optional().nullable(),
  fileHash: z.string().optional().nullable(),
  sha512: z.string().optional().nullable(),
  signature: z.string().optional().nullable(),
  minimumSupportedVersion: z.string().optional().nullable(),
  metadataUrl: z.string().url().optional().nullable(),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
  mandatory: z.boolean().default(false),
  published: z.boolean().default(false),
  status: z.enum(['draft', 'uploading', 'failed', 'published']).optional(),
  storageProvider: z.string().optional().nullable(),
  artifacts: z.unknown().optional().nullable(),
  failureReason: z.string().optional().nullable()
})

export async function GET() {
  try {
    await requireAdmin()
    const data = await callAdminFunction('listReleases', { page: 1, pageSize: 100 })
    return json(data)
  } catch (error) {
    return apiError(error, '无法加载版本记录。')
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = ReleaseSchema.parse(await request.json())
    const data = await callAdminFunction('publishRelease', {
      version: body.version,
      channel: body.channel,
      platform: body.platform,
      architecture: body.architecture,
      downloadUrl: body.downloadUrl || null,
      metadataUrl: body.metadataUrl || null,
      releaseNotes: body.releaseNotes || null,
      sha512: body.sha512 || body.fileHash || null,
      fileSize: body.fileSize || null,
      minimumSupportedVersion: body.minimumSupportedVersion || null,
      publishedAt: body.publishedAt || null,
      mandatory: body.mandatory,
      published: body.published,
      status: body.status,
      storageProvider: body.storageProvider || null,
      artifacts: body.artifacts || null,
      failureReason: body.failureReason || null
    })
    return json(data)
  } catch (error) {
    return apiError(error, '无法保存版本。')
  }
}
