import { v4 as uuid } from 'uuid'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { Account, StoredCommit, SyncResult } from '@shared/types'
import { commitFullText } from '@shared/commitText'
import { shortRepoPath } from '@shared/repoDisplay'
import { getAccount, getAccountToken, listAccounts } from './accounts'
import { listAllRepositories, listCommitsSince } from './codeup'
import { db } from './db'
import { exportsDir } from './paths'
import { getSyncIntervalMinutes, getSyncLookbackDays } from './settings'

let timers = new Map<string, NodeJS.Timeout>()
let syncing = new Set<string>()

function matchAuthor(account: Account, name: string, email: string): boolean {
  if (!account.authorFilters.length) return true
  const hay = `${name} ${email}`.toLowerCase()
  return account.authorFilters.some((f) => hay.includes(f.toLowerCase()))
}

function writeDailyExports(accountId: string, commits: StoredCommit[]): void {
  if (!commits.length) return
  const root = exportsDir()
  const byDay = new Map<string, StoredCommit[]>()
  for (const c of commits) {
    const day = c.committedAt.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(c)
  }
  for (const [day, list] of byDay) {
    const dir = join(root, accountId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const path = join(dir, `${day}.md`)
    const existing = existsSync(path)
      ? readFileSync(path, 'utf8')
      : `# ${day} 提交材料\n\n`
    const lines: string[] = []
    for (const c of list) {
      const marker = c.sha
      if (existing.includes(marker)) continue
      const text = commitFullText(c)
      const [first, ...rest] = text.split('\n')
      lines.push(`- **[${c.repoName}]** ${first}`)
      for (const line of rest) {
        lines.push(`  ${line}`)
      }
      lines.push(`  - 时间: ${c.committedAt}`)
      lines.push(`  - 作者: ${c.authorName} <${c.authorEmail}>`)
      lines.push(`  - SHA: \`${c.shortId}\` (${c.sha})`)
      if (c.webUrl) lines.push(`  - 链接: ${c.webUrl}`)
      lines.push('')
    }
    if (lines.length) {
      writeFileSync(path, existing + lines.join('\n'), 'utf8')
    }
  }
}

export async function syncAccount(
  accountId: string,
  repoIds?: number[]
): Promise<SyncResult> {
  if (syncing.has(accountId)) {
    return { accountId, fetched: 0, inserted: 0, errors: ['同步进行中，请稍后再试'] }
  }
  syncing.add(accountId)
  const errors: string[] = []
  let fetched = 0
  let inserted = 0
  try {
    const account = getAccount(accountId)
    if (!account) throw new Error('账号不存在')
    const token = getAccountToken(accountId)

    const onlyIds =
      repoIds && repoIds.length > 0 ? Array.from(new Set(repoIds.map(Number))) : null

    db.addSyncLog({
      id: uuid(),
      accountId,
      at: new Date().toISOString(),
      level: 'info',
      message: onlyIds
        ? `开始同步指定仓库（${onlyIds.length} 个）`
        : '开始同步全部关注仓库'
    })

    let repos = db.listRepos(accountId)
    // 全量同步或本地缺仓库元数据时，再拉一次列表
    const needRefresh =
      !onlyIds ||
      onlyIds.some((id) => !repos.find((r) => r.id === id))
    if (needRefresh) {
      repos = await listAllRepositories(account, token)
      db.upsertRepos(accountId, repos)
    }

    let targets = onlyIds
      ? repos.filter((r) => onlyIds.includes(r.id))
      : account.watchedRepoIds.length > 0
        ? repos.filter((r) => account.watchedRepoIds.includes(r.id))
        : repos

    if (onlyIds && targets.length === 0) {
      throw new Error('未找到要同步的仓库，请先刷新仓库列表')
    }

    const newCommits: StoredCommit[] = []
    for (const repo of targets) {
      try {
        const branch =
          account.repoBranches[String(repo.id)] ||
          repo.defaultBranch ||
          account.defaultBranch ||
          'master'
        const state = db.getSyncState(accountId, repo.id)
        // 首次同步按设置回溯，避免一次拉全量历史
        const lookbackDays = getSyncLookbackDays()
        const since =
          state?.lastSyncedAt ||
          new Date(Date.now() - lookbackDays * 24 * 3600 * 1000)
            .toISOString()
            .replace(/\.\d{3}Z$/, 'Z')

        const commits = await listCommitsSince(account, token, repo.id, branch, since)
        fetched += commits.length
        const now = new Date().toISOString()
        for (const c of commits) {
          if (!matchAuthor(account, c.authorName, c.authorEmail)) continue
          newCommits.push({
            id: uuid(),
            accountId,
            repoId: repo.id,
            repoName: shortRepoPath(
              repo.pathWithNamespace || repo.name,
              account.organizationId
            ),
            sha: c.id,
            shortId: c.shortId,
            title: c.title,
            message: c.message,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            committedAt: c.committedDate || c.authoredDate,
            webUrl: c.webUrl,
            syncedAt: now
          })
        }
        db.setSyncState({
          accountId,
          repoId: repo.id,
          lastSyncedAt: now
        })
      } catch (e: any) {
        const msg = `仓库 ${shortRepoPath(repo.pathWithNamespace || repo.name, account.organizationId)}: ${e?.message || e}`
        errors.push(msg)
        db.addSyncLog({
          id: uuid(),
          accountId,
          at: new Date().toISOString(),
          level: 'error',
          message: msg
        })
      }
    }

    inserted = db.insertCommits(newCommits)
    writeDailyExports(accountId, newCommits)

    db.addSyncLog({
      id: uuid(),
      accountId,
      at: new Date().toISOString(),
      level: errors.length ? 'warn' : 'info',
      message: `同步完成：拉取 ${fetched}，新增 ${inserted}${errors.length ? `，失败 ${errors.length}` : ''}`
    })

    return { accountId, fetched, inserted, errors }
  } catch (e: any) {
    const msg = e?.message || String(e)
    errors.push(msg)
    db.addSyncLog({
      id: uuid(),
      accountId,
      at: new Date().toISOString(),
      level: 'error',
      message: msg
    })
    return { accountId, fetched, inserted, errors }
  } finally {
    syncing.delete(accountId)
  }
}

export function scheduleAccount(accountId: string): void {
  clearAccountSchedule(accountId)
  if (!getAccount(accountId)) return
  const ms = getSyncIntervalMinutes() * 60 * 1000
  const timer = setInterval(() => {
    void syncAccount(accountId)
  }, ms)
  timers.set(accountId, timer)
}

export function clearAccountSchedule(accountId: string): void {
  const t = timers.get(accountId)
  if (t) clearInterval(t)
  timers.delete(accountId)
}

export function rescheduleAll(): void {
  for (const id of [...timers.keys()]) clearAccountSchedule(id)
  for (const a of listAccounts()) scheduleAccount(a.id)
}

export function stopAllSchedules(): void {
  for (const id of [...timers.keys()]) clearAccountSchedule(id)
}
