export interface TimeRangeOption {
  hours: number
  label: string
}

export const TIME_RANGES: TimeRangeOption[] = [
  { hours: 1, label: 'Last 1 hour' },
  { hours: 6, label: 'Last 6 hours' },
  { hours: 12, label: 'Last 12 hours' },
  { hours: 24, label: 'Last 24 hours' },
  { hours: 72, label: 'Last 3 days' },
  { hours: 168, label: 'Last 7 days' },
  { hours: 336, label: 'Last 14 days' },
  { hours: 720, label: 'Last 30 days' },
  { hours: 1440, label: 'Last 60 days' },
  { hours: 2160, label: 'Last 90 days' },
]

export function isTimeRangeHours(hours: number): boolean {
  return TIME_RANGES.some((r) => r.hours === hours)
}

export function formatTimeRangeLabel(hours: number): string {
  return TIME_RANGES.find((r) => r.hours === hours)?.label ?? `${hours} hours`
}

// ── Relative time formatter ─────────────────────────────────

export function formatRelative(dateStr: string): string {
  if (!dateStr) return '-'
  const now = Date.now()
  const then = Date.parse(dateStr)
  if (Number.isNaN(then)) return '-'
  const diffMs = now - then
  const diffSec = diffMs / 1000
  if (diffSec < 60) return `${Math.round(diffSec)} second${Math.round(diffSec) === 1 ? '' : 's'} ago`
  const minutes = Math.round(diffSec / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago at ${String(hours).padStart(2, '0')}:${String(remainingMin).padStart(2, '0')}`
  const days = Math.round(diffMs / 86400000)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const weeks = Math.round(diffMs / 604800000)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const months = Math.round(diffMs / 2592000000)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const years = Math.round(diffMs / 31536000000)
  return `${years} year${years === 1 ? '' : 's'} ago at ${formatDate(then)}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}
