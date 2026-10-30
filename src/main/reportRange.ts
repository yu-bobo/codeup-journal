import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import type { ReportKind } from '@shared/types'

dayjs.extend(isoWeek)

export function rangeFor(
  kind: ReportKind,
  date?: string,
  from?: string,
  to?: string
): {
  from: string
  to: string
  title: string
  fileName: string
  // 给人看的区间说明，供提示词 {{period}}
  period: string
  // 日/周/月/自定义
  kindLabel: string
} {
  if (kind === 'custom') {
    if (!from || !to) throw new Error('自定义区间需提供起止日期')
    return {
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
      title: `自定义汇报 ${from} ~ ${to}`,
      fileName: `custom-${from}_${to}.md`,
      period: `${from} ~ ${to}`,
      kindLabel: '自定义汇报'
    }
  }
  const d = dayjs(date || dayjs().format('YYYY-MM-DD'))
  if (kind === 'day') {
    const day = d.format('YYYY-MM-DD')
    return {
      from: `${day}T00:00:00.000Z`,
      to: `${day}T23:59:59.999Z`,
      title: `日报 ${day}`,
      fileName: `day-${day}.md`,
      period: day,
      kindLabel: '日报'
    }
  }
  if (kind === 'week') {
    const start = d.startOf('isoWeek')
    const end = d.endOf('isoWeek')
    const week = d.isoWeek()
    const year = d.isoWeekYear()
    const label = `${year}-W${String(week).padStart(2, '0')}（${start.format('MM-DD')} ~ ${end.format('MM-DD')}）`
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      title: `周报 ${label}`,
      fileName: `week-${year}-W${String(week).padStart(2, '0')}.md`,
      period: label,
      kindLabel: '周报'
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
    fileName: `month-${ym}.md`,
    period: ym,
    kindLabel: '月报'
  }
}
