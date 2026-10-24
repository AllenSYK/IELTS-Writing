import { adminApiError, requireAdminService } from '@/lib/web-license/admin-api'
import { createAdminModelsHandlers } from '@/lib/admin/ai-models-handler'

const handlers = createAdminModelsHandlers({ authorize: requireAdminService, errorResponse: adminApiError })

export const GET = handlers.GET
export const PATCH = handlers.PATCH
