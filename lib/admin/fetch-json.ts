export async function adminJsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data.success) {
    throw new Error(data.message || '后台数据加载失败。')
  }

  return data as T
}
