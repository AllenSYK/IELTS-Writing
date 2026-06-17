export const SupportFeedbackCategories = [
  '激活码问题',
  '设备绑定问题',
  'AI批改失败',
  'AI批改速度慢',
  '作文保存问题',
  '历史记录重复',
  '评分结果问题',
  '软件更新问题',
  '界面显示问题',
  '功能建议',
  '其他问题'
] as const

export type SupportFeedbackCategory = (typeof SupportFeedbackCategories)[number]

export const SupportFeedbackStatuses = ['pending', 'reviewing', 'resolved', 'closed'] as const
export type SupportFeedbackStatus = (typeof SupportFeedbackStatuses)[number]

export const SupportFeedbackPriorities = ['low', 'normal', 'high', 'urgent'] as const
export type SupportFeedbackPriority = (typeof SupportFeedbackPriorities)[number]

export const SupportFeedbackStatusLabels: Record<SupportFeedbackStatus, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭'
}

export const SupportFeedbackPriorityLabels: Record<SupportFeedbackPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急'
}

export type SupportFaqAction = {
  label: string
  href?: string
  kind?: 'feedback'
}

export type SupportFaq = {
  title: string
  category: SupportFeedbackCategory
  steps: string[]
  actions: SupportFaqAction[]
}

export const SupportFaqs: SupportFaq[] = [
  {
    title: '激活码无法使用怎么办？',
    category: '激活码问题',
    steps: ['检查激活码是否输入完整。', '确认横线、字母和数字没有混淆。', '确认网络连接正常。', '检查激活码是否过期、暂停或撤销。', '如果提示设备数量已满，请提交反馈并只提供激活码尾号。'],
    actions: [{ label: '提交激活码反馈', kind: 'feedback' }]
  },
  {
    title: '已经换电脑或设备数量已满怎么办？',
    category: '设备绑定问题',
    steps: ['不要公开发送完整激活码。', '提交反馈时提供激活码尾号、旧设备说明和新设备系统。', '管理员会检查绑定设备数量和最近验证记录。', '必要时会解绑旧设备后让你重新激活。'],
    actions: [{ label: '提交设备绑定反馈', kind: 'feedback' }]
  },
  {
    title: 'AI批改失败或显示超时怎么办？',
    category: 'AI批改失败',
    steps: ['先确认作文仍保留在编辑器或草稿中。', '检查网络连接后等待片刻再重试。', '不要连续快速重复提交。', '多次失败时提交反馈并附带最近错误码。'],
    actions: [{ label: '提交批改失败反馈', kind: 'feedback' }]
  },
  {
    title: 'AI批改很慢怎么办？',
    category: 'AI批改速度慢',
    steps: ['长作文和完整模考需要更久处理。', '检查网络是否稳定。', '如果长时间卡住，请提交反馈并附带提交时间。', '管理员会查看请求耗时、模型耗时和重试记录。'],
    actions: [{ label: '提交速度问题', kind: 'feedback' }]
  },
  {
    title: '作文没有保存怎么办？',
    category: '作文保存问题',
    steps: ['先打开 History 页面检查是否已经生成记录。', '重新打开应用后回到对应 Task 页面查看草稿。', '不要清除应用数据。', '提交反馈时说明题型、提交时间和是否看到批改结果。'],
    actions: [{ label: '打开 History', href: '/history' }, { label: '提交保存问题', kind: 'feedback' }]
  },
  {
    title: 'History 出现重复记录怎么办？',
    category: '历史记录重复',
    steps: ['刷新 History 页面后再次查看。', '确认是否确实提交了两次独立作文。', '如果同一次提交出现两条相同记录，请提交反馈。', '管理员会检查 record ID、submissionId 和本地合并记录。'],
    actions: [{ label: '提交历史记录反馈', kind: 'feedback' }]
  },
  {
    title: '评分结果看起来不合理怎么办？',
    category: '评分结果问题',
    steps: ['打开结果页查看四项评分和批注。', '记录批改时间、Task 类型和反馈编号。', '提交反馈时描述你认为不合理的评分维度。', '不要在公开渠道发送隐私信息。'],
    actions: [{ label: '提交评分反馈', kind: 'feedback' }]
  },
  {
    title: '如何获取最新版本？',
    category: '软件更新问题',
    steps: ['当前使用手动更新模式。', '软件会显示当前版本和更新状态。', '发现新版本后请从开发者提供的正式链接下载。', '更新后请完全退出旧版再打开新版。'],
    actions: [{ label: '提交更新问题', kind: 'feedback' }]
  },
  {
    title: '界面显示异常怎么办？',
    category: '界面显示问题',
    steps: ['记录出现异常的页面。', '尝试调整窗口大小后再次查看。', '提交反馈时说明系统版本和应用版本。', '如果可以，请描述按钮、弹窗或内容重叠的位置。'],
    actions: [{ label: '提交界面反馈', kind: 'feedback' }]
  }
]

