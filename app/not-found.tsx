import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="ui-page" data-main-content tabIndex={-1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <section style={{ textAlign: 'center', padding: '48px 24px', maxWidth: 480 }}>
        <p style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary)', margin: '0 0 8px' }}>404</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>页面不存在</h1>
        <p style={{ fontSize: 15, color: 'var(--on-surface-variant)', margin: '0 0 24px', lineHeight: 1.6 }}>
          请检查链接是否正确，或返回首页继续操作。
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link className="ui-primary-button" href="/dashboard">返回首页</Link>
          <Link className="ui-secondary-button" href="/practice">开始写作</Link>
        </div>
      </section>
    </main>
  )
}
