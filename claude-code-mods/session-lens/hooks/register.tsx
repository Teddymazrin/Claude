import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit, Timer } from 'claude-code'

import type { LastCall, Limit, Meter, Plan, Seen } from '../types'

// Palette: warm gold for the plan, orange for the model, mauve for effort, green to orange as context fills.
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const MAUVE = '#a8729a'
const GREEN = '#1f9d63'
const SLATE = '#2a2f3a'
const RED = '#e5484d'

const seen = atom({ plugin: 'session-lens', key: 'seen' } as const, null)
const meter = atom({ plugin: 'session-lens', key: 'meter' } as const, { plan: null, context: null, limit: null, week: null })
// When the main thread's last response finished, and which model gave it: the prompt cache's clock starts there.
const lastCall = atom({ plugin: 'session-lens', key: 'lastCall' } as const, null)

// Control Panel's model and effort pick, when it is installed: its requests go out with it.
type Pick = { model: string | null; effort: string | null }
const CONTROL_PANEL_CHOICE = { plugin: 'control-panel', key: 'choice' } as const

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

/** Plain under half, gold to 75%, orange above. */
const limitColor = (percent: number) => (percent >= 75 ? ORANGE : percent >= 50 ? GOLD : undefined)

/** A key in the environment or in ~/.claude.json means API billing; else a subscription login. */
async function detectPlan($: EngineInterface, limits: readonly SessionRateLimit[]): Promise<Plan> {
  if (limits.length > 0) return 'Subscription'
  const keys = await Promise.all([
    $.env.get('ANTHROPIC_API_KEY'),
    $.env.get('ANTHROPIC_AUTH_TOKEN'),
    $.env.get('CLAUDE_CODE_USE_BEDROCK'),
    $.env.get('CLAUDE_CODE_USE_VERTEX'),
  ])
  if (keys.some(Boolean)) return 'API'
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const config = home ? await $.fs.read(`${home}/.claude.json`).catch(() => '') : ''
  return /"primaryApiKey"\s*:\s*"[^"]/.test(config) ? 'API' : 'Subscription'
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

// From this context percentage, a cold cache gets a warning: the next message re-reads that much at full price.
export const COLD_WARN_AT = 40
export const COLD_WARNING = '⚠ your next message re-reads the entire chat at full price and uses more of your usage · /handoff to start fresh'

/** True when the cache is cold (or cold for a new model) and the chat is big enough that the next message costs a lot of usage. */
export const isCostlyCold = (cache: string, context: number | null) => cache.startsWith('cache cold') && (context ?? 0) >= COLD_WARN_AT

/** The cache piece, with the warning after it when a cold cache will cost a lot. */
export const cacheWithWarning = (cache: string, context: number | null) => (isCostlyCold(cache, context) ? `${cache} ${COLD_WARNING}` : cache)

