import { Notification } from 'electron'
import dayjs from 'dayjs'
import { loadSettings, setLastAiDailyDate } from '../settings'
import { runAiDailyForAllAccounts } from './dailyReport'

let timer: ReturnType<typeof setTimeout> | null = null
let running = false

function msUntilNext(aiDailyAt: string): number {
  const [hh, mm] = aiDailyAt.split(':').map((x) => Number(x))
  const now = dayjs()
  let next = now.hour(hh).minute(mm).second(0).millisecond(0)
  if (!next.isAfter(now)) {
    next = next.add(1, 'day')
  }
  return Math.max(1000, next.diff(now))
}

function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  } catch {
    // 忽略通知失败
  }
}

async function tick(): Promise<void> {
  const settings = loadSettings()
  if (!settings.aiEnabled) {
    scheduleAiDaily()
    return
  }

  const today = dayjs().format('YYYY-MM-DD')
  if (settings.lastAiDailyDate === today) {
    scheduleAiDaily()
    return
  }

  if (running) {
    scheduleAiDaily()
    return
  }

  running = true
  try {
    const batch = await runAiDailyForAllAccounts(today)
    setLastAiDailyDate(today)

    const ok = batch.results.filter((r) => r.ok && !r.skipped).length
    const skipped = batch.results.filter((r) => r.skipped).length
    const fail = batch.results.filter((r) => !r.ok).length

    if (batch.results.length === 0) {
      notify('AI 日报', '无账号可生成')
    } else if (fail === 0) {
      notify(
        'AI 日报已生成',
        `${today}：成功 ${ok}，跳过 ${skipped}`
      )
    } else {
      const firstErr = batch.results.find((r) => !r.ok)
      notify(
        'AI 日报部分失败',
        `${today}：成功 ${ok}，失败 ${fail}${firstErr ? `（${firstErr.accountName}: ${firstErr.message}）` : ''}`
      )
    }
  } catch (e) {
    notify('AI 日报失败', e instanceof Error ? e.message : String(e))
  } finally {
    running = false
    scheduleAiDaily()
  }
}

/**
 * 按设置中的每日时刻重排 AI 日报定时；未启用则只清除定时器
 */
export function scheduleAiDaily(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  const settings = loadSettings()
  if (!settings.aiEnabled) return

  const delay = msUntilNext(settings.aiDailyAt)
  console.log(
    `[ai] next daily report in ${Math.round(delay / 1000)}s at ${settings.aiDailyAt}`
  )
  timer = setTimeout(() => {
    void tick()
  }, delay)
}

export function stopAiDailySchedule(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/**
 * 手动立即跑全部账号今日日报（不改 lastAiDailyDate，避免影响定时防重）
 */
export async function runAiDailyNow(): Promise<
  Awaited<ReturnType<typeof runAiDailyForAllAccounts>>
> {
  if (running) throw new Error('AI 日报正在生成中，请稍候')
  running = true
  try {
    return await runAiDailyForAllAccounts()
  } finally {
    running = false
  }
}
