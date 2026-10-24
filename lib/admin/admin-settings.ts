'use client'

import { useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { adminJsonFetcher } from '@/lib/admin/fetch-json'
import { ADMIN_CACHE_KEYS } from '@/components/admin/AdminDataProvider'
import {
  AdminDisplayDefaults,
  setActiveAdminDisplayPreferences
} from '@/lib/admin/admin-display-config'

export type AdminDisplaySettings = {
  defaultPlan: string
  defaultDurationDays: number
  defaultMaxActivations: number
  expiringReminderDays: number
  pageSize: number
  dateFormat: string
  timezone: string
}

export const AdminSettingsDefaults: AdminDisplaySettings = {
  defaultPlan: 'standard',
  defaultDurationDays: 365,
  defaultMaxActivations: 1,
  expiringReminderDays: 14,
  pageSize: 50,
  dateFormat: 'zh-CN',
  timezone: 'Asia/Shanghai'
}

type AdminSettingsResponse = {
  settings?: Partial<AdminDisplaySettings>
  updatedAt?: string
}

function normalizeSettings(partial?: Partial<AdminSettingsResponse['settings']>): AdminDisplaySettings {
  return { ...AdminSettingsDefaults, ...(partial ?? {}) }
}

/**
 * 统一读取管理端系统设置。
 * 表单默认值、分页容量、日期格式与提醒窗口都应通过该 Hook 获取。
 */
export function useAdminSettings() {
  const { data, error, isLoading } = useSWR<AdminSettingsResponse>(
    ADMIN_CACHE_KEYS.SETTINGS,
    adminJsonFetcher,
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnReconnect: true
    }
  )

  const settings = useMemo(() => normalizeSettings(data?.settings), [data?.settings])

  // 同步日期/时区配置，供 formatAdminDate 在同一渲染周期内使用。
  setActiveAdminDisplayPreferences({
    dateFormat: settings.dateFormat || AdminDisplayDefaults.dateFormat,
    timezone: settings.timezone || AdminDisplayDefaults.timezone
  })

  useEffect(() => {
    setActiveAdminDisplayPreferences({
      dateFormat: settings.dateFormat || AdminDisplayDefaults.dateFormat,
      timezone: settings.timezone || AdminDisplayDefaults.timezone
    })
  }, [settings.dateFormat, settings.timezone])

  return { settings, isLoading, error, updatedAt: data?.updatedAt ?? null }
}
