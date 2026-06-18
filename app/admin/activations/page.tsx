import { redirect } from 'next/navigation'

export default async function LegacyAdminActivationsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value)
    else value?.forEach((item) => query.append(key, item))
  }
  redirect(`/admin/bindings${query.size ? `?${query.toString()}` : ''}`)
}
