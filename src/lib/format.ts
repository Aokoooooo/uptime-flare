import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(duration)
dayjs.extend(localizedFormat)
dayjs.extend(relativeTime)

export function formatDateTime(secondsOrDate: number | string | Date): string {
  const value = typeof secondsOrDate === 'number' ? secondsOrDate * 1000 : secondsOrDate
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

export function formatDate(seconds: number): string {
  return dayjs(seconds * 1000).format('YYYY-MM-DD')
}

export function formatDuration(totalSeconds: number): string {
  const d = dayjs.duration(Math.max(0, totalSeconds), 'seconds')
  const days = Math.floor(d.asDays())
  const hours = d.hours()
  const minutes = d.minutes()

  const parts = [
    days > 0 ? `${days} 天` : '',
    hours > 0 ? `${hours} 小时` : '',
    minutes > 0 ? `${minutes} 分钟` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' ') : `${Math.round(d.asSeconds())} 秒`
}

export function formatRelativeAge(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 10) return '刚刚'
  if (seconds < 60) return `${seconds} 秒前`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  return `${Math.floor(hours / 24)} 天前`
}

export function monthKey(date: Date = new Date()): string {
  return dayjs(date).format('YYYY-MM')
}

export function addMonths(month: string, amount: number): string {
  return dayjs(`${month}-01`).add(amount, 'month').format('YYYY-MM')
}
