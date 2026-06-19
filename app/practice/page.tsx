import { WritingModeSelector } from '@/components/practice/WritingModeSelector'
import { GlassPanel, MaterialIcon } from '@/components/app-ui'

type PracticeFocus = 'grammar' | 'lexical' | 'cohesion' | 'task'

const focusLabels: Record<PracticeFocus, { title: string; description: string; icon: string }> = {
  grammar: { title: '语法准确性', description: '优先关注主谓一致、句式和标点准确性。', icon: 'spellcheck' },
  lexical: { title: '词汇资源', description: '优先关注词汇替换、搭配和表达精确度。', icon: 'menu_book' },
  cohesion: { title: '结构与衔接', description: '优先关注段落推进、连接词和逻辑清晰度。', icon: 'schema' },
  task: { title: '任务回应', description: '优先关注审题、观点展开和任务完成度。', icon: 'assignment_turned_in' }
}

const modes = [
  {
    mode: 'task1',
    icon: 'bar_chart',
    minutes: '20 mins',
    title: 'Task 1',
    subtitle: 'Academic / General',
    words: '150+ words',
    action: 'Start',
    focuses: ['task', 'lexical', 'cohesion'] as PracticeFocus[]
  },
  {
    mode: 'task2',
    icon: 'edit_document',
    minutes: '40 mins',
    title: 'Task 2',
    subtitle: 'Essay Writing',
    words: '250+ words',
    action: 'Start',
    primary: true,
    focuses: ['grammar', 'lexical', 'cohesion', 'task'] as PracticeFocus[]
  },
  {
    mode: 'mock',
    icon: 'timer',
    minutes: '60 mins',
    title: '完整测试',
    subtitle: 'Task 1 + Task 2',
    words: '400+ words',
    action: 'Start Test',
    featured: true,
    focuses: ['grammar', 'lexical', 'cohesion', 'task'] as PracticeFocus[]
  }
] as const

export default async function PracticePage({
  searchParams
}: {
  searchParams?: Promise<{ focus?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const focus = params.focus && params.focus in focusLabels ? (params.focus as PracticeFocus) : null

  return (
    <main className="mode-page" data-main-content tabIndex={-1}>
      <section className="mode-main">
        <header className="mode-header">
          <h1 className="ui-title-display">IELTS Writing</h1>
          <p className="ui-body-lg">选择练习模式，按考试时间完成写作。</p>
        </header>

        {focus ? (
          <GlassPanel level={2} className="practice-focus-banner">
            <span className="mode-icon">
              <MaterialIcon name={focusLabels[focus].icon} size={24} />
            </span>
            <div>
              <span className="ui-label">推荐练习重点</span>
              <h2 className="ui-title-md">{focusLabels[focus].title}</h2>
              <p className="ui-body-md">{focusLabels[focus].description}</p>
            </div>
          </GlassPanel>
        ) : null}

        <WritingModeSelector modes={modes.map((mode) => ({ ...mode, recommended: Boolean(focus && mode.focuses.includes(focus)) }))} />
      </section>
    </main>
  )
}
