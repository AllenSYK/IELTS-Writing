import { redirect } from 'next/navigation'
import { requireWebAdmin } from '@/lib/web-license/auth'
import { AdminLicensesClient } from './AdminLicensesClient'

export default async function AdminLicensesPage() {
  try {
    await requireWebAdmin()
  } catch (error) {
    if (error instanceof Response && error.status === 401) redirect('/login')
    return (
      <main className="auth-page" data-main-content tabIndex={-1}>
        <section className="auth-panel">
          <h1>无权访问</h1>
          <p className="auth-error">只有管理员账号可以访问激活码管理。</p>
        </section>
      </main>
    )
  }

  return <AdminLicensesClient />
}
