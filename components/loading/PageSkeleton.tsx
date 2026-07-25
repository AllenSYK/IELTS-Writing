import { ChartSkeleton } from './ChartSkeleton'
import { QuestionSkeleton } from './QuestionSkeleton'
import { WritingEditorSkeleton } from './WritingEditorSkeleton'

export type PageSkeletonVariant = 'cards' | 'chart' | 'editor' | 'result'

export function PageSkeleton({ variant = 'cards' }: { variant?: PageSkeletonVariant }) {
  if (variant === 'editor') {
    return (
      <main className="exam-page exam-page-skeleton" tabIndex={-1} aria-busy="true" aria-label="正在加载考试">
        <header className="exam-topbar exam-topbar-skeleton">
          <div className="skeleton-line exam-skeleton-brand" />
          <div className="skeleton-line exam-skeleton-timer" />
          <div className="skeleton-line exam-skeleton-actions" />
        </header>
        <section className="exam-layout">
          <aside className="exam-left-pane">
            <QuestionSkeleton />
            <ChartSkeleton />
          </aside>
          <section className="exam-right-pane">
            <WritingEditorSkeleton />
          </section>
        </section>
        <section className="writing-route-loading-card" role="status" aria-live="polite">
          <span className="writing-route-loading-spinner" aria-hidden="true" />
          <div>
            <strong>正在准备写作练习</strong>
            <p>正在加载草稿、题目和写作编辑器，请稍候…</p>
          </div>
          <div className="writing-route-progress" aria-hidden="true">
            <span />
          </div>
          <ol className="writing-route-stages" aria-hidden="true">
            <li className="is-done">验证练习</li>
            <li className="is-active">准备题目</li>
            <li>打开编辑器</li>
          </ol>
        </section>
        <span className="sr-only">正在加载题目和编辑器</span>
      </main>
    )
  }

  return (
    <main className="ui-page route-content-skeleton" tabIndex={-1} aria-busy="true">
      <section className="ui-container skeleton-page" aria-label="正在加载页面内容">
        <QuestionSkeleton />
        {variant === 'chart' ? <ChartSkeleton /> : null}
        <div className={`skeleton-grid ${variant}`}>
          {Array.from({ length: variant === 'result' ? 6 : 4 }).map((_, index) => (
            <div key={index} className="skeleton-card" />
          ))}
        </div>
        <span className="sr-only" role="status" aria-live="polite">正在加载内容</span>
      </section>
    </main>
  )
}
