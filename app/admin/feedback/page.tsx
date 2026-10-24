import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminFeedbackClient } from './AdminFeedbackClient'

export const metadata: Metadata = {
  title: '用户反馈'
}

export default async function AdminFeedbackPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }

  return <AdminFeedbackClient />
}
