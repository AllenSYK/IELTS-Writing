import Link from 'next/link'

export default function AdminNotFound() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      padding: 48
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p style={{ fontSize: 40, fontWeight: 800, color: '#6b7280', margin: '0 0 8px' }}>404</p>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          管理页面不存在
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
          请检查链接是否正确。
        </p>
        <Link
          href="/admin"
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none'
          }}
        >
          返回管理首页
        </Link>
      </div>
    </div>
  )
}