export const SupportAdminRecommendations: Record<SupportFeedbackCategory, string[]> = {
  激活码问题: ['检查激活码状态。', '检查到期时间。', '检查最大设备数量。', '检查是否暂停或撤销。', '必要时解绑旧设备。'],
  设备绑定问题: ['检查当前绑定设备列表。', '核对设备最近验证时间。', '确认是否允许用户自助解绑。', '必要时解绑旧设备并记录管理备注。'],
  AI批改失败: ['检查错误码。', '检查模型服务状态。', '检查是否发生超时。', '检查 429 或 5xx。', '查看是否触发重试。'],
  AI批改速度慢: ['查看总请求耗时。', '查看模型耗时。', '查看重试次数。', '查看是否命中缓存。', '查看正式版和开发版调用链。'],
  作文保存问题: ['检查本地草稿键。', '检查提交后是否生成 record ID。', '检查结果页跳转是否中断。', '确认用户是否清除了应用数据。'],
  历史记录重复: ['检查 record ID。', '检查 submissionId。', '检查本地和云端是否重复合并。', '检查重复保存。'],
  评分结果问题: ['核对 Task 类型。', '检查四项评分是否完整。', '查看原文批注是否能定位。', '检查模型返回内容是否符合评分 schema。'],
  软件更新问题: ['检查当前版本和最新版本。', '确认用户打开的是否是根目录或正式安装版。', '检查更新模式是否为手动联系。', '确认旧版进程是否已经退出。'],
  界面显示问题: ['确认页面路径和窗口尺寸。', '检查是否为移动窄屏布局。', '查看是否有固定层级遮挡。', '复现后记录截图和系统版本。'],
  功能建议: ['判断是否属于现有路线图。', '记录用户场景和频率。', '标记优先级。', '必要时拆分为独立需求。'],
  其他问题: ['先补全问题类型。', '查看脱敏诊断信息。', '确认是否需要用户补充复现步骤。', '处理后更新管理备注。']
}

export function isSupportFeedbackCategory(value: unknown): value is SupportFeedbackCategory {
  return typeof value === 'string' && SupportFeedbackCategories.includes(value as SupportFeedbackCategory)
}

export function normalizeSupportFeedbackCategory(value: unknown): SupportFeedbackCategory {
  if (isSupportFeedbackCategory(value)) return value
  if (value === 'AI批改问题') return 'AI批改失败'
  if (value === '历史记录问题') return '历史记录重复'
  if (value === '评分问题') return '评分结果问题'
  return '其他问题'
}

export function isSupportFeedbackStatus(value: unknown): value is SupportFeedbackStatus {
  return typeof value === 'string' && SupportFeedbackStatuses.includes(value as SupportFeedbackStatus)
}

export function isSupportFeedbackPriority(value: unknown): value is SupportFeedbackPriority {
  return typeof value === 'string' && SupportFeedbackPriorities.includes(value as SupportFeedbackPriority)
}

export function defaultSupportFeedbackPriority(category: SupportFeedbackCategory): SupportFeedbackPriority {
  if (category === '激活码问题' || category === '设备绑定问题' || category === 'AI批改失败') return 'high'
  if (category === 'AI批改速度慢' || category === '作文保存问题' || category === '历史记录重复' || category === '评分结果问题') return 'normal'
  return 'low'
}

export function supportFeedbackDisplayId(id: string) {
  return `FB-${String(id).slice(0, 8).toUpperCase()}`
}

export function getSupportAdminRecommendations(category: unknown) {
  return SupportAdminRecommendations[normalizeSupportFeedbackCategory(category)]
}
