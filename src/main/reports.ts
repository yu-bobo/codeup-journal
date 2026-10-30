import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type { ReportKind, ReportRequest, ReportResult, StoredCommit } from '@shared/types'
import { commitFullText } from '@shared/commitText'
import { getAccount } from './accounts'
import { db } from './db'
import { reportsDir } from './paths'

dayjs.extend(isoWeek)

function rangeFor(kind: ReportKind, date?: string, from?: string, to?: string): {
  from: string
  to: string
  title: string
  fileName: string
} {
  if (kind === 'custom') {
    if (!from || !to) throw new Error('自定义区间需提供起止日期')
    return {
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
      title: `自定义汇报 ${from} ~ ${to}`,
      fileName: `custom-${from}_${to}.md`
    }
  }
  const d = dayjs(date || dayjs().format('YYYY-MM-DD'))
  if (kind === 'day') {
    const day = d.format('YYYY-MM-DD')
    return {
      from: `${day}T00:00:00.000Z`,
      to: `${day}T23:59:59.999Z`,
      title: `日报 ${day}`,
      fileName: `day-${day}.md`
    }
  }
  if (kind === 'week') {
    const start = d.startOf('isoWeek')
    const end = d.endOf('isoWeek')
    const week = d.isoWeek()
    const year = d.isoWeekYear()
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      title: `周报 ${year}-W${String(week).padStart(2, '0')}（${start.format('MM-DD')} ~ ${end.format('MM-DD')}）`,
      fileName: `week-${year}-W${String(week).padStart(2, '0')}.md`
    }
  }
  // month
  const start = d.startOf('month')
  const end = d.endOf('month')
  const ym = d.format('YYYY-MM')
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    title: `月报 ${ym}`,
    fileName: `month-${ym}.md`
  }
}

function buildMarkdown(title: string, accountName: string, commits: StoredCommit[]): string {
  const byRepo = new Map<string, StoredCommit[]>()
  for (const c of commits) {
    if (!byRepo.has(c.repoName)) byRepo.set(c.repoName, [])
    byRepo.get(c.repoName)!.push(c)
  }

  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`- 账号：${accountName}`)
  lines.push(`- 提交数：${commits.length}`)
  lines.push(`- 生成时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`)
  lines.push('')
  lines.push('## 工作摘要（草稿）')
  lines.push('')
  lines.push('> 以下按项目列出完整提交说明，可据此改写成汇报用语。')
  lines.push('')

  for (const [repo, list] of [...byRepo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`### ${repo}`)
    lines.push('')
    for (const c of list) {
      const time = dayjs(c.committedAt).format('MM-DD HH:mm')
      const text = commitFullText(c)
      const [first, ...rest] = text.split('\n')
      lines.push(`- [${time}] ${first}`)
      for (const line of rest) {
        lines.push(`  ${line}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function generateReport(req: ReportRequest, exportFile = true): ReportResult {
  const account = getAccount(req.accountId)
  if (!account) throw new Error('账号不存在')

  const { from, to, title, fileName } = rangeFor(req.kind, req.date, req.from, req.to)
  const { items } = db.queryCommits({
    accountId: req.accountId,
    from,
    to,
    limit: 5000
  })

  const markdown = buildMarkdown(title, account.name, items)
  let filePath: string | undefined
  if (exportFile) {
    const dir = join(reportsDir(), req.accountId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    filePath = join(dir, fileName)
    writeFileSync(filePath, markdown, 'utf8')
  }

  return {
    title,
    markdown,
    filePath,
    commitCount: items.length
  }
}
