'use client'

import { MaterialIcon } from '@/components/stitch-ui'
import Link from 'next/link'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="stitch-page with-nav" data-main-content tabIndex={-1}>
      <section className="stitch-narrow-container">
        <div className="error-boundary-panel" role="alert">
          <MaterialIcon name="error" size={28} />
          <h1 className="stitch-title-headline">页面暂时无法显示</h1>
          <p className="stitch-body-md">
            内容没有丢失。你可以重试，或先返回首页继续使用。{error.digest ? ` 错误编号：${error.digest}` : ''}
          </p>
          <div className="error-actions">
            <button className="stitch-primary-button" type="button" onClick={reset}>
              重试
            </button>
            <Link className="stitch-secondary-button" href="/">
              返回首页
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
