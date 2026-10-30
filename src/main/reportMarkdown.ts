import dayjs from 'dayjs'
import type { StoredCommit } from '@shared/types'
import { commitFullText } from '@shared/commitText'

export function buildReportHeader(
  title: string,
  accountName: string,
  commitCount: number
): string {
  return [
    `# ${title}`,
    '',
    `- 账号：${accountName}`,
    `- 提交数：${commitCount}`,
    `- 生成时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
    ''
  ].join('\n')
}

/**
 * 按仓列出提交明细（Markdown）
 */
export function buildCommitDetailsMarkdown(commits: StoredCommit[]): string {
  const byRepo = new Map<string, StoredCommit[]>()
  for (const c of commits) {
    if (!byRepo.has(c.repoName)) byRepo.set(c.repoName, [])
    byRepo.get(c.repoName)!.push(c)
  }

  const lines: string[] = []
  const repos = Array.from(byRepo.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [repo, list] of repos) {
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
  return lines.join('\n').trimEnd()
}

/**
 * 供 LLM 阅读的提交上下文；超长时截断并注明
 */
export function buildCommitContextText(commits: StoredCommit[], maxChars: number): string {
  const full = buildCommitDetailsMarkdown(commits)
  if (full.length <= maxChars) return full
  return `${full.slice(0, maxChars)}\n\n…（已截断，原文共 ${full.length} 字符）`
}
