import { useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import {
  ClearOutlined,
  HistoryOutlined,
  LinkOutlined,
  SearchOutlined
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import type { Account, CodeupRepo, StoredCommit } from '@shared/types'
import { commitFullText, commitTitleLine } from '@shared/commitText'
import { shortRepoPath } from '@shared/repoDisplay'
import { getApi } from '../api'

interface Props {
  account: Account | null
  onOpenSyncLogs?: () => void
}

const PAGE_SIZE = 20

/**
 * 提交时间线：按日期/仓库筛选；内容区滚动，分页器固定底部
 */
export default function CommitsPage({ account, onOpenSyncLogs }: Props) {
  const [repos, setRepos] = useState<CodeupRepo[]>([])
  const [items, setItems] = useState<StoredCommit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [repoId, setRepoId] = useState<number | undefined>()
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [resetting, setResetting] = useState(false)
  const [lookbackDays, setLookbackDays] = useState(90)

  useEffect(() => {
    void getApi()
      .settings.get()
      .then((s) => setLookbackDays(s.syncLookbackDays))
      .catch(() => undefined)
  }, [])

  const refreshRepoOptions = async (accountId: string, selected?: number) => {
    const list = await getApi().repos.listWithCommits(accountId)
    setRepos(list)
    // 当前选中仓已无提交时清掉筛选，避免下拉空值
    if (selected != null && !list.some((r) => r.id === selected)) {
      setRepoId(undefined)
    }
  }

  const load = async (
    nextPage = page,
    nextSize = pageSize,
    filterRepoId = repoId
  ) => {
    if (!account) return
    setLoading(true)
    try {
      const [result] = await Promise.all([
        getApi().commits.query({
          accountId: account.id,
          repoId: filterRepoId,
          from: range?.[0]?.startOf('day').toISOString(),
          to: range?.[1]?.endOf('day').toISOString(),
          keyword: keyword.trim() || undefined,
          limit: nextSize,
          offset: (nextPage - 1) * nextSize
        }),
        refreshRepoOptions(account.id, filterRepoId)
      ])
      setItems(result.items)
      setTotal(result.total)
      setPage(nextPage)
      setPageSize(nextSize)
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!account) {
      setRepos([])
      setItems([])
      setTotal(0)
      setRepoId(undefined)
      setPage(1)
      return
    }
    setRepoId(undefined)
    void load(1, pageSize, undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id])

  const onSearch = () => {
    void load(1, pageSize)
  }

  const onReset = () => {
    const selected = repoId != null ? repos.find((r) => r.id === repoId) : undefined
    const scopeLabel = selected
      ? shortRepoPath(selected.pathWithNamespace || selected.name, account!.organizationId)
      : repoId != null
        ? `仓库 ${repoId}`
        : '当前账号全部仓库'
    Modal.confirm({
      title: '重置提交记录',
      content: (
        <div>
          <p>
            将清除「{scopeLabel}」的本地提交与同步进度，再重新拉取（回溯约{' '}
            {lookbackDays} 天）。已导出的 Markdown 材料不会删除。
          </p>
          <p style={{ marginBottom: 0 }}>若只想清某一个仓，先在上方筛选该仓库再点重置。</p>
        </div>
      ),
      okText: '重置并重新同步',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setResetting(true)
        try {
          const cleared = await getApi().commits.reset(account!.id, repoId)
          const result = await getApi().sync.run(
            account!.id,
            repoId != null ? [repoId] : undefined
          )
          message.success(
            `已删除 ${cleared.deletedCommits} 条，重新同步新增 ${result.inserted}`
          )
          if (result.errors.length) {
            message.warning(`同步有 ${result.errors.length} 个错误`)
            onOpenSyncLogs?.()
          }
          await load(1, pageSize)
        } catch (e: any) {
          message.error(e?.message || String(e))
          throw e
        } finally {
          setResetting(false)
        }
      }
    })
  }

  if (!account) {
    return (
      <div className="page-card page-fill">
        <div className="page-header">
          <h2 className="page-title">提交</h2>
        </div>
        <div className="empty-hint">
          <HistoryOutlined />
          <span>请先选择账号并同步</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page-card page-fill">
      <div className="page-header">
        <h2 className="page-title">提交</h2>
        <div className="toolbar-actions">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="有记录的仓库"
            style={{ width: 240 }}
            value={repoId}
            onChange={(v) => setRepoId(v)}
            notFoundContent="暂无已同步提交的仓库"
            options={repos.map((r) => ({
              value: r.id,
              label: shortRepoPath(r.pathWithNamespace || r.name, account.organizationId)
            }))}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
          />
          <Input
            allowClear
            placeholder="关键词"
            style={{ width: 140 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={onSearch}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={onSearch}
          >
            查询
          </Button>
          <Button
            danger
            icon={<ClearOutlined />}
            loading={resetting}
            onClick={onReset}
          >
            重置记录
          </Button>
        </div>
      </div>

      <div className="table-scroll">
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: '暂无提交，先同步或调整筛选' }}
          columns={[
            {
              title: '时间',
              dataIndex: 'committedAt',
              width: 160,
              render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm')
            },
            {
              title: '仓库',
              dataIndex: 'repoName',
              width: 200,
              ellipsis: true,
              render: (v: string) => shortRepoPath(v, account.organizationId)
            },
            {
              title: '提交',
              dataIndex: 'message',
              ellipsis: { showTitle: false },
              render: (_: string, row) => {
                const full = commitFullText(row)
                const first = commitTitleLine(row)
                return (
                  <div className="commit-msg-cell">
                    <Tooltip
                      rootClassName="commit-msg-tooltip"
                      styles={{ root: { maxWidth: 'min(720px, 80vw)' } }}
                      title={
                        <span className="commit-tooltip-body">{full}</span>
                      }
                    >
                      <span className="commit-item-title">{first}</span>
                    </Tooltip>
                    <Tag>{row.shortId}</Tag>
                  </div>
                )
              }
            },
            {
              title: '作者',
              dataIndex: 'authorName',
              width: 120,
              ellipsis: true
            },
            {
              title: '操作',
              width: 56,
              render: (_, row) =>
                row.webUrl ? (
                  <Tooltip title="在浏览器打开">
                    <Button
                      type="text"
                      size="small"
                      icon={<LinkOutlined />}
                      aria-label="在浏览器打开"
                      onClick={() => void getApi().app.openExternal(row.webUrl)}
                    />
                  </Tooltip>
                ) : (
                  '-'
                )
            }
          ]}
        />
      </div>

      <div className="table-pager">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={[10, 20, 50, 100]}
          showTotal={(t) => `共 ${t} 条`}
          onChange={(p, size) => {
            void load(p, size)
          }}
        />
      </div>
    </div>
  )
}
