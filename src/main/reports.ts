import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { ReportRequest, ReportResult, StoredCommit } from '@shared/types'
import { getAccount } from './accounts'
import { resolveStatutoryWorkdays } from './cnWorkdays'
import { db } from './db'
import { reportsDir } from './paths'
import { rangeFor } from './reportRange'
import { buildCommitDetailsMarkdown, buildReportHeader } from './reportMarkdown'

function buildTemplateMarkdown(
  title: string,
  accountName: string,
  commits: StoredCommit[]
): string {
  const lines: string[] = []
  lines.push(buildReportHeader(title, accountName, commits.length))
  lines.push('## 工作摘要（草稿）')
  lines.push('')
  lines.push('> 以下按项目列出完整提交说明，可据此改写成汇报用语。')
  lines.push('')
  lines.push(buildCommitDetailsMarkdown(commits))
  lines.push('')
  return lines.join('\n')
}

/**
 * 生成模板报告（预览不落盘）；AI 总结走独立接口
 */
export async function generateReport(
  req: ReportRequest,
  exportFile = true
): Promise<ReportResult> {
  const account = getAccount(req.accountId)
  if (!account) throw new Error('账号不存在')

  const { from, to, title, fileName } = rangeFor(req.kind, req.date, req.from, req.to)
  const { items } = db.queryCommits({
    accountId: req.accountId,
    from,
    to,
    limit: 5000
  })

  const statutoryWorkdays = await resolveStatutoryWorkdays(req.kind, req.date)
  const markdown = buildTemplateMarkdown(title, account.name, items)
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
    commitCount: items.length,
    statutoryWorkdays
  }
}
