'use client'

import { useState, useEffect } from 'react'

export function PastPaperSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="past-paper-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="past-paper-skeleton-card">
          <div className="past-paper-skeleton-header">
            <div className="past-paper-skeleton-badge" />
            <div className="past-paper-skeleton-badge past-paper-skeleton-badge-secondary" />
          </div>
          <div className="past-paper-skeleton-meta">
            <div className="past-paper-skeleton-meta-item" />
            <div className="past-paper-skeleton-meta-item past-paper-skeleton-meta-item-short" />
          </div>
          <div className="past-paper-skeleton-title" />
          <div className="past-paper-skeleton-text" />
          <div className="past-paper-skeleton-text past-paper-skeleton-text-short" />
          <div className="past-paper-skeleton-footer">
            <div className="past-paper-skeleton-tags">
              <div className="past-paper-skeleton-tag" />
              <div className="past-paper-skeleton-tag past-paper-skeleton-tag-short" />
            </div>
            <div className="past-paper-skeleton-button" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function QuestionBankLoadingStatus({ message = '正在加载题库…' }: { message?: string }) {
  return (
    <div className="question-bank-loading-status" role="status" aria-live="polite">
      <div className="question-bank-loading-row">
        <span className="question-bank-spinner" />
        <span>{message}</span>
      </div>
      <div className="question-bank-progress">
        <div className="question-bank-progress-bar" />
      </div>
    </div>
  )
}

export function PastPaperFilterSkeleton() {
  return (
    <div className="past-paper-filter-skeleton" aria-hidden="true">
      <div className="past-paper-skeleton-sort-row">
        <div className="past-paper-skeleton-sort-label" />
        <div className="past-paper-skeleton-sort-select" />
      </div>
      <div className="past-paper-skeleton-filter-row">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="past-paper-skeleton-filter-item" />
        ))}
      </div>
      <div className="past-paper-skeleton-search-row">
        <div className="past-paper-skeleton-search-input" />
        <div className="past-paper-skeleton-search-button" />
      </div>
    </div>
  )
}

export function PastPaperPageSkeleton() {
  const [message, setMessage] = useState('正在连接题库…')

  useEffect(() => {
    const timers = [
      setTimeout(() => setMessage('正在读取题目…'), 1000),
      setTimeout(() => setMessage('正在整理题库内容…'), 3000),
      setTimeout(() => setMessage('加载时间较长，正在重试…'), 8000)
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <main className="ui-page" data-main-content tabIndex={-1} aria-busy="true" aria-label="正在加载题库页面">
      <section className="analytics-main" style={{ paddingTop: 40 }}>
        <header className="page-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="past-paper-skeleton-back-button" />
            <div className="past-paper-skeleton-page-title" />
          </div>
        </header>

        <div className="past-paper-skeleton-panel">
          <PastPaperFilterSkeleton />
        </div>

        <QuestionBankLoadingStatus message={message} />

        <PastPaperSkeleton count={6} />

        <span className="sr-only" role="status" aria-live="polite">正在加载题库数据</span>
      </section>
    </main>
  )
}
