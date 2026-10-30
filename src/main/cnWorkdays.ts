import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type { ReportKind, StoredCommit } from '@shared/types'

dayjs.extend(isoWeek)

interface YearDays {
  holidays: string[]
  makeupWorkdays: string[]
  // api | cache | fallback
  source: 'api' | 'cache' | 'fallback'
}

interface TimorYearResponse {
  code: number
  holiday?: Record<
    string,
    {
      holiday: boolean
      name?: string
      date?: string
    }
  >
}

const memory = new Map<number, YearDays>()
const inflight = new Map<number, Promise<YearDays>>()

// 缓存超过该天数则后台刷新（仍先用旧缓存）
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'holiday-cache')
  mkdirSync(dir, { recursive: true })
  return dir
}

function cachePath(year: number): string {
  return join(cacheDir(), `${year}.json`)
}

function parseTimor(year: number, json: TimorYearResponse): YearDays | null {
  if (json.code !== 0 || !json.holiday || typeof json.holiday !== 'object') {
    return null
  }
  const holidays: string[] = []
  const makeupWorkdays: string[] = []
  for (const item of Object.values(json.holiday)) {
    const date = (item.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (item.holiday) holidays.push(date)
    else makeupWorkdays.push(date)
  }
  if (holidays.length === 0 && makeupWorkdays.length === 0) return null
  return { holidays, makeupWorkdays, source: 'api' }
}

function readDiskCache(year: number): { days: YearDays; mtimeMs: number } | null {
  const path = cachePath(year)
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      holidays?: string[]
      makeupWorkdays?: string[]
    }
    if (!Array.isArray(raw.holidays) || !Array.isArray(raw.makeupWorkdays)) return null
    const mtimeMs = statSync(path).mtimeMs
    return {
      days: {
        holidays: raw.holidays,
        makeupWorkdays: raw.makeupWorkdays,
        source: 'cache'
      },
      mtimeMs
    }
  } catch {
    return null
  }
}

function writeDiskCache(year: number, days: YearDays): void {
  writeFileSync(
    cachePath(year),
    JSON.stringify(
      {
        year,
        fetchedAt: new Date().toISOString(),
        holidays: days.holidays,
        makeupWorkdays: days.makeupWorkdays
      },
      null,
      2
    ),
    'utf8'
  )
}

async function fetchYearFromApi(year: number): Promise<YearDays | null> {
  const url = `https://timor.tech/api/holiday/year/${year}/`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'codeup-commit-journal/1.0'
      }
    })
    if (!res.ok) return null
    const json = (await res.json()) as TimorYearResponse
    const parsed = parseTimor(year, json)
    if (!parsed) return null
    writeDiskCache(year, parsed)
    return parsed
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function fallbackYear(): YearDays {
  return { holidays: [], makeupWorkdays: [], source: 'fallback' }
}

/**
 * 拉取并缓存指定年节假日（timor.tech）；失败则用磁盘缓存，再退回 Mon–Fri
 */
export async function ensureYearDays(year: number): Promise<YearDays> {
  const cached = memory.get(year)
  if (cached && cached.source !== 'fallback') return cached

  const pending = inflight.get(year)
  if (pending) return pending

  const job = (async (): Promise<YearDays> => {
    const disk = readDiskCache(year)
    const freshEnough =
      disk != null && Date.now() - disk.mtimeMs < CACHE_MAX_AGE_MS

    if (freshEnough && disk) {
      memory.set(year, disk.days)
      return disk.days
    }

    const fromApi = await fetchYearFromApi(year)
    if (fromApi) {
      memory.set(year, fromApi)
      return fromApi
    }

    if (disk) {
      memory.set(year, disk.days)
      return disk.days
    }

    const fb = fallbackYear()
    memory.set(year, fb)
    return fb
  })()

  inflight.set(year, job)
  try {
    return await job
  } finally {
    inflight.delete(year)
  }
}

function isWorkdayWith(day: Dayjs, entry: YearDays): boolean {
  const key = day.format('YYYY-MM-DD')
  if (entry.source !== 'fallback') {
    if (entry.holidays.includes(key)) return false
    if (entry.makeupWorkdays.includes(key)) return true
  }
  const w = day.day()
  return w >= 1 && w <= 5
}

