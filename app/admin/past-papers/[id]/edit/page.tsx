import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminPastPaperEditClient } from './AdminPastPaperEditClient'

export const metadata: Metadata = {
  title: '编辑真题',
}

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
