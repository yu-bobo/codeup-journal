import dayjs from 'dayjs'
import type { ReportKind, ReportRequest, ReportResult } from '@shared/types'
import { getAccount, listAccounts } from '../accounts'
import { resolveStatutoryWorkdays } from '../cnWorkdays'
import { db } from '../db'
import { rangeFor } from '../reportRange'
import { buildCommitContextText } from '../reportMarkdown'
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

function guidanceForKind(kind: ReportKind): string {
  if (kind === 'day') return '日报：全文合计约 3～8 条，合并同类。'
  if (kind === 'week') return '周报：全文合计约 3～7 条（跨仓合计），宁少勿碎。'
  if (kind === 'month') return '月报：全文合计约 5～12 条，按主题归并。'
  return '自定义区间：按跨度控制条数，合计约 5～12 条，宁少勿碎。'
}
// AI 总结
// 去掉模型偶发包上的围栏/标题，压缩空行，便于直接粘贴
function normalizeAiSummary(summary: string): string {
  let s = summary.trim()
  const fenced = s.match(/^```(?:text|markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```$/i)
  if (fenced) s = fenced[1].trim()
  s = s
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^\s*提交\s*\d+\s*条(?:；法定工作日：\d+\s*天)?[。.]?\s*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return s
}

// 仅「提交数 + 法定工作日（周/月）+ 要点」，不附提交明细
function assembleAiMarkdown(
  commitCount: number,
  summary: string,
  statutoryWorkdays?: number
): string {
  const body = normalizeAiSummary(summary)
  const workdayPart =
    statutoryWorkdays != null ? `；法定工作日：${statutoryWorkdays} 天` : ''
  const header = `提交 ${commitCount} 条${workdayPart}。`
  if (!body) {
    return `${header}\n该时段无符合条件的可归纳要点。\n`
  }
  return `${header}\n${body}\n`
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

  const statutoryWorkdays = await resolveStatutoryWorkdays(req.kind, req.date)

  if (items.length === 0) {
    return {
      title,
      markdown: '',
      commitCount: 0,
      statutoryWorkdays,
      skipped: true,
      usedAi: false
    }
  }

  // 周/月/自定义只喂提交首行，避免模型照抄正文导致条目过长
  const commitsText = buildCommitContextText(items, MAX_CONTEXT_CHARS, {
    subjectOnly: req.kind !== 'day'
  })
  const userContent = fillTemplate(settings.aiUserPromptTemplate, {
    date: period,
    period,
    kind: kindLabel,
    accountName: account.name,
    commitCount: items.length,
    guidance: guidanceForKind(req.kind),
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
    markdown: assembleAiMarkdown(items.length, summary, statutoryWorkdays),
    commitCount: items.length,
    statutoryWorkdays,
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
