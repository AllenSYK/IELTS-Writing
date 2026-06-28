import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminOverviewClient } from './AdminOverviewClient'

export const metadata: Metadata = {
  title: '管理概览',
}

export default async function AdminPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }
  return <AdminOverviewClient />
}
