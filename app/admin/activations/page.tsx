import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminActivationsClient } from './AdminActivationsClient'

export default async function AdminActivationsPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/admin/login')
    if (error instanceof Response && error.status === 403) redirect('/admin/login?reason=not_admin')
    throw error
  }
  return <AdminActivationsClient />
}
