import type { Metadata } from 'next'
import { UserSessionProvider } from '@/components/auth/UserSessionProvider'
import { AppInteractionProvider } from '@/components/interaction-system'
import { AppRuntime } from '@/components/layout/AppRuntime'
import './globals.css'
import './styles/web-audit-refactor.css'

export const metadata: Metadata = {
  title: '空与梦 IELTS Writing',
  description: 'IELTS writing practice, feedback, progress tracking, and account management.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <UserSessionProvider>
          <AppInteractionProvider>
            <AppRuntime>{children}</AppRuntime>
          </AppInteractionProvider>
        </UserSessionProvider>
      </body>
    </html>
  )
}
