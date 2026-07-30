import type { CSSProperties } from 'react'

export const styles: Record<string, CSSProperties> = {
  emptyCard: {
    textAlign: 'center',
    padding: '48px 24px',
    borderRadius: 28
  },
  progressCard: {
    padding: 24,
    borderRadius: 28,
    marginBottom: 24,
    background: 'var(--surface-container-high)',
    border: '1px solid var(--glass-border-1)'
  },
  replanBanner: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 24,
    background: 'var(--surface-container-high)',
    border: '1px solid var(--glass-border-1)'
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    background: 'var(--surface-container-low)',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    background: 'var(--primary)',
    transition: 'width 0.3s ease'
  },
  failedBanner: {
    padding: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    marginBottom: 24
  },
  overviewCard: {
    padding: 20,
    borderRadius: 24
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 12
  },
  overviewItem: {
    padding: '10px 12px',
    borderRadius: 14,
    background: 'var(--surface-container-low)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  calendarCard: {
    padding: 20,
    borderRadius: 24
  },
  calendarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  calendarWeekDays: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
    marginBottom: 4
  },
  calendarWeekDay: {
    textAlign: 'center',
    fontSize: 13,
    color: 'var(--text-secondary)',
    padding: '4px 0',
    fontWeight: 600
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4
  },
  calendarCellEmpty: {
    borderRadius: 16,
    minHeight: 148
  },
  calendarCell: {
    borderRadius: 16,
    border: '2px solid transparent',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    transition: 'border-color 0.15s, background 0.15s',
    minHeight: 148,
    overflow: 'hidden'
  },
  calendarDayNum: {
    fontSize: 14,
    lineHeight: 1,
    fontWeight: 400
  },
  calendarTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    flex: 1,
    overflow: 'hidden'
  },
  calendarTaskLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 0
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    display: 'inline-block',
    flexShrink: 0
  },
  calendarMinutes: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    lineHeight: 1,
    marginTop: 'auto'
  },
  legend: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--glass-border-1)'
  },
  todayCard: {
    padding: 20,
    borderRadius: 24
  },
  todayTaskRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderRadius: 14,
    background: 'var(--surface-container-low)',
    gap: 8
  },
  taskMiniCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 12,
    background: 'var(--surface-container-low)',
    cursor: 'pointer'
  },
  bottomActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap'
  }
}
