// The session's numbers and how they read: pure helpers. Everything that touches $ lives in register.tsx.
import type { SessionRateLimit } from 'claude-code'

import type { LastCall, Limit, Plan, Seen } from '../types'

export const PLUGIN = 'session-manager'
export const TITLE = 'Session Manager'

// Palette: warm gold for the plan, orange for the model, mauve for effort, green to orange as context fills, red for a cold cache.
export const GOLD = '#d9a441'
export const ORANGE = '#e06c3c'
export const MAUVE = '#a8729a'
export const GREEN = '#1f9d63'
export const SLATE = '#2a2f3a'
export const RED = '#e5484d'
export const INK = '#e8e6e3'
export const MUTED = '#7d8190'

// Control Panel's model and effort pick, when it is installed: its requests go out with it.
export type Pick = { model: string | null; effort: string | null }

export const MODEL_NAMES: Readonly<Record<string, string>> = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-haiku-5-5': 'Haiku 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-opus-5-5': 'Opus 5.5',
  'claude-opus-5-5[1m]': 'Opus 5.5 1M',
  'claude-fable-5-1': 'Fable 5.1',
}

export const EFFORT_NAMES: Readonly<Record<string, string>> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' }

export const modelName = (id: string) => MODEL_NAMES[id] ?? id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export const effortName = (id: string) => EFFORT_NAMES[id] ?? id

/** Plain under half, gold to 75%, orange above. */
export const fillColor = (percent: number) => (percent >= 75 ? ORANGE : percent >= 50 ? GOLD : GREEN)

/** The context bar: `width` cells, filled to the percent. */
export const meterBar = (percent: number, width = 8) => {
  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return { filled: '█'.repeat(filled), empty: '░'.repeat(width - filled) }
}

export const untilReset = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  const mins = Math.max(0, Math.ceil((at - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

const toLimit = (limit: SessionRateLimit | undefined): Limit | null =>
  limit ? { percent: limit.percentUsed, ...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {}) } : null

/** The short window: the five-hour one, else any other that isn't the week. */
export const pickLimit = (limits: readonly SessionRateLimit[]) =>
  toLimit(limits.find(l => l.kind === 'five_hour') ?? limits.find(l => l.kind !== 'seven_day'))

/** The weekly window. */
export const pickWeek = (limits: readonly SessionRateLimit[]) => toLimit(limits.find(l => l.kind === 'seven_day'))

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** When a window resets, short: a countdown under a day away (4h12m), else the weekday (Fri). */
export const resetText = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  return at - now < 86_400_000 ? untilReset(resetsAt, now).replace(/ 0m$/, '').replace(/ /g, '') : DAYS[new Date(at).getDay()]!
}

/** A window's piece of the row: `usage 6% · resets 4h12m`. */
export const limitText = (label: string, l: Limit, now: number) => {
  const reset = resetText(l.resetsAt, now)
  return `${label} ${Math.round(l.percent)}%${reset ? ` · resets ${reset}` : ''}`
}


/**
 * How long the prompt cache stays warm after a request. Claude Code doesn't
 * tell a mod, so this is the usual lifetime: an hour on a subscription, five
 * minutes on an API key.
 */
export const cacheTtlMs = (plan: Plan | null) => (plan === 'API' ? 5 : 60) * 60_000

/** One model however it's spelled: `claude-opus-5-5[1m]` and `claude-opus-5-5-20260101` both read `claude-opus-5-5`. */
export const baseModel = (id: string) => id.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').toLowerCase()

/**
 * Time left before the cache goes cold: `cache 42m`, `cache <1m`, `cache cold`;
 * '' before the first response. Each model has its own cache, so when the next
 * request goes to a different model than the last reply came from, it's cold.
 */
export const cacheText = (last: LastCall | null, ttlMs: number, now: number, nextModel?: string) => {
  if (last === null) return ''
  if (last.model && nextModel && baseModel(last.model) !== baseModel(nextModel)) return 'cache cold · new model'
  const left = last.at + ttlMs - now
  if (left <= 0) return 'cache cold'
  const mins = Math.floor(left / 60_000)
  return mins < 1 ? 'cache <1m' : `cache ${mins}m`
}

export const isCold = (cache: string) => cache.startsWith('cache cold')

// Under this many minutes left, the cache turns red; under 15, gold.
const CACHE_WARN_MINS = 5

export const cacheColor = (cache: string) => {
  const mins = /^cache (\d+)m$/.exec(cache)
  if (isCold(cache) || cache === 'cache <1m') return RED
  const left = mins ? Number(mins[1]) : null
  return left !== null && left < CACHE_WARN_MINS ? RED : left !== null && left < 15 ? GOLD : INK
}

/**
 * What the next request goes out with: Control Panel's pick where set, else the session's model (which `/model`
 * changes straight away), else what was last sent. The last-sent model only changes on the next request, so
 * putting it first hid a `/model` switch, and with it the cold cache it causes.
 */
export const nextRequest = (pick: Pick | undefined, s: Seen | null, sessionModel?: string) => ({
  model: pick?.model ?? sessionModel ?? s?.model ?? null,
  effort: pick?.effort ?? s?.effort ?? null,
})
