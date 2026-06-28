/**
 * 数字工具函数
 * 
 * 设计原则：
 * 1. 处理各种边界情况
 * 2. 明确 fallback 行为
 * 3. 不把 "12abc" 当成 12
 * 4. 支持数值字符串和数字类型
 */

/**
 * 将未知值转换为有限数字
 * 
 * @param value 未知值
 * @param fallback 默认值（当转换失败时返回）
 * @returns 有限数字或 fallback
 * 
 * 处理情况：
 * - number 类型：如果有限则直接返回，否则返回 fallback
 * - string 类型：如果非空且可解析为有限数字则返回，否则返回 fallback
 * - null/undefined：返回 fallback
 * - 其他类型：返回 fallback
 */
export function toFiniteNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }
  
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  
  return fallback
}

/**
 * 将查询参数转换为数字（用于 URL 参数解析）
 * 
 * @param value 查询参数值（string | null）
 * @param fallback 默认值
 * @returns 转换后的数字
 * 
 * 用法：
 * ```ts
 * const url = new URL(request.url)
 * const page = toQueryParamNumber(url.searchParams.get('page'), 1)
 * ```
 */
export function toQueryParamNumber(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 将值转换为整数
 * 
 * @param value 未知值
 * @param fallback 默认整数
 * @returns 整数或 fallback
 */
export function toInteger(value: unknown, fallback: number = 0): number {
  const num = toFiniteNumber(value, fallback)
  return Math.floor(num)
}

/**
 * 将值转换为正整数（至少为 1）
 * 
 * @param value 未知值
 * @param fallback 默认正整数
 * @returns 正整数或 fallback
 */
export function toPositiveInteger(value: unknown, fallback: number = 1): number {
  const num = toInteger(value, fallback)
  return Math.max(1, num)
}

/**
 * 将值限制在指定范围内
 * 
 * @param value 数值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数值
 */
export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 解析分页参数
 * 
 * @param page 页码参数
 * @param pageSize 每页条数参数
 * @param defaultPageSize 默认每页条数
 * @param maxPageSize 最大每页条数
 * @returns 解析后的分页参数
 */
export function parsePaginationParams(
  page: string | null | undefined,
  pageSize: string | null | undefined,
  defaultPageSize: number = 50,
  maxPageSize: number = 200
): { page: number; pageSize: number } {
  return {
    page: Math.max(1, toQueryParamNumber(page, 1)),
    pageSize: clampNumber(toQueryParamNumber(pageSize, defaultPageSize), 1, maxPageSize)
  }
}
