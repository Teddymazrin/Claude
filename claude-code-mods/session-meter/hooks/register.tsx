import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { LastCall, Limit, Meter, Plan } from '../types'

// Palette: green, gold and orange as context fills; red when the cache is about to go cold.
const GREEN = '#1f9d63'
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const RED = '#e5484d'
const INK = '#e8e6e3'
const MUTED = '#7d8190'
const SLATE = '#2a2f3a'

const meter = atom({ plugin: 'session-meter', key: 'meter' } as const, { plan: null, context: null, limit: null, week: null })
// When the main thread's last response finished, and which model gave it: the prompt cache's clock starts there.
const lastCall = atom({ plugin: 'session-meter', key: 'lastCall' } as const, null)

// Under this many minutes left, the cache piece turns red.
const CACHE_WARN_MINS = 5
/** The cold-cache box's line after its title. */
export const COLD_WHY = ' · Your next message re-reads the entire chat at full price and uses more of your usage.'

/** Which cold spell this is: the last reply and the model the next request goes to. A new reply or another switch is a new one. */
export const coldKey = (last: LastCall, model: string | undefined) => `${last.at}|${model ?? ''}`

// The cold spell the box was closed for; it comes back for the next one.
const coldDismissed = atom({ plugin: 'session-meter', key: 'coldDismissed' } as const, null)

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
export const cacheText = (mins: number | null, last: LastCall | null, now: number, ttlMs: number, isSwitched = false) => {
  if (mins === null) return ''
  if (mins > 0) return `cache ${mins}m`
  return !isSwitched && last && last.at + ttlMs > now ? 'cache <1m' : 'cache cold'
}

/** True when the next request goes to another model than the last response came from: that model's cache is cold. */
export const isModelSwitched = (last: LastCall | null, nextModel?: string) =>
  Boolean(last?.model && nextModel && baseModel(last.model) !== baseModel(nextModel))

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

/** One piece of the footer line: a dim label, a colored value, and a dim note after it. */
export type Piece = { key: string; label: string; value: string; color: string; note?: string }

/** The footer line's pieces: context, cache, the 5-hour window (with its reset), the weekly window. */
export const meterPieces = (m: Meter, last: LastCall | null, now: number, nextModel?: string): Piece[] => {
  const ttl = cacheTtlMs(m.plan)
  const mins = cacheMinsLeft(last, ttl, now, nextModel)
  const cache = cacheText(mins, last, now, ttl, isModelSwitched(last, nextModel))
  const pieces: Piece[] = [
    { key: 'ctx', label: 'ctx', value: m.context === null ? '…' : `${m.context}%`, color: fillColor(m.context ?? 0) },
  ]
  if (cache) pieces.push({ key: 'cache', label: 'cache', value: cache.replace(/^cache /, ''), color: cacheColor(cache, mins) })
  if (m.limit) {
    const reset = resetText(m.limit.resetsAt, now)
    pieces.push({ key: '5h', label: '5h', value: `${Math.round(m.limit.percent)}%`, color: fillColor(m.limit.percent), ...(reset ? { note: reset } : {}) })
  }
  if (m.week) pieces.push({ key: 'week', label: 'week', value: `${Math.round(m.week.percent)}%`, color: fillColor(m.week.percent) })
  return pieces
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    // Redraw every 10 seconds so the cache countdown and a model switch show while the session is idle.
    tick?.cancel()
    tick = $.clock.every(10_000, () => {
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

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

  // The main thread's response just landed: the cache was read or written now.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage) {
      const call = { at: await $.clock.now(), model: e.usage.model }
      await update($, lastCall, () => call)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Above the prompt, in the app: a box when the cache has gone cold, once per cold spell.
  // Write handoff runs Context Handoff's /handoff; Keep going and ✕ close it until the next cold spell.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface === 'terminal' || e.props.hasSurvey) return below
    const last = await read($, lastCall)
    if (!last) return below
    const m = await read($, meter)
    const now = await $.clock.now()
    const nextModel = await $.session.model().catch(() => undefined)
    const ttl = cacheTtlMs(m.plan)
    const isSwitched = isModelSwitched(last, nextModel)
    const cache = cacheText(cacheMinsLeft(last, ttl, now, nextModel), last, now, ttl, isSwitched)
    if (cache !== 'cache cold') return below
    const key = coldKey(last, nextModel)
    if ((await read($, coldDismissed)) === key) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const dismiss = () => update($, coldDismissed, () => key)
    const handoff = async () => {
      await dismiss()
      await $.command.run({ command: 'handoff' }).catch(() => {
        $.ui.toast('Session Meter: /handoff needs the Context Handoff mod · or run /clear to start fresh', { timeoutMs: 10000 })
      })
    }
    return (
      <Box flexDirection="column">
        <Box key="cold-cache" flexDirection="column" borderStyle="round" borderColor={ORANGE} paddingX={1}>
          <Box key="cold-header" flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color={RED}>⚠ </Text>
              <Text bold color={RED}>{isSwitched ? 'Cache cold · new model' : 'Cache cold'}</Text>
              <Text color={MUTED}>{COLD_WHY}</Text>
            </Text>
            <Button key="cold-close" plain label="✕" hover={{ bold: true }} onPress={dismiss} />
          </Box>
          <Box key="cold-actions" flexDirection="row" flexWrap="wrap">
            <Box key="cold-handoff-box" backgroundColor={ORANGE} paddingX={1} marginRight={1} hover={{ backgroundColor: RED }}>
              <Button key="cold-handoff" plain label="✎ Write handoff" hover={{ bold: true }} onPress={handoff} />
            </Box>
            <Box key="cold-keep-box" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: ORANGE }}>
              <Button key="cold-keep" plain label="Keep going" hover={{ bold: true }} onPress={dismiss} />
            </Box>
          </Box>
        </Box>
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // One line of colored text at the left of the footer, in the app only: the terminal has Control Panel's status row.
  // Plain Text, no Button: the app draws a Button natively from its label alone, dropping colored children.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface === 'terminal') return below
    const { Box, Text } = $.ui.resolve(e)

    const m = await read($, meter)
    const now = await $.clock.now()
    const last = await read($, lastCall)
    const nextModel = await $.session.model().catch(() => undefined)
    const pieces = meterPieces(m, last, now, nextModel).filter(p => p.key !== 'week')

    const mine = (
      <Box key="session-meter" flexDirection="row" flexShrink={0}>
        {pieces.flatMap((p, i) => [
          i > 0 ? <Text key={`sep-${p.key}`} color={MUTED}> · </Text> : null,
          <Text key={`label-${p.key}`} color={MUTED}>{`${p.label} `}</Text>,
          <Text key={`value-${p.key}`} color={p.color}>{p.value}</Text>,
          null,
        ])}
      </Box>
    )

    const isEngine = 'type' in below && below.type === 'engine'
    // Another mod's chip is beneath: sit to its left, on the same line.
    if (!isEngine)
      return (
        <Box flexDirection="row" alignItems="flex-end">
          <Box marginRight={2}>{mine}</Box>
          {below}
        </Box>
      )
    // The engine's modes are beneath: keep them beside it.
    return (
      <Box flexDirection="row" alignItems="flex-end">
        {mine}
        {e.props.modes.length > 0 ? <Box marginLeft={2}>{below}</Box> : null}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
