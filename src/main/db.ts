import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dbPath } from './paths'
import type { CodeupRepo, StoredCommit, SyncLog, SyncState } from '@shared/types'

interface DbData {
  repos: CodeupRepoRecord[]
  commits: StoredCommit[]
  syncState: SyncState[]
  syncLogs: SyncLog[]
}

export interface CodeupRepoRecord extends CodeupRepo {
  accountId: string
}

const empty: DbData = {
  repos: [],
  commits: [],
  syncState: [],
  syncLogs: []
}

function load(): DbData {
  const path = dbPath()
  if (!existsSync(path)) return structuredClone(empty)
  try {
    return { ...structuredClone(empty), ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    return structuredClone(empty)
  }
}

function save(data: DbData): void {
  writeFileSync(dbPath(), JSON.stringify(data, null, 2), 'utf8')
}

export const db = {
  upsertRepos(accountId: string, repos: CodeupRepo[]): void {
    const data = load()
    const others = data.repos.filter((r) => r.accountId !== accountId)
    data.repos = [
      ...others,
      ...repos.map((r) => ({ ...r, accountId }))
    ]
    save(data)
  },

  listRepos(accountId: string): CodeupRepoRecord[] {
    return load().repos.filter((r) => r.accountId === accountId)
  },

  // 仅返回本地已有提交记录的仓库（提交页筛选下拉用）
  listReposWithCommits(accountId: string): CodeupRepoRecord[] {
    const data = load()
    const nameById = new Map<number, string>()
    for (const c of data.commits) {
      if (c.accountId !== accountId) continue
      if (!nameById.has(c.repoId)) nameById.set(c.repoId, c.repoName)
    }
    if (nameById.size === 0) return []
    const byId = new Map(
      data.repos.filter((r) => r.accountId === accountId).map((r) => [r.id, r])
    )
    const list: CodeupRepoRecord[] = []
    for (const [id, repoName] of nameById) {
      const existing = byId.get(id)
      if (existing) {
        list.push(existing)
      } else {
        // 仓库元数据已删但提交还在时，用提交里的名称兜底
        list.push({
          accountId,
          id,
          name: repoName,
          pathWithNamespace: repoName,
          webUrl: ''
        })
      }
    }
    list.sort((a, b) =>
      (a.pathWithNamespace || a.name).localeCompare(b.pathWithNamespace || b.name)
    )
    return list
  },

  getSyncState(accountId: string, repoId: number): SyncState | undefined {
    return load().syncState.find((s) => s.accountId === accountId && s.repoId === repoId)
  },

  setSyncState(state: SyncState): void {
    const data = load()
    const idx = data.syncState.findIndex(
      (s) => s.accountId === state.accountId && s.repoId === state.repoId
    )
    if (idx >= 0) data.syncState[idx] = state
    else data.syncState.push(state)
    save(data)
  },

  insertCommits(commits: StoredCommit[]): number {
    if (commits.length === 0) return 0
    const data = load()
    const index = new Map(data.commits.map((c, i) => [`${c.accountId}:${c.sha}`, i]))
    let inserted = 0
    let updated = 0
    for (const c of commits) {
      const key = `${c.accountId}:${c.sha}`
      const idx = index.get(key)
      if (idx == null) {
        data.commits.push(c)
        index.set(key, data.commits.length - 1)
        inserted++
        continue
      }
      // 已存在时若新拉取的 message 更完整则补全（避免历史只存了 title）
      const prev = data.commits[idx]
      const nextMsg = (c.message || '').trim()
      const prevMsg = (prev.message || '').trim()
      if (nextMsg && nextMsg.length > prevMsg.length) {
        data.commits[idx] = {
          ...prev,
          title: c.title || prev.title,
          message: nextMsg,
          webUrl: c.webUrl || prev.webUrl,
          syncedAt: c.syncedAt || prev.syncedAt
        }
        updated++
      }
    }
    if (inserted > 0 || updated > 0) save(data)
    return inserted
  },

  queryCommits(opts: {
    accountId: string
    repoId?: number
    from?: string
    to?: string
    keyword?: string
    limit?: number
    offset?: number
  }): { items: StoredCommit[]; total: number } {
    let items = load().commits.filter((c) => c.accountId === opts.accountId)
    if (opts.repoId != null) items = items.filter((c) => c.repoId === opts.repoId)
    if (opts.from) {
      const from = opts.from
      items = items.filter((c) => c.committedAt >= from)
    }
    if (opts.to) {
      const to = opts.to.endsWith('Z') || opts.to.includes('T')
        ? opts.to
        : `${opts.to}T23:59:59.999Z`
      items = items.filter((c) => c.committedAt <= to)
    }
    if (opts.keyword) {
      const kw = opts.keyword.toLowerCase()
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(kw) ||
          c.message.toLowerCase().includes(kw) ||
          c.repoName.toLowerCase().includes(kw)
      )
    }
    items.sort((a, b) => b.committedAt.localeCompare(a.committedAt))
    const total = items.length
    const offset = opts.offset ?? 0
    const limit = opts.limit ?? 200
    return { items: items.slice(offset, offset + limit), total }
  },

  addSyncLog(log: SyncLog): void {
    const data = load()
    data.syncLogs.unshift(log)
    data.syncLogs = data.syncLogs.slice(0, 500)
    save(data)
  },

  listSyncLogs(
    accountId: string,
    limit = 20,
    offset = 0
  ): { items: SyncLog[]; total: number } {
    const all = load().syncLogs.filter((l) => l.accountId === accountId)
    return {
      items: all.slice(offset, offset + limit),
      total: all.length
    }
  },

  deleteAccountData(accountId: string): void {
    const data = load()
    data.repos = data.repos.filter((r) => r.accountId !== accountId)
    data.commits = data.commits.filter((c) => c.accountId !== accountId)
    data.syncState = data.syncState.filter((s) => s.accountId !== accountId)
    data.syncLogs = data.syncLogs.filter((l) => l.accountId !== accountId)
    save(data)
  },

  // 清除提交与同步进度；指定 repoId 时只清该仓，便于不准确时重拉
  clearCommits(accountId: string, repoId?: number): { deletedCommits: number } {
    const data = load()
    const before = data.commits.length
    if (repoId != null) {
      data.commits = data.commits.filter(
        (c) => !(c.accountId === accountId && c.repoId === repoId)
      )
      data.syncState = data.syncState.filter(
        (s) => !(s.accountId === accountId && s.repoId === repoId)
      )
    } else {
      data.commits = data.commits.filter((c) => c.accountId !== accountId)
      data.syncState = data.syncState.filter((s) => s.accountId !== accountId)
    }
    const deletedCommits = before - data.commits.length
    save(data)
    return { deletedCommits }
  }
}
