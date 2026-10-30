import { useEffect, useState } from 'react'
import {
  Button,
  Input,
  InputNumber,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  QuestionCircleOutlined,
  UndoOutlined
} from '@ant-design/icons'
import type { AppSettingsView, McpConfigStatus } from '@shared/types'
import { getApi } from '../api'

type SettingsTabKey = 'general' | 'ai' | 'mcp'

/**
 * 设置页：常规 / AI / MCP 分 Tab 配置
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettingsView | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTabKey>('general')
  const [loading, setLoading] = useState(false)
  const [intervalDraft, setIntervalDraft] = useState(30)
  const [lookbackDraft, setLookbackDraft] = useState(90)
  const [savingSync, setSavingSync] = useState(false)

  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiSystemPrompt, setAiSystemPrompt] = useState('')
  const [aiUserPromptTemplate, setAiUserPromptTemplate] = useState('')
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState('')
  const [savingAi, setSavingAi] = useState(false)
  const [testingAi, setTestingAi] = useState(false)

  const [mcpStatus, setMcpStatus] = useState<McpConfigStatus | null>(null)
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpEnabledDraft, setMcpEnabledDraft] = useState(true)
  const [mcpPortDraft, setMcpPortDraft] = useState(39281)

  const applySettings = (next: AppSettingsView): void => {
    setSettings(next)
    setIntervalDraft(next.syncIntervalMinutes)
    setLookbackDraft(next.syncLookbackDays)
    setAiBaseUrl(next.aiBaseUrl || next.defaultAiBaseUrl)
    setAiModel(next.aiModel || next.defaultAiModel)
    setAiSystemPrompt(next.aiSystemPrompt || next.defaultAiSystemPrompt)
    setAiUserPromptTemplate(
      next.aiUserPromptTemplate || next.defaultAiUserPromptTemplate
    )
    if (typeof next.mcpEnabled === 'boolean') setMcpEnabledDraft(next.mcpEnabled)
    if (typeof next.mcpPort === 'number') setMcpPortDraft(next.mcpPort)
  }

  const refresh = async (): Promise<void> => {
    applySettings(await getApi().settings.get())
  }

  const refreshMcp = async (): Promise<void> => {
    const api = getApi()
    if (typeof api.mcp?.getStatus !== 'function') {
      throw new Error(
        '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
      )
    }
    const status = await api.mcp.getStatus()
    setMcpStatus(status)
    setMcpEnabledDraft(status.enabled)
    setMcpPortDraft(status.port)
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (activeTab !== 'mcp') return
    void refreshMcp().catch((e) => {
      message.error(e instanceof Error ? e.message : String(e))
    })
  }, [activeTab])

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

  const saveAi = async (): Promise<void> => {
    setSavingAi(true)
    try {
      const settingsApi = getApi().settings
      if (typeof settingsApi.setAi !== 'function') {
        throw new Error(
          '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
        )
      }
      // Key 与配置一次写入；暂不定时日报
      const next = await settingsApi.setAi({
        aiEnabled: false,
        aiBaseUrl,
        aiModel,
        aiSystemPrompt,
        aiUserPromptTemplate,
        apiKey: aiApiKeyDraft.trim() || undefined
      })
      setAiApiKeyDraft('')
      applySettings(next)
      message.success('已保存 AI 配置')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingAi(false)
    }
  }

  const clearAiKey = async (): Promise<void> => {
    setSavingAi(true)
    try {
      const settingsApi = getApi().settings
      if (typeof settingsApi.clearAiApiKey !== 'function') {
        throw new Error(
          '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
        )
      }
      applySettings(await settingsApi.clearAiApiKey())
      setAiApiKeyDraft('')
      message.success('已清除 API Key')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingAi(false)
    }
  }

  const testAi = async (): Promise<void> => {
    setTestingAi(true)
    try {
      const api = getApi()
      if (typeof api.settings.setAi !== 'function' || typeof api.ai?.testConnection !== 'function') {
        throw new Error(
          '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
        )
      }
      await api.settings.setAi({
        aiEnabled: false,
        aiBaseUrl,
        aiModel,
        apiKey: aiApiKeyDraft.trim() || undefined
      })
      setAiApiKeyDraft('')
      const r = await api.ai.testConnection()
      applySettings(await api.settings.get())
      message.success(`连接成功：${r.reply}`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTestingAi(false)
    }
  }

  const copyMcpConfig = async (): Promise<void> => {
    if (!mcpStatus?.configJson) return
    try {
      await navigator.clipboard.writeText(mcpStatus.configJson)
      message.success('已复制 MCP 配置 JSON')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const copyMcpEndpoint = async (): Promise<void> => {
    if (!mcpStatus?.endpointUrl) return
    try {
      await navigator.clipboard.writeText(mcpStatus.endpointUrl)
      message.success('已复制端点 URL')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const saveMcp = async (): Promise<void> => {
    setMcpBusy(true)
    try {
      const api = getApi()
      if (typeof api.mcp?.setSettings !== 'function') {
        throw new Error(
          '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
        )
      }
      const status = await api.mcp.setSettings({
        mcpEnabled: mcpEnabledDraft,
        mcpPort: mcpPortDraft
      })
      setMcpStatus(status)
      applySettings(await api.settings.get())
      if (status.enabled && status.running) {
        message.success(`MCP 已启动：${status.endpointUrl}`)
      } else if (!status.enabled) {
        message.success('已关闭 MCP 服务')
      } else {
        message.warning(status.lastError || 'MCP 未在监听，请检查端口')
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setMcpBusy(false)
    }
  }

  const restartMcp = async (): Promise<void> => {
    setMcpBusy(true)
    try {
      setMcpStatus(await getApi().mcp.restart())
      message.success('已按当前设置重启 MCP')
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setMcpBusy(false)
    }
  }

  const mcpDirty =
    mcpStatus != null &&
    (mcpEnabledDraft !== mcpStatus.enabled || mcpPortDraft !== mcpStatus.port)

  const defaultInterval = settings?.defaultSyncIntervalMinutes ?? 30
  const defaultLookback = settings?.defaultSyncLookbackDays ?? 90

  const syncDirty =
    settings != null &&
    (intervalDraft !== settings.syncIntervalMinutes ||
      lookbackDraft !== settings.syncLookbackDays)

  const aiDirty =
    settings != null &&
    (aiBaseUrl !== settings.aiBaseUrl ||
      aiModel !== settings.aiModel ||
      aiSystemPrompt !== settings.aiSystemPrompt ||
      aiUserPromptTemplate !== settings.aiUserPromptTemplate ||
      Boolean(aiApiKeyDraft.trim()) ||
      settings.aiEnabled)

  return (
    <div className="page-card">
      <div className="page-header">
        <h2 className="page-title">设置</h2>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as SettingsTabKey)}
        items={[
          {
            key: 'general',
            label: '常规',
            children: (
              <>
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
                      {settings?.isCustomExports ? (
                        <Tag color="blue">自定义</Tag>
                      ) : (
                        <Tag>默认</Tag>
                      )}
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
              </>
            )
          },
          {
            key: 'ai',
            label: 'AI',
            children: (
              <div className="settings-block">
                <h3>AI 配置</h3>
                <p className="page-desc" style={{ marginBottom: 12 }}>
                  对接 OpenAI 兼容接口（DeepSeek / Kimi / 自建等）。配置后到「报告」页预览草稿，不满意再点 AI
                  总结。
                </p>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap align="center" style={{ width: '100%' }}>
                    <span style={{ width: 96 }}>Base URL</span>
                    <Input
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      placeholder={settings?.defaultAiBaseUrl}
                      style={{ maxWidth: 420, flex: 1 }}
                    />
                  </Space>
                  <Space wrap align="center">
                    <span style={{ width: 96 }}>模型</span>
                    <Input
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      placeholder={settings?.defaultAiModel}
                      style={{ width: 240 }}
                    />
                  </Space>
                  <Space wrap align="center" style={{ width: '100%' }}>
                    <span style={{ width: 96 }}>API Key</span>
                    <Input.Password
                      value={aiApiKeyDraft}
                      onChange={(e) => setAiApiKeyDraft(e.target.value)}
                      placeholder={
                        settings?.aiApiKeyConfigured
                          ? '已配置（留空则不修改）'
                          : '粘贴 API Key'
                      }
                      style={{ maxWidth: 420, flex: 1 }}
                      autoComplete="off"
                    />
                    {settings?.aiApiKeyConfigured ? (
                      <Tag color="green">已配置</Tag>
                    ) : (
                      <Tag>未配置</Tag>
                    )}
                    {settings?.aiApiKeyConfigured ? (
                      <Button loading={savingAi} onClick={() => void clearAiKey()}>
                        清除
                      </Button>
                    ) : null}
                  </Space>
                  <div>
                    <div
                      style={{
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      <span>System 提示词</span>
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, height: 'auto' }}
                        onClick={() => {
                          if (!settings) return
                          setAiSystemPrompt(settings.defaultAiSystemPrompt)
                          setAiUserPromptTemplate(settings.defaultAiUserPromptTemplate)
                          message.info('已填入默认提示词与模板，请点保存生效')
                        }}
                      >
                        恢复默认
                      </Button>
                    </div>
                    <Input.TextArea
                      value={aiSystemPrompt}
                      onChange={(e) => setAiSystemPrompt(e.target.value)}
                      placeholder={settings?.defaultAiSystemPrompt}
                      autoSize={{ minRows: 4, maxRows: 10 }}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span>User 模板</span>
                      <Tooltip
                        styles={{ root: { maxWidth: 420 } }}
                        title={
                          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                            {[
                              '{{kind}}：报告类型，如日报 / 周报 / 月报 / 自定义汇报',
                              '{{period}}：区间说明，如 2026-10-30、2026-W44（10-27 ~ 11-02）、2026-10',
                              '{{date}}：与 {{period}} 相同，兼容旧模板',
                              '{{accountName}}：当前账号显示名称',
                              '{{commitCount}}：该区间提交条数',
                              '{{guidance}}：按日报/周报/月报自动生成的条数指引',
                              '{{commits}}：按仓库分组的提交明细正文（供模型阅读）'
                            ].join('\n')}
                          </div>
                        }
                      >
                        <QuestionCircleOutlined
                          style={{ color: 'var(--color-muted)', cursor: 'help' }}
                        />
                      </Tooltip>
                    </div>
                    <Input.TextArea
                      value={aiUserPromptTemplate}
                      onChange={(e) => setAiUserPromptTemplate(e.target.value)}
                      placeholder={settings?.defaultAiUserPromptTemplate}
                      autoSize={{ minRows: 4, maxRows: 10 }}
                    />
                  </div>
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={savingAi}
                      disabled={!aiDirty}
                      onClick={() => void saveAi()}
                    >
                      保存
                    </Button>
                    <Button loading={testingAi} onClick={() => void testAi()}>
                      测试连接
                    </Button>
                  </Space>
                </Space>
              </div>
            )
          },
          {
            key: 'mcp',
            label: 'MCP',
            children: (
              <div className="settings-block">
                <h3>MCP 服务</h3>
                <p className="page-desc" style={{ marginBottom: 12 }}>
                  在本机提供只读 HTTP MCP。任意支持 MCP 的客户端把下方配置粘贴进各自的 mcp.json
                  即可拉取提交并总结。
                </p>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap size={[8, 8]} align="center">
                    {mcpStatus?.running ? (
                      <Tag color="green">运行中</Tag>
                    ) : mcpStatus?.enabled ? (
                      <Tag color="red">未监听</Tag>
                    ) : (
                      <Tag>已关闭</Tag>
                    )}
                    {mcpStatus?.lastError ? (
                      <Tag color="orange">{mcpStatus.lastError}</Tag>
                    ) : null}
                  </Space>
                  <Space wrap align="center">
                    <span style={{ width: 96 }}>随应用启动</span>
                    <Switch checked={mcpEnabledDraft} onChange={setMcpEnabledDraft} />
                  </Space>
                  <Space wrap align="center">
                    <span style={{ width: 96 }}>端口</span>
                    <InputNumber
                      min={1024}
                      max={65535}
                      value={mcpPortDraft}
                      onChange={(v) =>
                        setMcpPortDraft(
                          typeof v === 'number'
                            ? v
                            : (mcpStatus?.defaultPort ?? settings?.defaultMcpPort ?? 39281)
                        )
                      }
                      style={{ width: 140 }}
                    />
                    <span className="muted">仅监听 127.0.0.1</span>
                  </Space>
                  <div>
                    <div className="muted" style={{ marginBottom: 4 }}>
                      端点
                    </div>
                    <Typography.Text copyable={Boolean(mcpStatus?.endpointUrl)}>
                      {mcpStatus?.endpointUrl || '加载中…'}
                    </Typography.Text>
                  </div>
                  <div>
                    <div className="muted" style={{ marginBottom: 6 }}>
                      客户端配置示例（复制到任意编辑器的 mcp.json）
                    </div>
                    <Input.TextArea
                      value={mcpStatus?.configJson || ''}
                      readOnly
                      autoSize={{ minRows: 8, maxRows: 14 }}
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
                      }}
                    />
                  </div>
                  <Space wrap>
                    <Button
                      type="primary"
                      loading={mcpBusy}
                      disabled={!mcpDirty}
                      onClick={() => void saveMcp()}
                    >
                      保存并应用
                    </Button>
                    <Button
                      icon={<CopyOutlined />}
                      disabled={!mcpStatus?.configJson}
                      onClick={() => void copyMcpConfig()}
                    >
                      复制配置
                    </Button>
                    <Button
                      disabled={!mcpStatus?.endpointUrl}
                      onClick={() => void copyMcpEndpoint()}
                    >
                      复制端点
                    </Button>
                    <Button loading={mcpBusy} onClick={() => void restartMcp()}>
                      重启服务
                    </Button>
                    <Button
                      loading={mcpBusy}
                      onClick={() =>
                        void refreshMcp().catch((e) =>
                          message.error(e instanceof Error ? e.message : String(e))
                        )
                      }
                    >
                      刷新状态
                    </Button>
                  </Space>
                </Space>
              </div>
            )
          }
        ]}
      />
    </div>
  )
}
