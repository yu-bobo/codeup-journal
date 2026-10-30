import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  getAccount,
  getActiveAccountId,
  listAccounts
} from '../accounts'
import { db } from '../db'
import { getDataRoot } from '../paths'
import { rangeFor } from '../reportRange'
import {
  buildCommitDetailsMarkdown,
  buildCommitSubjectListMarkdown
} from '../reportMarkdown'
import dayjs from 'dayjs'
import type { StoredCommit } from '@shared/types'

const PERIOD_LIMIT = 5000
const DEFAULT_QUERY_LIMIT = 200

function textResult(text: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(isError ? { isError: true } : {})
  }
}

function resolveAccountId(accountId?: string): string {
  const accounts = listAccounts()
  if (accountId?.trim()) {
    const found = accounts.find((a) => a.id === accountId.trim())
    if (!found) throw new Error(`账号不存在：${accountId}`)
    return found.id
  }
  const activeId = getActiveAccountId()
  if (activeId && accounts.some((a) => a.id === activeId)) return activeId
  if (accounts.length === 1) return accounts[0].id
  if (accounts.length === 0) {
    throw new Error(
      `本地无账号。请先在「Codeup提交日志」添加账号并同步。数据目录：${getDataRoot()}`
    )
  }
  throw new Error('存在多个账号，请先调用 list_accounts 后传入 accountId')
}

