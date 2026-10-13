import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { LastCall, Limit, Meter, Plan } from '../types'

// Palette: green, gold and orange as context fills; red when the cache is about to go cold.
const GREEN = '#1f9d63'
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const RED = '#e5484d'
const SLATE = '#2a2f3a'
const INK = '#e8e6e3'
const MUTED = '#7d8190'
const BLACK = '#0c0c0e'

const meter = atom({ plugin: 'session-meter', key: 'meter' } as const, { plan: null, context: null, limit: null, week: null })
// When the main thread's last response finished, and which model gave it: the prompt cache's clock starts there.
const lastCall = atom({ plugin: 'session-meter', key: 'lastCall' } as const, null)
const isOpen = atom({ plugin: 'session-meter', key: 'isOpen' } as const, false)

// Under this many minutes left, the cache piece turns red.
const CACHE_WARN_MINS = 5

let tick: Timer | undefined

/** Plain under half, gold to 75%, orange above. */
export const fillColor = (percent: number) => (percent >= 75 ? ORANGE : percent >= 50 ? GOLD : GREEN)

/**
 * How long the prompt cache stays warm after a request. Claude Code doesn't
 * tell a mod, so this is the usual lifetime: an hour on a subscription, five
 * minutes on an API key.
 */
export const cacheTtlMs = (plan: Plan | null) => (plan === 'API' ? 5 : 60) * 60_000

/** One model however it's spelled: `claude-opus-5-5[1m]` and `claude-opus-5-5-20260101` both read `claude-opus-5-5`. */
export const baseModel = (id: string) => id.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '').toLowerCase()

/**
 * Minutes the cache stays warm: a number, 0 once cold, null before the first
 * response. Each model has its own cache, so a switch to another model is cold.
 */
export const cacheMinsLeft = (last: LastCall | null, ttlMs: number, now: number, nextModel?: string) => {
  if (last === null) return null
  if (last.model && nextModel && baseModel(last.model) !== baseModel(nextModel)) return 0
  return Math.max(0, Math.floor((last.at + ttlMs - now) / 60_000))
}

/** `cache 42m`, `cache <1m`, `cache cold`; '' before the first response. */
export const cacheText = (mins: number | null, last: LastCall | null, now: number, ttlMs: number) => {
  if (mins === null) return ''
  if (mins > 0) return `cache ${mins}m`
  return last && last.at + ttlMs > now ? 'cache <1m' : 'cache cold'
}

export const cacheColor = (text: string, mins: number | null) =>
  text === 'cache cold' || text === 'cache <1m' || (mins !== null && mins < CACHE_WARN_MINS) ? RED : mins !== null && mins < 15 ? GOLD : INK

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** When a window resets: a countdown under a day away (4h12m, 38m), else the weekday (Fri). */
export const resetText = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  if (at - now >= 86_400_000) return DAYS[new Date(at).getDay()]!
  const mins = Math.max(0, Math.ceil((at - now) / 60_000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`
}

const toLimit = (limit: SessionRateLimit | undefined): Limit | null =>
  limit ? { percent: limit.percentUsed, ...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {}) } : null

/** The short window: the five-hour one, else any other that isn't the week. */
export const pickLimit = (limits: readonly SessionRateLimit[]) =>
  toLimit(limits.find(l => l.kind === 'five_hour') ?? limits.find(l => l.kind !== 'seven_day'))

/** The weekly window. */
export const pickWeek = (limits: readonly SessionRateLimit[]) => toLimit(limits.find(l => l.kind === 'seven_day'))

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

async function measure($: EngineInterface, context: number | undefined, limits: readonly SessionRateLimit[]) {
  const before = await read($, meter)
  const plan = before.plan === 'Subscription' || (before.plan && limits.length === 0) ? before.plan : await detectPlan($, limits)
  await update($, meter, () => ({
    plan,
    context: context ?? before.context,
    limit: pickLimit(limits) ?? before.limit,
    week: pickWeek(limits) ?? before.week,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    // Redraw once a minute so the cache countdown moves while the session is idle.
    tick?.cancel()
    tick = $.clock.every(60_000, () => {
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e.context.percent, e.rateLimits)
    return next(e)
  }).catch(($, e, next) => next(e))

  // The main thread's response just landed: the cache was read or written now.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage) {
      const call = { at: await $.clock.now(), model: e.usage.model }
      await update($, lastCall, () => call)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A chip at the left of the footer, in the app only: the terminal has Control Panel's status row.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface === 'terminal') return below
    const { Box, Text, Button } = $.ui.resolve(e)

    const m = await read($, meter)
    const now = await $.clock.now()
    const last = await read($, lastCall)
    const ttl = cacheTtlMs(m.plan)
    const mins = cacheMinsLeft(last, ttl, now, await $.session.model().catch(() => undefined))
    const cache = cacheText(mins, last, now, ttl)
    const open = await read($, isOpen)
    const ctx = m.context ?? 0

    const window = (key: string, label: string, l: Limit | null) => {
      if (!l) return null
      const reset = resetText(l.resetsAt, now)
      return (
        <Box key={key} flexDirection="row">
          <Text color={MUTED}>{`${label}`.padEnd(10)}</Text>
          <Text color={fillColor(l.percent)}>{`${Math.round(l.percent)}%`}</Text>
          {reset ? <Text color={MUTED}>{`  resets ${reset}`}</Text> : null}
        </Box>
      )
    }
    const details = open ? (
      <Box key="session-meter-details" flexDirection="column" backgroundColor={BLACK} paddingX={1}>
        {window('session-meter-5h', '5-hour', m.limit)}
        {window('session-meter-week', 'Weekly', m.week)}
        {!m.limit && !m.week ? <Text color={MUTED}>No usage reading yet</Text> : null}
        {last ? <Text color={MUTED}>{`Cache lasts ${ttl / 60_000}m after each reply`}</Text> : null}
      </Box>
    ) : null

    const toggle = () => update($, isOpen, o => !o)
    const chip = (
      <Box key="session-meter-chip" backgroundColor={SLATE} paddingX={1}>
        <Button key="session-meter-toggle" plain label="Session meter" hover={{ bold: true }} onPress={toggle}>
          <Text color={MUTED}>ctx </Text>
          <Text color={fillColor(ctx)}>{m.context === null ? '…' : `${ctx}%`}</Text>
          {cache ? <Text color={MUTED}> · </Text> : null}
          {cache ? <Text color={cacheColor(cache, mins)}>{cache}</Text> : null}
          {m.limit ? <Text color={MUTED}> · usage </Text> : null}
          {m.limit ? <Text color={fillColor(m.limit.percent)}>{`${Math.round(m.limit.percent)}%`}</Text> : null}
        </Button>
      </Box>
    )
    const mine = (
      <Box flexDirection="column" alignItems="flex-start">
        {details}
        {chip}
      </Box>
    )

    const isEngine = 'type' in below && below.type === 'engine'
    // Another mod's chip is beneath: sit to its left, on the bottom line.
    if (!isEngine)
      return (
        <Box flexDirection="row" alignItems="flex-end">
          <Box marginRight={1}>{mine}</Box>
          {below}
        </Box>
      )
    // The engine's modes are beneath: keep them above, the chip on the bottom line.
    return (
      <Box flexDirection="column" alignItems="flex-end">
        {e.props.modes.length > 0 && below}
        {mine}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
