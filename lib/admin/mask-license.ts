/**
 * 激活码掩码工具函数
 * 
 * 设计原则：
 * 1. 只保留一份共享实现
 * 2. 输入为空安全处理
 * 3. 短码有合理行为
 * 4. 不泄露过多字符
 * 5. 前后显示长度统一
 * 6. UI 和导出使用同一规则
 * 
 * 掩码规则：
 * - 短码（<=8字符）：显示前2后2，中间用••••替代
 * - 长码（>8字符）：显示前4后4，中间用••••••••替代
 * 
 * 示例：
 * - "ABCD" → "AB••CD"
 * - "ABCD-EFGH-IJKL-MNOP" → "ABCD••••••••MNOP"
 */
export function maskLicenseCode(value?: string | null): string {
  if (!value) return ''
  
  // 移除可能的前缀格式
  const cleanValue = value.replace(/^(IELTS-)/, '')
  
  if (cleanValue.length <= 8) {
    // 短码：显示前2后2
    if (cleanValue.length <= 4) {
      return `${cleanValue.slice(0, 1)}••••${cleanValue.slice(-1)}`
    }
    return `${cleanValue.slice(0, 2)}••••${cleanValue.slice(-2)}`
  }
  
  // 长码：显示前4后4
  return `${cleanValue.slice(0, 4)}••••••••${cleanValue.slice(-4)}`
}

/**
 * 带前缀的激活码掩码
 * 
 * 用于显示完整的激活码格式（包括可能的前缀）
 */
export function maskLicenseCodeWithPrefix(value?: string | null, prefix?: string): string {
  if (!value) {
    return `${prefix || 'IELTS-'}••••-••••-••••`
  }
  
  // 如果是标准格式（IELTS-XXXX-XXXX-XXXX）
  const parts = value.split('-')
  if (parts.length === 4 && parts[0] === 'IELTS') {
    return `${parts[0]}-${parts[1]}-••••-${parts[3]}`
  }
  
  // 否则使用通用掩码
  return maskLicenseCode(value)
}

/**
 * 根据不可逆前缀生成列表展示文本，避免为了显示掩码而传输完整激活码。
 */
export function maskLicensePrefix(prefix?: string | null): string {
  if (!prefix) return 'IELTS-••••-••••-••••'
  return `${prefix}-••••-••••`
}

/**
 * 验证激活码格式
 */
export function isValidLicenseCodeFormat(value: string): boolean {
  // 标准格式：IELTS-XXXX-XXXX-XXXX
  const standardFormat = /^IELTS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
  // 简单格式：至少8位字母数字
  const simpleFormat = /^[A-Z0-9]{8,}$/
  
  return standardFormat.test(value) || simpleFormat.test(value)
}

/**
 * 生成激活码显示文本（用于导出等场景）
 * 
 * 根据安全要求决定是否显示完整码
 */
export function formatLicenseCodeForExport(
  value: string | null | undefined, 
  showFull: boolean = false
): string {
  if (!value) return ''
  
  if (showFull) {
    return value
  }
  
  return maskLicenseCode(value)
}

/**
 * 批量掩码处理
 * 
 * 用于列表导出等场景
 */
export function maskLicenseCodes(values: (string | null | undefined)[]): string[] {
  return values.map(maskLicenseCode)
}
