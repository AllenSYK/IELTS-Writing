'use client'

import { useState } from 'react'
import { CenteredDialog } from '@/components/ui/CenteredDialog'

export function CrossBorderConsentDialog({
  open,
  onConsent,
  onDecline
}: {
  open: boolean
  onConsent: () => void
  onDecline: () => void
}) {
  const [checked, setChecked] = useState(false)

  return (
    <CenteredDialog
      open={open}
      title="个人信息跨境传输说明"
      onClose={onDecline}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ui-secondary-button" type="button" onClick={onDecline}>
            暂不同意
          </button>
          <button
            className="ui-primary-button"
            type="button"
            disabled={!checked}
            onClick={onConsent}
          >
            同意并继续
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="ui-body-md">
          为向您提供账号登录、作文保存、AI 批改、学习规划和错误分析等功能，您的部分个人信息可能传输至境外服务器、数据库或技术服务商进行存储和处理。
        </p>
        <p className="ui-body-md">
          可能涉及的信息包括账号邮箱、作文内容、批改结果、学习记录和必要的系统日志。
        </p>
        <p className="ui-body-md">
          您可以查看《隐私政策》中的「个人信息跨境传输」和「境外接收方说明」章节，了解境外接收方、处理目的、信息类型及权利行使方式。
        </p>
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-container-low)' }}>
          <p className="ui-label" style={{ marginBottom: 4 }}>拒绝后的影响：</p>
          <p className="ui-body-md" style={{ fontSize: 13 }}>
            依赖境外服务的部分功能将无法使用，包括作文保存、AI 批改、学习规划和错误分析。基础页面浏览不受影响。
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span className="ui-body-md" style={{ fontSize: 13 }}>
            我已阅读并单独同意个人信息跨境传输
          </span>
        </label>
      </div>
    </CenteredDialog>
  )
}

export function CrossBorderConsentCheckbox({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const [showDialog, setShowDialog] = useState(false)

  return (
    <>
      <div className="agreement-row">
        <label className="agreement-consent">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.checked) {
                setShowDialog(true)
              } else {
                onChange(false)
              }
            }}
          />
          <span className="agreement-copy">
            我已阅读并同意
            <button type="button" onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setShowDialog(true)
            }}>《个人信息跨境传输说明》</button>
          </span>
        </label>
      </div>

      <CrossBorderConsentDialog
        open={showDialog}
        onConsent={() => {
          onChange(true)
          setShowDialog(false)
        }}
        onDecline={() => {
          onChange(false)
          setShowDialog(false)
        }}
      />
    </>
  )
}