/** The row as plain text: plan | model | effort | context bar | cache | 5-hour window | weekly window. */
export const statusText = (m: Meter, model: string | null | undefined, effort: string | null | undefined, now: number, cache = '') => {
  const bar = meterBar(m.context ?? 0)
  const parts = [
    m.plan ?? '…',
    model ? modelName(model) : '…',
    `effort ${effort ? effortName(effort) : '…'}`,
    `ctx ${bar.filled}${bar.empty} ${m.context === null ? '…' : `${m.context}%`}`,
  ]
  if (cache) parts.push(cacheWithWarning(cache, m.context))
  if (m.limit) parts.push(limitText('usage', m.limit, now))
  if (m.week) parts.push(limitText('weekly', m.week, now))
  return parts.join(' | ')
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

async function measure($: EngineInterface, context: number | undefined, limits: readonly SessionRateLimit[]) {
  const before = await read($, meter)
  const plan = before.plan === 'Subscription' || (before.plan && limits.length === 0) ? before.plan : await detectPlan($, limits)
  const limit = pickLimit(limits) ?? before.limit
  const week = pickWeek(limits) ?? before.week
  await update($, meter, () => ({ plan, context: context ?? before.context, limit, week }))
}

// Control Panel's pick, or undefined when it isn't installed or hasn't picked.
async function readPick($: EngineInterface): Promise<Pick | undefined> {
  const held = await $.state.get(CONTROL_PANEL_CHOICE as never).catch(() => undefined)
  const value = (held as { value?: unknown } | undefined)?.value as Partial<Pick> | undefined
  return value && typeof value === 'object' ? { model: value.model ?? null, effort: value.effort ?? null } : undefined
}

let tick: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    // Redraw once a minute so the cache countdown and the reset times move while the session is idle.
    tick?.cancel()
    tick = $.clock.every(60_000, () => {
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  // What each main-thread request goes out with, as it reaches this mod.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const now: Seen = { model: e.model, effort: e.effort === undefined ? null : String(e.effort) }
      const last = await read($, seen)
      if (last?.model !== now.model || last?.effort !== now.effort) await update($, seen, () => now)
    }
    return yield* next(e)
  })

  // The main thread's response just landed: the cache was read or written now.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage) {
      const call = { at: await $.clock.now(), model: e.usage.model }
      await update($, lastCall, () => call)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await measure($, e.context.percent, e.rateLimits)
    return next(e)
  }).catch(($, e, next) => next(e))

  // A model switch changes which cache is warm: redraw now rather than at the next minute's tick.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    $.ui.invalidate('ui.render')
    return result
  }).catch(($, e, next) => next(e))

  // The status row on the left, in the hint line's place, above the engine's hint.
  // Terminal only: the desktop app does not draw a mod's tree in the hint line.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal') return below
    const { Box, Text } = $.ui.resolve(e)

    const m = await read($, meter)
    const sessionModel = await $.session.model().catch(() => undefined)
    const { model, effort } = nextRequest(await readPick($), await read($, seen), sessionModel)
    const now = await $.clock.now()
    // One piece of the row, kept whole: a narrow terminal wraps the row between pieces, never inside one.
    const piece = (key: string, children: RenderChildren, isFirst = false) => (
      <Box key={key} flexDirection="row" flexShrink={0}>
        {!isFirst && <Text dimColor> | </Text>}
        {children}
      </Box>
    )
    const ctx = m.context ?? 0
    const bar = meterBar(ctx)
    const ctxColor = ctx >= 75 ? ORANGE : ctx >= 50 ? GOLD : GREEN
    const cache = cacheText(await read($, lastCall), cacheTtlMs(m.plan), now, model ?? undefined)
    // A usage window: dim label, bright percent, dim reset.
    const window = (label: string, l: Limit | null) => {
      if (!l) return null
      const reset = resetText(l.resetsAt, now)
      return piece(label, [
        <Text key={`${label}-label`} dimColor>{`${label} `}</Text>,
        <Text key={`${label}-pct`} color={limitColor(l.percent)}>{`${Math.round(l.percent)}%`}</Text>,
        reset ? <Text key={`${label}-reset`} dimColor>{` · resets ${reset}`}</Text> : null,
      ])
    }

    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Box key="session-lens-status" flexDirection="row" flexWrap="wrap">
          {piece('plan', <Text color={GOLD}>{m.plan ?? '…'}</Text>, true)}
          {piece('model', <Text bold color={ORANGE}>{model ? modelName(model) : '…'}</Text>)}
          {piece('effort', [
            <Text key="effort-label" dimColor>effort </Text>,
            <Text key="effort-value" color={MAUVE}>{effort ? effortName(effort) : '…'}</Text>,
          ])}
          {piece('ctx', [
            <Text key="ctx-label" dimColor>ctx </Text>,
            <Text key="ctx-filled" color={ctxColor}>{bar.filled}</Text>,
            <Text key="ctx-empty" color={SLATE}>{bar.empty}</Text>,
            <Text key="ctx-pct" color={ctxColor}> {m.context === null ? '…' : `${ctx}%`}</Text>,
          ])}
          {cache && piece('cache', [
            <Text key="cache-text" color={RED}>{cache}</Text>,
            isCostlyCold(cache, m.context) ? <Text key="cache-warn" bold color={RED}>{` ${COLD_WARNING}`}</Text> : null,
          ])}
          {window('usage', m.limit)}
          {window('weekly', m.week)}
        </Box>
        {below}
      </Box>
    )
  })
}
