import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { ResetPasswordClient } from './ResetPasswordClient'

export default function ResetPasswordPage() {
  return (
    <main className="auth-page auth-page-modern" data-main-content tabIndex={-1}>
      <Suspense
        fallback={
          <section className="auth-panel auth-panel-modern">
            <p className="auth-success" role="status"><Loader2 className="admin-spin" size={16} />正在打开重置页面</p>
          </section>
        }
      >
        <ResetPasswordClient />
      </Suspense>
    </main>
  )
}
