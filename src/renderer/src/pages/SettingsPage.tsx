import { useEffect, useState } from 'react'
import { Button, InputNumber, Space, Tag, Typography, message } from 'antd'
import { FolderOpenOutlined, UndoOutlined } from '@ant-design/icons'
import { getApi } from '../api'

interface AppSettingsView {
  exportsPath: string
  resolvedExportsPath: string
  defaultExportsPath: string
  isCustomExports: boolean
  syncIntervalMinutes: number
  syncLookbackDays: number
  defaultSyncIntervalMinutes: number
  defaultSyncLookbackDays: number
}

/**
 * 设置页：同步参数、材料落盘目录等应用级配置
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettingsView | null>(null)
  const [loading, setLoading] = useState(false)
  const [intervalDraft, setIntervalDraft] = useState(30)
  const [lookbackDraft, setLookbackDraft] = useState(90)
  const [savingSync, setSavingSync] = useState(false)

  const applySettings = (next: AppSettingsView): void => {
    setSettings(next)
    setIntervalDraft(next.syncIntervalMinutes)
    setLookbackDraft(next.syncLookbackDays)
  }

  const refresh = async (): Promise<void> => {
    applySettings(await getApi().settings.get())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const pickDir = async (): Promise<void> => {
    setLoading(true)
    try {
      const next = await getApi().settings.pickExportsDir()
      if (!next) return
      applySettings(next)
      message.success('已更新材料落盘目录')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const resetDefault = async (): Promise<void> => {
    setLoading(true)
    try {
      applySettings(await getApi().settings.setExportsPath(''))
      message.success('已恢复默认材料目录')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const saveSync = async (): Promise<void> => {
    if (!settings) return
    setSavingSync(true)
    try {
      let next = settings
      if (intervalDraft !== settings.syncIntervalMinutes) {
        next = await getApi().settings.setSyncIntervalMinutes(intervalDraft)
      }
      if (lookbackDraft !== next.syncLookbackDays) {
        next = await getApi().settings.setSyncLookbackDays(lookbackDraft)
      }
      applySettings(next)
      message.success('已保存同步设置')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingSync(false)
    }
  }

  const defaultInterval = settings?.defaultSyncIntervalMinutes ?? 30
  const defaultLookback = settings?.defaultSyncLookbackDays ?? 90

  const syncDirty =
    settings != null &&
    (intervalDraft !== settings.syncIntervalMinutes ||
      lookbackDraft !== settings.syncLookbackDays)

  return (
    <div className="page-card">
      <div className="page-header">
        <h2 className="page-title">设置</h2>
      </div>

      <div className="settings-block">
        <h3>同步</h3>
        <p className="page-desc" style={{ marginBottom: 12 }}>
          定时同步对所有账号生效。回溯天数仅在首次同步或重置提交记录后使用，之后按上次同步时间增量拉取。
        </p>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap align="center">
            <span style={{ width: 96 }}>同步间隔</span>
            <InputNumber
              min={5}
              max={1440}
              value={intervalDraft}
              onChange={(v) =>
                setIntervalDraft(typeof v === 'number' ? v : defaultInterval)
              }
              addonAfter="分钟"
              style={{ width: 160 }}
            />
          </Space>
          <Space wrap align="center">
            <span style={{ width: 96 }}>回溯天数</span>
            <InputNumber
              min={1}
              max={3650}
              value={lookbackDraft}
              onChange={(v) =>
                setLookbackDraft(typeof v === 'number' ? v : defaultLookback)
              }
              addonAfter="天"
              style={{ width: 160 }}
            />
          </Space>
          <div>
            <Button
              type="primary"
              loading={savingSync}
              disabled={!syncDirty}
              onClick={() => void saveSync()}
            >
              保存
            </Button>
          </div>
        </Space>
      </div>

      <div className="settings-block">
        <h3>材料落盘目录</h3>
        <p className="page-desc" style={{ marginBottom: 0 }}>
          同步材料与导出的日/周/月报 Markdown 都会写到这里。路径可复制后在资源管理器中打开。
        </p>
        <div className="settings-path-box">
          <Space wrap size={[8, 8]}>
            {settings?.isCustomExports ? <Tag color="blue">自定义</Tag> : <Tag>默认</Tag>}
            <Typography.Text copyable={Boolean(settings?.resolvedExportsPath)}>
              {settings?.resolvedExportsPath || '加载中…'}
            </Typography.Text>
          </Space>
        </div>
        <Space wrap style={{ marginTop: 12 }}>
          <Button
            type="primary"
            icon={<FolderOpenOutlined />}
            loading={loading}
            onClick={() => void pickDir()}
          >
            更改目录
          </Button>
          {settings?.isCustomExports ? (
            <Button
              icon={<UndoOutlined />}
              loading={loading}
              onClick={() => void resetDefault()}
            >
              恢复默认
            </Button>
          ) : null}
        </Space>
        {settings?.isCustomExports ? (
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            默认目录：{settings.defaultExportsPath}
          </p>
        ) : null}
      </div>
    </div>
  )
}
