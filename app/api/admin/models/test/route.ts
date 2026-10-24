import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { createAdminModelsHandlers } from '@/lib/admin/ai-models-handler'

export const maxDuration = 60

const handlers = createAdminModelsHandlers({ authorize: requireAdminService, errorResponse: adminApiError })

export const POST = handlers.TEST
