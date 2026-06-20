import { json } from '@/lib/http'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import { getCurrentSupabaseUser } from '@/lib/web-license/auth'

const UploadBucket = 'writing-task-uploads'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentSupabaseUser()
  if (!user) return json({ success: false, message: '请先登录' }, { status: 401 })
  const { id } = await context.params
  const service = createSupabaseServiceRoleClient()
  const { data: row, error } = await service
    .from('writing_task_uploads')
    .select('storage_path, mime_type, expires_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !row?.storage_path) return json({ success: false, message: '图片不存在' }, { status: 404 })
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return json({ success: false, message: '图片已到期' }, { status: 410 })
  }
  const { data, error: downloadError } = await service.storage.from(UploadBucket).download(row.storage_path)
  if (downloadError || !data) return json({ success: false, message: '图片读取失败' }, { status: 404 })
  return new Response(data, {
    headers: {
      'Content-Type': row.mime_type,
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
