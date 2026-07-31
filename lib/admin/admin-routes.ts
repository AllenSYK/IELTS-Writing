import { BRAND_NAME } from '@/lib/brand'

export interface AdminRouteMeta {
  /** 匹配函数，使用最长路径优先原则 */
  match: (pathname: string) => boolean
  /** 面包屑和浏览器标题 */
  title: string
  /** 顶栏显示的简短标签 */
  eyebrow: string
  /** 搜索配置 */
  search?: {
    placeholder: string
    targetPath: string
    paramName: string
  }
}

/**
 * 管理端路由元数据配置
 * 
 * 设计原则：
 * 1. 最长路径优先匹配
 * 2. 动态路由正确匹配
 * 3. 子页面不回退到"管理中心"
 * 4. 搜索行为与当前模块相关
 */
export const adminRouteMeta: AdminRouteMeta[] = [
  // 编辑真题 - 最长路径优先
  {
    match: (path) => /^\/admin\/past-papers\/[^/]+\/edit$/.test(path),
    title: '编辑真题',
    eyebrow: 'Past Papers',
    search: {
      placeholder: '搜索题目关键词',
      targetPath: '/admin/past-papers',
      paramName: 'search',
    },
  },
  // 真题题库
  {
    match: (path) => path.startsWith('/admin/past-papers'),
    title: '真题题库',
    eyebrow: 'Past Papers',
    search: {
      placeholder: '搜索题目关键词',
      targetPath: '/admin/past-papers',
      paramName: 'search',
    },
  },
  // 激活码管理
  {
    match: (path) => path.startsWith('/admin/licenses'),
    title: '激活码管理',
    eyebrow: 'Licenses',
    search: {
      placeholder: '搜索激活码、邮箱或用户 ID',
      targetPath: '/admin/licenses',
      paramName: 'search',
    },
  },
  // 邮箱绑定
  {
    match: (path) => path.startsWith('/admin/bindings'),
    title: '邮箱绑定',
    eyebrow: 'Bindings',
    search: {
      placeholder: '搜索邮箱或绑定关系',
      targetPath: '/admin/bindings',
      paramName: 'search',
    },
  },
  // 用户管理
  {
    match: (path) => path.startsWith('/admin/users'),
    title: '用户管理',
    eyebrow: 'Users',
    search: {
      placeholder: '搜索用户 ID、邮箱或手机号',
      targetPath: '/admin/users',
      paramName: 'search',
    },
  },
  // 管理设置
  {
    match: (path) => path.startsWith('/admin/settings'),
    title: '系统设置',
    eyebrow: 'Settings',
  },
  // AI 模型配置
  {
    match: (path) => path.startsWith('/admin/models'),
    title: '模型配置',
    eyebrow: 'AI Models',
  },
  // 管理概览 - 默认兜底
  {
    match: (path) => path === '/admin',
    title: '管理概览',
    eyebrow: 'Overview',
  },
]

/**
 * 根据路径获取路由元数据
 * @param pathname 当前路径
 * @returns 匹配的路由元数据，默认返回管理概览
 */
export function getAdminRouteMeta(pathname: string): AdminRouteMeta {
  return adminRouteMeta.find((item) => item.match(pathname)) ?? adminRouteMeta[adminRouteMeta.length - 1]
}

/**
 * 管理端页面标题映射（用于浏览器标题）
 */
export const adminPageTitles: Record<string, string> = {
  '/admin': '管理概览',
  '/admin/licenses': '激活码管理',
  '/admin/bindings': '邮箱绑定',
  '/admin/users': '用户管理',
  '/admin/past-papers': '真题题库',
  '/admin/past-papers/new': '新增真题',
  '/admin/models': '模型配置',
  '/admin/settings': '系统设置',
}

/**
 * 获取浏览器标题
 * @param pathname 当前路径
 * @returns 完整的浏览器标题
 */
export function getAdminBrowserTitle(pathname: string): string {
  const meta = getAdminRouteMeta(pathname)
  return `${meta.title} | ${BRAND_NAME} 管理中心`
}
