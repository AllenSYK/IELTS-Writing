import { redirect } from 'next/navigation'
import { requireActiveWebLicense, requireWebAdmin } from '@/lib/web-license/auth'
import { AdminUsersClient } from './AdminUsersClient'

export default async function AdminUsersPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/login')
    if (error instanceof Response && error.status === 403) {
      const check = await requireActiveWebLicense()
      redirect(check.ok ? '/dashboard' : '/activate')
    }
    return (
      <main className="auth-page" data-main-content tabIndex={-1}>
        <section className="auth-panel">
          <h1>无权访问</h1>
          <p className="auth-error">只有管理员账号可以访问用户管理。</p>
        </section>
      </main>
    )
  }

  return <AdminUsersClient />
}
