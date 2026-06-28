import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminBindingsClient } from './AdminBindingsClient'

export const metadata: Metadata = {
  title: '邮箱绑定',
}

export default async function AdminBindingsPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }

  return <AdminBindingsClient />
}
