import { useEffect, useState } from 'react'
import { Button, Space, Table, Tag, message } from 'antd'
import { ProfileOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Account, SyncLog } from '@shared/types'
import { getApi } from '../api'

interface Props {
  account: Account | null
}

const LEVEL_META: Record<
  SyncLog['level'],
  { color: string; label: string }
> = {
  info: { color: 'blue', label: '信息' },
  warn: { color: 'orange', label: '警告' },
  error: { color: 'red', label: '错误' }
}

/**
 * 日志页：展示当前账号最近的同步记录与错误详情
 */
export default function SyncLogsPage({ account }: Props) {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    if (!account) {
      setLogs([])
      return
    }
    setLoading(true)
    try {
      setLogs(await getApi().sync.logs(account.id))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [account?.id])

  if (!account) {
    return (
      <div className="page-card page-fill">
        <div className="page-header">
          <h2 className="page-title">日志</h2>
        </div>
        <div className="empty-hint">
          <ProfileOutlined />
          <span>请先选择账号</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-card page-fill">
      <div className="page-header">
        <h2 className="page-title">日志</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>
      <p className="page-desc">当前账号最近 50 条同步记录；错误行可查看具体仓库失败原因。</p>
      <div className="table-scroll">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={logs}
          pagination={false}
          locale={{ emptyText: '暂无同步记录' }}
          columns={[
            {
              title: '级别',
              dataIndex: 'level',
              width: 88,
              render: (level: SyncLog['level']) => {
                const meta = LEVEL_META[level]
                return <Tag color={meta.color}>{meta.label}</Tag>
              }
            },
            {
              title: '时间',
              dataIndex: 'at',
              width: 180,
              render: (at: string) => dayjs(at).format('YYYY-MM-DD HH:mm:ss')
            },
            {
              title: '内容',
              dataIndex: 'message',
              render: (msg: string) => (
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</span>
              )
            }
          ]}
        />
      </div>
    </div>
  )
}
