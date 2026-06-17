import { apiError, json } from '@/lib/http'

export async function GET(request: Request) {
  try {
    const endpoint = process.env.APP_UPDATE_URL
    if (!endpoint) {
      return json({ updateAvailable: false, latestVersion: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0', manualUpdateOnly: true })
    }
    const url = new URL(endpoint)
    const current = new URL(request.url)
    current.searchParams.forEach((value, key) => url.searchParams.set(key, value))
    const response = await fetch(url, { method: 'GET', cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    return json(data, { status: response.status })
  } catch (error) {
    return apiError(error, 'Could not check updates.')
  }
}
