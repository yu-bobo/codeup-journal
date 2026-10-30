import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  Pagination,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message
} from 'antd'
import {
  DatabaseOutlined,
  LinkOutlined,
  ReloadOutlined,
  SaveOutlined,
  SyncOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Account, CodeupRepo } from '@shared/types'
import { shortRepoPath } from '@shared/repoDisplay'
import { getApi } from '../api'

interface Props {
  account: Account | null
  onChanged: () => Promise<void>
  onOpenSyncLogs?: () => void
}

type ScopeFilter = 'watched' | 'all'

const PAGE_SIZE = 20

function accessLabel(level?: number): string {
  if (level === 40) return '管理员'
  if (level === 30) return '开发者'
  if (level === 20) return '浏览者'
  return '-'
}

/**
 * 仓库关注页：拉取可见仓库并勾选同步范围
 */
export default function ReposPage({ account, onChanged, onOpenSyncLogs }: Props) {
  const [repos, setRepos] = useState<CodeupRepo[]>([])
  const [watched, setWatched] = useState<number[]>([])
  const [branches, setBranches] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useState<ScopeFilter>('watched')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [syncingIds, setSyncingIds] = useState<number[]>([])
  const [syncingList, setSyncingList] = useState(false)
  // repoId -> 分支名列表（展开下拉时按需拉取）
  const [branchOptions, setBranchOptions] = useState<Record<string, string[]>>({})
  const [branchLoading, setBranchLoading] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!account) {
      setRepos([])
      setWatched([])
      setBranches({})
      setBranchOptions({})
      setPage(1)
      return
    }
    setWatched(account.watchedRepoIds)
    setBranches(account.repoBranches || {})
    setBranchOptions({})
    setPage(1)
    void (async () => {
      setLoading(true)
      try {
        const list = await getApi().repos.list(account.id)
        setRepos(list)
      } finally {
        setLoading(false)
      }
    })()
  }, [account])

  const ensureBranches = async (repo: CodeupRepo) => {
    const key = String(repo.id)
    if (branchOptions[key] || branchLoading[key]) return
    setBranchLoading((prev) => ({ ...prev, [key]: true }))
    try {
      const list = await getApi().repos.listBranches(account!.id, repo.id)
      const names = list.map((b) => b.name).filter(Boolean)
      // 兜底：接口未返回时至少给出仓库默认分支 / 账号默认分支
      const fallback = repo.defaultBranch || account?.defaultBranch
      const merged =
        names.length > 0
          ? names
          : fallback
            ? [fallback]
            : []
      setBranchOptions((prev) => ({ ...prev, [key]: merged }))
    } catch (e: any) {
      const fallback = repo.defaultBranch || account?.defaultBranch
      setBranchOptions((prev) => ({
        ...prev,
        [key]: fallback ? [fallback] : []
      }))
      message.warning(
        `拉取「${shortRepoPath(repo.pathWithNamespace || repo.name, account?.organizationId)}」分支失败：${
          e?.message || String(e)
        }`
      )
    } finally {
      setBranchLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  const filtered = useMemo(() => {
    return repos.filter((r) => {
      if (scope === 'watched' && !watched.includes(r.id)) return false
      if (!keyword.trim()) return true
      const kw = keyword.toLowerCase()
      const label = shortRepoPath(r.pathWithNamespace || r.name, account?.organizationId)
      return (
        r.name.toLowerCase().includes(kw) ||
        r.pathWithNamespace.toLowerCase().includes(kw) ||
        label.toLowerCase().includes(kw)
      )
    })
  }, [repos, scope, keyword, watched, account?.organizationId])

  // 筛选变化时回到第一页
  useEffect(() => {
    setPage(1)
  }, [scope, keyword])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  if (!account) {
    return (
      <div className="page-card page-fill">
        <div className="page-header">
          <h2 className="page-title">仓库</h2>
        </div>
        <div className="empty-hint">
          <DatabaseOutlined />
          <span>请先添加并选择账号</span>
        </div>
      </div>
    )
  }

  const refresh = async () => {
    setLoading(true)
    try {
      const list = await getApi().repos.refresh(account.id)
      setRepos(list)
      setPage(1)
      message.success(`已刷新 ${list.length} 个仓库`)
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      // 去掉空字符串，空值表示跟随账号默认分支
      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(branches)) {
        const name = (v || '').trim()
        if (name) cleaned[k] = name
      }
      await getApi().repos.setWatched(account.id, watched, cleaned)
      setBranches(cleaned)
      message.success(
        watched.length === 0
          ? '已保存：将同步全部可见仓库'
          : `已保存：关注 ${watched.length} 个仓库`
      )
      await onChanged()
    } catch (e: any) {
      message.error(e?.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: number, checked: boolean) => {
    setWatched((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    )
  }

  const runSync = async (repoIds: number[]) => {
    if (!repoIds.length) {
      message.warning('请先选择要同步的仓库')
      return
    }
    try {
      const result = await getApi().sync.run(account.id, repoIds)
      if (result.errors.length) {
        message.warning(
          `同步完成：新增 ${result.inserted}，失败 ${result.errors.length}`
        )
        onOpenSyncLogs?.()
      } else {
        message.success(
          `已同步 ${repoIds.length} 个仓库：拉取 ${result.fetched}，新增 ${result.inserted}`
        )
      }
    } catch (e: any) {
      message.error(e?.message || String(e))
    }
  }

  const syncOne = async (repoId: number) => {
    setSyncingIds((prev) => [...prev, repoId])
    try {
      await runSync([repoId])
    } finally {
      setSyncingIds((prev) => prev.filter((id) => id !== repoId))
    }
  }

  const syncFiltered = async () => {
    setSyncingList(true)
    try {
      await runSync(filtered.map((r) => r.id))
    } finally {
      setSyncingList(false)
    }
  }

  return (
    <div className="page-card page-fill">
      <div className="page-header">
        <h2 className="page-title">仓库</h2>
        <div className="toolbar-actions">
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as ScopeFilter)}
            options={[
              { value: 'watched', label: `我关注的 ${watched.length}` },
              { value: 'all', label: `全部 ${repos.length}` }
            ]}
          />
          <Input
            allowClear
            placeholder="搜索"
            style={{ width: 180 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void refresh()}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => void save()}
          >
            保存关注
          </Button>
        </div>
      </div>
      <p className="page-desc">
        顶栏同步拉全部关注仓；这里可对单个或当前列表指定同步。未关注任何仓库时定时/全量同步会覆盖全部可见仓。
      </p>
      <Space style={{ marginBottom: 12 }} wrap size={[8, 8]}>
        <Button
          size="small"
          type="primary"
          ghost
          icon={<SyncOutlined />}
          disabled={!filtered.length}
          loading={syncingList}
          onClick={() => void syncFiltered()}
        >
          同步当前列表
        </Button>
        <span className="muted">
          列表 {filtered.length} · 已关注 {watched.length || '全部可见'}
        </span>
      </Space>

      <div className="table-scroll">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={pageItems}
          size="middle"
          pagination={false}
          locale={{
            emptyText:
              scope === 'watched'
                ? watched.length === 0
                  ? '尚未关注仓库（将同步全部可见）。请到「全部」勾选后保存。'
                  : '没有匹配的关注仓库'
                : '暂无仓库，先刷新列表'
          }}
          columns={[
            {
              title: '关注',
              width: 70,
              render: (_, row) => (
                <Checkbox
                  checked={watched.includes(row.id)}
                  onChange={(e) => toggle(row.id, e.target.checked)}
                />
              )
            },
            {
              title: '名称',
              dataIndex: 'pathWithNamespace',
              ellipsis: true,
              render: (v: string, row) =>
                shortRepoPath(v || row.name, account.organizationId)
            },
            {
              title: '角色',
              width: 90,
              render: (_, row) => <Tag>{accessLabel(row.accessLevel)}</Tag>
            },
            {
              title: '分支覆盖',
              width: 200,
              render: (_, row) => {
                const key = String(row.id)
                const options = (branchOptions[key] || []).map((name) => ({
                  value: name,
                  label: name
                }))
                const current = branches[key]
                // 已选但不在列表里时仍展示
                if (current && !options.some((o) => o.value === current)) {
                  options.unshift({ value: current, label: current })
                }
                return (
                  <Select
                    allowClear
                    showSearch
                    size="small"
                    style={{ width: '100%' }}
                    placeholder={row.defaultBranch || account.defaultBranch}
                    value={current || undefined}
                    options={options}
                    loading={!!branchLoading[key]}
                    onOpenChange={(open) => {
                      if (open) void ensureBranches(row)
                    }}
                    onChange={(v) =>
                      setBranches((prev) => {
                        const next = { ...prev }
                        if (!v) delete next[key]
                        else next[key] = v
                        return next
                      })
                    }
                    notFoundContent={branchLoading[key] ? '加载中…' : '无分支'}
                  />
                )
              }
            },
            {
              title: '最近活跃',
              dataIndex: 'lastActivityAt',
              width: 170,
              render: (v?: string) =>
                v && dayjs(v).isValid() ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'
            },
            {
              title: '操作',
              width: 88,
              fixed: 'right',
              render: (_, row) => (
                <Space className="icon-action-group" size={4}>
                  <Tooltip title="打开仓库地址">
                    <Button
                      type="text"
                      size="small"
                      icon={<LinkOutlined />}
                      disabled={!row.webUrl}
                      aria-label="打开仓库地址"
                      onClick={() => {
                        if (!row.webUrl) {
                          message.warning('该仓库没有可用地址')
                          return
                        }
                        void getApi().app.openExternal(row.webUrl)
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="同步此仓库">
                    <Button
                      type="text"
                      size="small"
                      icon={<SyncOutlined />}
                      loading={syncingIds.includes(row.id)}
                      disabled={syncingList}
                      aria-label="同步此仓库"
                      onClick={() => void syncOne(row.id)}
                    />
                  </Tooltip>
                </Space>
              )
            }
          ]}
        />
      </div>

      <div className="table-pager">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={filtered.length}
          showSizeChanger
          showQuickJumper
          pageSizeOptions={[10, 20, 50, 100]}
          showTotal={(t) => `共 ${t} 条`}
          onChange={(p, size) => {
            setPage(p)
            setPageSize(size)
          }}
        />
      </div>
    </div>
  )
}
