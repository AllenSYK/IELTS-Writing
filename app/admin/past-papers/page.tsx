import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminPastPapersClient } from './AdminPastPapersClient'

export const metadata: Metadata = {
  title: '真题题库',
}

export default async function AdminPastPapersPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }
  return <AdminPastPapersClient />
}