async function loadYears(years: number[]): Promise<Map<number, YearDays>> {
  const map = new Map<number, YearDays>()
  await Promise.all(
    years.map(async (y) => {
      map.set(y, await ensureYearDays(y))
    })
  )
  return map
}

function countWorkdays(
  from: Dayjs,
  to: Dayjs,
  byYear: Map<number, YearDays>
): number {
  let n = 0
  let d = from.startOf('day')
  const end = to.startOf('day')
  while (d.isBefore(end) || d.isSame(end, 'day')) {
    const entry = byYear.get(d.year()) || fallbackYear()
    if (isWorkdayWith(d, entry)) n++
    d = d.add(1, 'day')
  }
  return n
}

export interface WorkdayStats {
  totalStatutory: number
  elapsedStatutory: number
  rangeEnded: boolean
  commitWorkdays: number
  commitWorkdayDates: string[]
  avgPerCommitWorkday: number | null
  // 用 Mon–Fri 兜底的年份
  fallbackYears: string[]
  // 数据来自接口或本地缓存
  fromNetworkOrCache: boolean
}

/** 周报 / 月报本地日历区间（与报告页选择一致） */
export function workdayBoundsForKind(
  kind: ReportKind,
  date?: string
): { from: Dayjs; to: Dayjs } | null {
  if (kind !== 'week' && kind !== 'month') return null
  const anchor = dayjs(date || undefined)
  if (kind === 'week') {
    return { from: anchor.startOf('isoWeek'), to: anchor.endOf('isoWeek') }
  }
  return { from: anchor.startOf('month'), to: anchor.endOf('month') }
}

/** 仅算区间总法定工作日（不依赖提交列表） */
export async function resolveStatutoryWorkdays(
  kind: ReportKind,
  date?: string
): Promise<number | undefined> {
  const bounds = workdayBoundsForKind(kind, date)
  if (!bounds) return undefined
  const stats = await computeWorkdayStats(bounds.from, bounds.to, [])
  return stats.totalStatutory
}

/**
 * 任意闭区间：法定工作日 + 有提交的法定工作日（按需拉 timor.tech）
 */
export async function computeWorkdayStats(
  from: Dayjs,
  to: Dayjs,
  commits: StoredCommit[],
  today: Dayjs = dayjs()
): Promise<WorkdayStats> {
  const rangeFrom = from.startOf('day')
  const rangeTo = to.startOf('day')
  const rangeEnded = today.isAfter(rangeTo, 'day')
  const elapsedEnd = rangeEnded
    ? rangeTo
    : today.isBefore(rangeFrom, 'day')
      ? rangeFrom
      : today

  const years = new Set<number>()
  let d = rangeFrom
  while (d.isBefore(rangeTo) || d.isSame(rangeTo, 'day')) {
    years.add(d.year())
    d = d.add(1, 'day')
  }
  const yearList = Array.from(years).sort()
  const byYear = await loadYears(yearList)

  const fallbackYears = yearList
    .filter((y) => byYear.get(y)?.source === 'fallback')
    .map(String)
  const fromNetworkOrCache = yearList.some((y) => {
    const s = byYear.get(y)?.source
    return s === 'api' || s === 'cache'
  })

  const totalStatutory = countWorkdays(rangeFrom, rangeTo, byYear)
  const elapsedStatutory = countWorkdays(rangeFrom, elapsedEnd, byYear)

  const commitDays = new Set<string>()
  for (const c of commits) {
    commitDays.add(dayjs(c.committedAt).format('YYYY-MM-DD'))
  }
  const commitWorkdayDates = Array.from(commitDays)
    .filter((key) => {
      const day = dayjs(key)
      const entry = byYear.get(day.year()) || fallbackYear()
      return isWorkdayWith(day, entry)
    })
    .sort()

  const commitWorkdays = commitWorkdayDates.length
  const avgPerCommitWorkday =
    commitWorkdays > 0
      ? Math.round((commits.length / commitWorkdays) * 10) / 10
      : null

  return {
    totalStatutory,
    elapsedStatutory,
    rangeEnded,
    commitWorkdays,
    commitWorkdayDates,
    avgPerCommitWorkday,
    fallbackYears,
    fromNetworkOrCache
  }
}
