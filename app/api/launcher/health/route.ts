import packageJson from '@/package.json'

export async function GET() {
  return Response.json(
    {
      ok: true,
      app: 'ielts-writing-desktop',
      version: packageJson.version,
      adminPath: '/admin',
      userPath: '/'
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  )
}
