import { useEffect, useState } from 'react'
import { Button, DatePicker, Drawer, Empty, Radio, Space, Tag, message } from 'antd'
import {
  CopyOutlined,
  EyeOutlined,
  FileTextOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Account, AppSettingsView, ReportKind, ReportResult } from '@shared/types'
import { getApi } from '../api'

interface Props {
  account: Account | null
}

/**
 * 报告页：主区预览模板；AI 总结结果从右侧抽屉弹出
 */
export default function ReportsPage({ account }: Props) {
  const [kind, setKind] = useState<ReportKind>('day')
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [aiResult, setAiResult] = useState<ReportResult | null>(null)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [aiReady, setAiReady] = useState(false)

  const refreshAiStatus = async (): Promise<void> => {
    const s: AppSettingsView = await getApi().settings.get()
    setAiReady(s.aiApiKeyConfigured && Boolean(s.aiBaseUrl.trim()) && Boolean(s.aiModel.trim()))
  }

  useEffect(() => {
    void refreshAiStatus()
  }, [])

  if (!account) {
    return (
      <div className="page-card">
        <div className="page-header">
          <h2 className="page-title">报告</h2>
        </div>
        <div className="empty-hint">
          <FileTextOutlined />
          <span>请先选择账号</span>
        </div>
      </div>
    )
  }

  const buildReq = () => {
    if (kind === 'custom') {
      if (!range) throw new Error('请选择自定义起止日期')
      return {
        accountId: account.id,
        kind,
        from: range[0].format('YYYY-MM-DD'),
        to: range[1].format('YYYY-MM-DD')
      }
    }
    return {
      accountId: account.id,
      kind,
      date: date.format('YYYY-MM-DD')
    }
  }

  const preview = async () => {
    setLoading(true)
    try {
      const r = await getApi().reports.preview(buildReq())
      setResult(r)
      if (r.commitCount === 0) message.info('该区间暂无提交')
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const polishAi = async () => {
    if (!aiReady) {
      message.warning('请先在「设置 → AI 配置」中填写 Base URL、模型与 API Key')
      return
    }
    setAiLoading(true)
    try {
      const api = getApi()
      if (typeof api.ai?.generateReport !== 'function') {
        throw new Error(
          '桥接未更新：请完全退出应用后重新执行 pnpm dev（仅刷新页面无效）'
        )
      }
      const r = await api.ai.generateReport(buildReq())
      if (r.skipped) {
        setAiResult(null)
        setAiDrawerOpen(false)
        message.info('该区间暂无提交，无法润色')
        return
      }
      setAiResult(r)
      setAiDrawerOpen(true)
      message.success(`AI 总结完成（${r.commitCount} 条）`)
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setAiLoading(false)
    }
  }

  const copyMarkdown = async (markdown?: string) => {
    if (!markdown) return
    await navigator.clipboard.writeText(markdown)
    message.success('已复制到剪贴板')
  }

  return (
    <div className="page-card page-with-drawer">
      <div className="page-with-drawer-body">
        <div className="page-header">
          <h2 className="page-title">报告</h2>
        </div>
        <p className="page-desc">
          先预览模板草稿；不满意再按当前日 / 周 / 月 / 自定义区间做 AI 总结（结果在右侧抽屉）。模型与提示词在「设置
          → AI 配置」。
          {aiReady ? (
            <>
              {' '}
              <Tag color="green">AI 已配置</Tag>
            </>
          ) : (
            <>
              {' '}
              <Tag>AI 未配置</Tag>
            </>
          )}
        </p>

        <div className="toolbar">
          <Radio.Group
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            optionType="button"
            options={[
              { label: '日报', value: 'day' },
              { label: '周报', value: 'week' },
              { label: '月报', value: 'month' },
              { label: '自定义', value: 'custom' }
            ]}
          />
          {kind === 'custom' ? (
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
            />
          ) : (
            <DatePicker
              value={date}
              onChange={(v) => v && setDate(v)}
              picker={kind === 'month' ? 'month' : kind === 'week' ? 'week' : 'date'}
            />
          )}
          <Button
            type="primary"
            icon={<EyeOutlined />}
            loading={loading}
            onClick={() => void preview()}
          >
            预览
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            loading={aiLoading}
            disabled={!aiReady}
            onClick={() => void polishAi()}
          >
            AI 总结
          </Button>
          <Button
            icon={<CopyOutlined />}
            disabled={!result}
            onClick={() => void copyMarkdown(result?.markdown)}
          >
            复制
          </Button>
          {aiResult ? (
            <Button type="link" onClick={() => setAiDrawerOpen(true)}>
              查看 AI 结果
            </Button>
          ) : null}
        </div>
        {result ? (
          <>
            <p style={{ margin: '4px 0 12px' }}>
              <strong>{result.title}</strong>
              <span className="muted"> · {result.commitCount} 条</span>
              {result.statutoryWorkdays != null ? (
                <span className="muted">
                  {' '}
                  · 法定工作日：{result.statutoryWorkdays} 天
                </span>
              ) : null}
            </p>
            <pre className="report-preview">{result.markdown}</pre>
          </>
        ) : (
          <div className="empty-hint">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择区间后点「预览」；不满意再点「AI 总结」"
            />
          </div>
        )}
      </div>

      <Drawer
        title="AI 总结结果"
        placement="right"
        width={520}
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        destroyOnClose={false}
        // 挂在报告页卡片内，不遮盖顶栏与侧栏
        getContainer={false}
        rootClassName="page-local-drawer"
        extra={
          <Space>
            <Button
              type="primary"
              icon={<CopyOutlined />}
              disabled={!aiResult?.markdown}
              onClick={() => void copyMarkdown(aiResult?.markdown)}
            >
              复制
            </Button>
          </Space>
        }
      >
        {aiResult ? (
          <>
            <p style={{ margin: '0 0 12px' }}>
              <strong>{aiResult.title}</strong>
              <span className="muted"> · {aiResult.commitCount} 条</span>
              {aiResult.statutoryWorkdays != null ? (
                <span className="muted">
                  {' '}
                  · 法定工作日：{aiResult.statutoryWorkdays} 天
                </span>
              ) : null}
            </p>
            <pre className="report-preview report-preview-drawer">{aiResult.markdown}</pre>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 AI 结果" />
        )}
      </Drawer>
    </div>
  )
}
