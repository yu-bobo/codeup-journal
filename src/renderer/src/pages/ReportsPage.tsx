import { useState } from 'react'
import { Button, DatePicker, Empty, Radio, message } from 'antd'
import {
  CopyOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Account, ReportKind, ReportResult } from '@shared/types'
import { getApi } from '../api'

interface Props {
  account: Account | null
}

/**
 * 报告页：按日/周/月生成 Markdown 草稿并导出
 */
export default function ReportsPage({ account }: Props) {
  const [kind, setKind] = useState<ReportKind>('week')
  const [date, setDate] = useState<Dayjs>(dayjs())
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)

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

  const exportReport = async () => {
    setLoading(true)
    try {
      const r = await getApi().reports.generate(buildReq())
      setResult(r)
      message.success(`已导出 ${r.commitCount} 条提交`)
      if (r.filePath) await getApi().app.openPath(r.filePath)
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!result?.markdown) return
    await navigator.clipboard.writeText(result.markdown)
    message.success('已复制到剪贴板')
  }

  return (
    <div className="page-card">
      <div className="page-header">
        <h2 className="page-title">报告</h2>
      </div>
      <p className="page-desc">根据已同步提交生成日报 / 周报 / 月报草稿。落盘路径见「设置」。</p>
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
          icon={<EyeOutlined />}
          loading={loading}
          onClick={() => void preview()}
        >
          预览
        </Button>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={loading}
          onClick={() => void exportReport()}
        >
          导出
        </Button>
        <Button
          icon={<CopyOutlined />}
          disabled={!result}
          onClick={() => void copy()}
        >
          复制
        </Button>
      </div>
      {result ? (
        <>
          <p style={{ margin: '4px 0 12px' }}>
            <strong>{result.title}</strong>
            <span className="muted"> · {result.commitCount} 条</span>
          </p>
          <pre className="report-preview">{result.markdown}</pre>
        </>
      ) : (
        <div className="empty-hint">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="选择区间后点击「预览」或「导出」"
          />
        </div>
      )}
    </div>
  )
}
