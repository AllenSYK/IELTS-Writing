import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminMembershipsClient } from './AdminMembershipsClient'

export const metadata: Metadata = { title: '会员管理' }

export default async function AdminMembershipsPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }
  return <AdminMembershipsClient />
}
