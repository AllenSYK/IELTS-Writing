import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import { UserSessionProvider } from '@/components/auth/UserSessionProvider'
import { AppInteractionProvider } from '@/components/interaction-system'
import { UserPerformanceProvider } from '@/components/performance/UserPerformanceProvider'
import { UserProfileProvider } from '@/stores/user-profile-store'
import './globals.css'
import './admin.css'

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
            <UserPerformanceProvider>
              <UserProfileProvider>
                <AppShell>{children}</AppShell>
              </UserProfileProvider>
            </UserPerformanceProvider>
          </AppInteractionProvider>
        </UserSessionProvider>
      </body>
    </html>
  )
}
