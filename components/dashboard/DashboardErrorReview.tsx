'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { MaterialIcon } from '@/components/app-ui'
import type { ErrorPattern } from '@/lib/error-notebook-types'
import { ErrorCategoryLabels } from '@/lib/error-notebook-types'

type ErrorsData = {
  success: boolean
  patterns: ErrorPattern[]
  stats: { active: number }
}

async function fetchTopErrors(): Promise<ErrorsData | null> {
  try {
    const res = await fetch('/api/study-plan/errors?status=active&sort=count&limit=3')
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function DashboardErrorReview() {
  const { data, isLoading } = useSWR('dashboard-errors', fetchTopErrors, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  })

  if (isLoading || !data?.patterns || data.patterns.length === 0) return null

  return (
    <section className="dashboard-panel dashboard-license-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MaterialIcon name="bug_report" size={20} />
          需要复习的错误
        </h2>
        <Link className="ui-label" href="/study-plan/errors" style={{ color: 'var(--primary)' }}>
          查看全部
        </Link>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.patterns.map((pattern) => (
          <div
            key={pattern.id}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 10, background: 'var(--surface-container-low)',
              gap: 8, flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span className="task-badge" style={{ fontSize: 11 }}>
                {ErrorCategoryLabels[pattern.category] ?? pattern.category}
              </span>
              <span className="ui-body-md" style={{ fontSize: 14 }}>{pattern.title}</span>
              <span className="ui-label">出现 {pattern.occurrenceCount} 次</span>
            </div>
            <Link
              className="ui-primary-button"
              href="/study-plan/errors"
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              复习
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
