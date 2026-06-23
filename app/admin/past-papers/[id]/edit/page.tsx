import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminPastPaperEditClient } from './AdminPastPaperEditClient'

export default async function AdminPastPaperEditPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }
  const { id } = await params
  return <AdminPastPaperEditClient questionId={id} />
}
