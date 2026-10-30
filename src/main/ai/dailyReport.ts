import dayjs from 'dayjs'
import type { ReportRequest, ReportResult, StoredCommit } from '@shared/types'
import { getAccount, listAccounts } from '../accounts'
import { db } from '../db'
import { rangeFor } from '../reportRange'
import {
  buildCommitContextText,
  buildCommitDetailsMarkdown,
  buildReportHeader
} from '../reportMarkdown'
import { loadSettings } from '../settings'
import { loadAiApiKey } from '../vault'
import { chatCompletion } from './openaiCompat'

const MAX_CONTEXT_CHARS = 48_000

function fillTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = vars[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

function assembleAiMarkdown(
  title: string,
  accountName: string,
  commits: StoredCommit[],
  summary: string
): string {
  const lines: string[] = []
  lines.push(buildReportHeader(title, accountName, commits.length))
  lines.push('## 工作摘要')
  lines.push('')
  lines.push(summary.trim())
  lines.push('')
  lines.push('## 按仓提交明细')
  lines.push('')
  lines.push(buildCommitDetailsMarkdown(commits))
  return lines.join('\n').trimEnd() + '\n'
}

/**
 * 按报告区间 AI 润色；仅返回内存结果，不落盘
 */
export async function generateAiReport(
  req: ReportRequest
): Promise<ReportResult & { skipped?: boolean; usedAi: boolean }> {
  const account = getAccount(req.accountId)
  if (!account) throw new Error('账号不存在')

  const settings = loadSettings()
  const apiKey = loadAiApiKey()
  if (!apiKey) throw new Error('未配置 AI API Key')
  if (!settings.aiBaseUrl.trim()) throw new Error('未配置 AI Base URL')
  if (!settings.aiModel.trim()) throw new Error('未配置 AI 模型名')

  const { from, to, title, period, kindLabel } = rangeFor(
    req.kind,
    req.date,
    req.from,
    req.to
  )

  const { items } = db.queryCommits({
    accountId: req.accountId,
    from,
    to,
    limit: 5000
  })

  if (items.length === 0) {
    return {
      title,
      markdown: '',
      commitCount: 0,
      skipped: true,
      usedAi: false
    }
  }

  const commitsText = buildCommitContextText(items, MAX_CONTEXT_CHARS)
  const userContent = fillTemplate(settings.aiUserPromptTemplate, {
    date: period,
    period,
    kind: kindLabel,
    accountName: account.name,
    commitCount: items.length,
    commits: commitsText
  })

  const summary = await chatCompletion({
    baseUrl: settings.aiBaseUrl,
    apiKey,
    model: settings.aiModel,
    messages: [
      { role: 'system', content: settings.aiSystemPrompt },
      { role: 'user', content: userContent }
    ]
  })

  return {
    title,
    markdown: assembleAiMarkdown(title, account.name, items, summary),
    commitCount: items.length,
    usedAi: true
  }
}

/** 日区间润色（内存） */
export async function generateAiDailyReport(
  accountId: string,
  date?: string
): Promise<ReportResult & { skipped?: boolean; usedAi: boolean }> {
  return generateAiReport({
    accountId,
    kind: 'day',
    date: date || dayjs().format('YYYY-MM-DD')
  })
}

export interface AiDailyBatchResult {
  date: string
  results: {
    accountId: string
    accountName: string
    ok: boolean
    skipped?: boolean
    message: string
  }[]
}

/**
 * 为全部账号生成指定日 AI 日报（仅内存，不落盘）
 */
export async function runAiDailyForAllAccounts(
  date?: string
): Promise<AiDailyBatchResult> {
  const day = date || dayjs().format('YYYY-MM-DD')
  const accounts = listAccounts()
  const results: AiDailyBatchResult['results'] = []

  for (const account of accounts) {
    try {
      const r = await generateAiDailyReport(account.id, day)
      if (r.skipped) {
        results.push({
          accountId: account.id,
          accountName: account.name,
          ok: true,
          skipped: true,
          message: '今日无提交，已跳过'
        })
      } else {
        results.push({
          accountId: account.id,
          accountName: account.name,
          ok: true,
          message: `已生成（${r.commitCount} 条提交）`
        })
      }
    } catch (e) {
      results.push({
        accountId: account.id,
        accountName: account.name,
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      })
    }
  }

  return { date: day, results }
}

/**
 * 发送极短请求验证 Base URL / Key / 模型是否可用
 */
export async function testAiConnection(): Promise<{ ok: true; reply: string }> {
  const settings = loadSettings()
  const apiKey = loadAiApiKey()
  if (!apiKey) throw new Error('未配置 AI API Key')
  if (!settings.aiBaseUrl.trim()) throw new Error('未配置 AI Base URL')
  if (!settings.aiModel.trim()) throw new Error('未配置 AI 模型名')

  const reply = await chatCompletion({
    baseUrl: settings.aiBaseUrl,
    apiKey,
    model: settings.aiModel,
    messages: [
      { role: 'system', content: '你是连通性测试助手。' },
      { role: 'user', content: '请只回复两个字：成功' }
    ],
    timeoutMs: 30_000
  })

  return { ok: true, reply: reply.slice(0, 80) }
}