function formatQueryMarkdown(
  commits: StoredCommit[],
  total: number,
  accountName: string,
  subjectOnly: boolean
): string {
  const lines = [
    `# 提交查询结果`,
    '',
    `- 账号：${accountName}`,
    `- 返回：${commits.length} / 共 ${total} 条`,
    `- 生成时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
    ''
  ]
  if (commits.length === 0) {
    lines.push('（无提交）')
    return lines.join('\n')
  }
  lines.push(
    subjectOnly
      ? buildCommitSubjectListMarkdown(commits)
      : buildCommitDetailsMarkdown(commits)
  )
  return lines.join('\n')
}

function buildHeader(
  title: string,
  accountName: string,
  commitCount: number,
  returnedCount: number
): string {
  const lines = [
    `# ${title}`,
    '',
    `- 账号：${accountName}`,
    `- 提交数：${commitCount}`,
    `- 生成时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`
  ]
  if (returnedCount < commitCount) {
    lines.push(
      `- 说明：仅返回前 ${returnedCount} 条（共 ${commitCount} 条），可缩小区间或提高 limit`
    )
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * 创建只读提交查询 MCP Server（每次 HTTP 请求可新建实例）
 */
export function createJournalMcpServer(): McpServer {
  const server = new McpServer({
    name: 'codeup-journal',
    version: '1.0.0'
  })

  server.tool(
    'list_accounts',
    '列出本地 Codeup 提交日志中的账号（id、名称、是否当前活跃）。总结工作前可先调用以确认 accountId。',
    {},
    async () => {
      try {
        const accounts = listAccounts()
        const activeAccountId = getActiveAccountId()
        if (accounts.length === 0) {
          return textResult(
            [
              '本地无账号。',
              `数据目录：${getDataRoot()}`,
              '请先在「Codeup提交日志」添加账号并同步。'
            ].join('\n')
          )
        }
        const lines = accounts.map((a) => {
          const mark = a.id === activeAccountId ? '（活跃）' : ''
          return `- ${a.name}  id=${a.id}${mark}`
        })
        return textResult(
          [`数据目录：${getDataRoot()}`, `账号数：${accounts.length}`, '', ...lines].join(
            '\n'
          )
        )
      } catch (e) {
        return textResult(e instanceof Error ? e.message : String(e), true)
      }
    }
  )

  server.tool(
    'list_repos',
    '列出某账号下本地已有提交记录的仓库（用于筛选 query_commits）。未传 accountId 时用活跃账号或唯一账号。',
    {
      accountId: z.string().optional().describe('账号 id；省略则用活跃/唯一账号')
    },
    async ({ accountId }) => {
      try {
        const id = resolveAccountId(accountId)
        const account = getAccount(id)
        const repos = db.listReposWithCommits(id)
        if (repos.length === 0) {
          return textResult(
            `账号「${account?.name ?? id}」本地尚无提交仓库。请先执行同步。`
          )
        }
        const lines = repos.map(
          (r) => `- ${r.pathWithNamespace || r.name}  repoId=${r.id}`
        )
        return textResult(
          [`账号：${account?.name ?? id}`, `仓库数：${repos.length}`, '', ...lines].join(
            '\n'
          )
        )
      } catch (e) {
        return textResult(e instanceof Error ? e.message : String(e), true)
      }
    }
  )

  server.tool(
    'query_commits',
    '按条件查询本地已同步的提交记录，返回 Markdown 明细，供办公工具总结工作内容。日期为 YYYY-MM-DD。',
    {
      accountId: z.string().optional().describe('账号 id；省略则用活跃/唯一账号'),
      from: z.string().optional().describe('起始日期 YYYY-MM-DD（含当天）'),
      to: z.string().optional().describe('结束日期 YYYY-MM-DD（含当天）'),
      repoId: z.number().int().optional().describe('仓库 id，可选'),
      keyword: z.string().optional().describe('关键词，匹配 title/message/仓库名'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe(`返回条数上限，默认 ${DEFAULT_QUERY_LIMIT}`),
      subjectOnly: z
        .boolean()
        .optional()
        .describe('仅返回提交首行（适合周/月大量提交），默认 false')
    },
    async (args) => {
      try {
        const id = resolveAccountId(args.accountId)
        const account = getAccount(id)
        const fromIso = args.from ? `${args.from}T00:00:00.000Z` : undefined
        const toIso = args.to
          ? args.to.includes('T')
            ? args.to
            : `${args.to}T23:59:59.999Z`
          : undefined
        const { items, total } = db.queryCommits({
          accountId: id,
          repoId: args.repoId,
          from: fromIso,
          to: toIso,
          keyword: args.keyword,
          limit: args.limit ?? DEFAULT_QUERY_LIMIT
        })
        return textResult(
          formatQueryMarkdown(
            items,
            total,
            account?.name ?? id,
            args.subjectOnly === true
          )
        )
      } catch (e) {
        return textResult(e instanceof Error ? e.message : String(e), true)
      }
    }
  )

  server.tool(
    'get_period_commits',
    '按日/周/月/自定义区间拉取提交材料 Markdown（对齐桌面端报告预览口径），供办公工具改写成汇报。周报月报默认只列提交首行。',
    {
      kind: z
        .enum(['day', 'week', 'month', 'custom'])
        .describe('day=日报 week=周报 month=月报 custom=自定义起止'),
      date: z
        .string()
        .optional()
        .describe('锚点日期 YYYY-MM-DD；日/周/月用；省略则为今天'),
      from: z.string().optional().describe('custom 时起始 YYYY-MM-DD'),
      to: z.string().optional().describe('custom 时结束 YYYY-MM-DD'),
      accountId: z.string().optional().describe('账号 id；省略则用活跃/唯一账号'),
      subjectOnly: z
        .boolean()
        .optional()
        .describe('true=仅首行；false=完整说明。省略时 week/month 为 true，其余 false')
    },
    async (args) => {
      try {
        const id = resolveAccountId(args.accountId)
        const account = getAccount(id)
        const range = rangeFor(args.kind, args.date, args.from, args.to)
        const { items, total } = db.queryCommits({
          accountId: id,
          from: range.from,
          to: range.to,
          limit: PERIOD_LIMIT
        })
        const subjectOnly =
          args.subjectOnly ?? (args.kind === 'week' || args.kind === 'month')
        const body =
          items.length === 0
            ? '（该区间无提交）'
            : subjectOnly
              ? buildCommitSubjectListMarkdown(items)
              : buildCommitDetailsMarkdown(items)
        const header = buildHeader(
          range.title,
          account?.name ?? id,
          total,
          items.length
        )
        return textResult([header, '## 提交明细', '', body, ''].join('\n'))
      } catch (e) {
        return textResult(e instanceof Error ? e.message : String(e), true)
      }
    }
  )

  return server
}
