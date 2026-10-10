import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit, Timer, TimerCall } from 'claude-code'

import type { Choice, Effort, LastCall, Limit, Meter, Mod, Plan, Seen } from '../types'

const SELF = 'control-panel'
const PANE = 'control-panel'
const TITLE = 'Control Panel'
const COMMAND = 'control-panel'
const RELOAD = 'reload-plugins'
// Quiet time after the last switch before the one reload runs.
export const RELOAD_DELAY_MS = 1500
// The dock width the pane asks for, and the width from which rows show their blurbs.
const PANE_COLUMNS = 46
const WIDE_COLUMNS = 64
// The longest blurb: the narrow pane less its padding, so a blurb never truncates.
export const BLURB_MAX = PANE_COLUMNS - 4

// Palette: warm gold title, orange for the model, mauve for effort, green for on.
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const MAUVE = '#a8729a'
const GREEN = '#1f9d63'
const SLATE = '#2a2f3a'
const RED = '#e5484d'
// The pane's dark look: near-black ground, light ink, grey for the quiet parts.
const BLACK = '#0c0c0e'
const INK = '#e8e6e3'
const MUTED = '#7d8190'

const mods = atom({ plugin: 'control-panel', key: 'mods' } as const, [])
const disabled = atom({ plugin: 'control-panel', key: 'disabled' } as const, [])
const booted = atom({ plugin: 'control-panel', key: 'booted' } as const, false)
const choice = atom({ plugin: 'control-panel', key: 'choice' } as const, { model: null, effort: null })
const seen = atom({ plugin: 'control-panel', key: 'seen' } as const, null)
const meter = atom({ plugin: 'control-panel', key: 'meter' } as const, { plan: null, context: null, limit: null, week: null })
// When the main thread's last response finished, and which model gave it: the prompt cache's clock starts there.
const lastCall = atom({ plugin: 'control-panel', key: 'lastCall' } as const, null)

export const MODELS: ReadonlyArray<{ id: string; label: string; short: string; hotkey: string }> = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', short: 'Haiku 4.5', hotkey: '1' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', short: 'Sonnet 5.5', hotkey: '2' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', short: 'Opus 5.5', hotkey: '3' },
  { id: 'claude-opus-5-5[1m]', label: 'Opus 5.5 1M', short: 'Opus 5.5 1M', hotkey: '4' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', short: 'Fable 5.1', hotkey: '5' },
]

export const EFFORTS: ReadonlyArray<{ id: Effort; label: string; hotkey: string }> = [
  { id: 'low', label: 'Low', hotkey: 'l' },
  { id: 'medium', label: 'Medium', hotkey: 'm' },
  { id: 'high', label: 'High', hotkey: 'h' },
  { id: 'xhigh', label: 'XHigh', hotkey: 'x' },
  { id: 'max', label: 'Max', hotkey: 'z' },
]

export const parentOf = (path: string) => {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut < 0 ? '.' : path.slice(0, cut)
}

export const toggled = (list: readonly string[], name: string) =>
  list.includes(name) ? list.filter(n => n !== name) : [...list, name].sort()

export const spaced = (text: string) => text.toUpperCase().split('').join(' ')

export const modelName = (id: string) =>
  MODELS.find(m => m.id === id)?.short ?? id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export const effortName = (id: string) => EFFORTS.find(f => f.id === id)?.label ?? id

// "kebab-name" reads as "Kebab name".
export const titled = (name: string) => {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// What the next request goes out with: the pick where set, else what was last sent.
export const currentText = (c: Choice, s: Seen | null) => {
  const id = c.model ?? s?.model
  const effort = c.effort ?? s?.effort
  const model = id ? modelName(id) : '…'
  return effort ? `${model} · ${effortName(effort)}` : model
}

export const chipText = () => `◆ ${TITLE}`

// The status row's pieces: a bar of `width` cells and the time left to a reset.
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
 * A bare number is what an earlier version stored, with no model.
 */
export const cacheText = (last: LastCall | number | null, ttlMs: number, now: number, nextModel?: string) => {
  if (last === null) return ''
  const call = typeof last === 'number' ? { at: last, model: '' } : last
  if (call.model && nextModel && baseModel(call.model) !== baseModel(nextModel)) return 'cache cold · new model'
  const left = call.at + ttlMs - now
  if (left <= 0) return 'cache cold'
  const mins = Math.floor(left / 60_000)
  return mins < 1 ? 'cache <1m' : `cache ${mins}m`
}

/** The footer line: plan | model | effort | context bar | 5-hour window | weekly window. */
export const statusText = (m: Meter, model: string | null | undefined, effort: string | null | undefined, now: number, cache = '') => {
  const bar = meterBar(m.context ?? 0)
  const parts = [
    m.plan ?? '…',
    model ? modelName(model) : '…',
    `effort ${effort ? effortName(effort) : '…'}`,
    `ctx ${bar.filled}${bar.empty} ${m.context === null ? '…' : `${m.context}%`}`,
  ]
  if (cache) parts.push(cache)
  if (m.limit) parts.push(limitText('usage', m.limit, now))
  if (m.week) parts.push(limitText('weekly', m.week, now))
  return parts.join(' | ')
}

async function measure($: EngineInterface, context: number | undefined, limits: readonly SessionRateLimit[]) {
  const before = await read($, meter)
  const plan = before.plan === 'Subscription' || (before.plan && limits.length === 0) ? before.plan : await detectPlan($, limits)
  const limit = pickLimit(limits) ?? before.limit
  const week = pickWeek(limits) ?? before.week
  await update($, meter, () => ({ plan, context: context ?? before.context, limit, week }))
}

/** The request as it should be sent: the override where one is set, the engine's otherwise. */
export const applyChoice = <T extends { model: string; effort?: unknown }>(e: T, c: Choice): T => ({
  ...e,
  ...(c.model ? { model: c.model } : {}),
  ...(c.effort ? { effort: c.effort } : {}),
})

const SUMMARY_WORDS = 5

// A few words on what a mod does. A description that opens with a short
// sentence ("Live task checklist. Turns every…") gives that sentence; any other
// gives its first clause, with a "Name:" lead and a leading article dropped.
/** The mods the panel lets you switch off, in order, each with a short line; every other mod stays on. */
export const SETTINGS: ReadonlyArray<{ name: string; line: string }> = [
  { name: 'bare-view', line: 'Checklist view, hides tool clutter' },
  { name: 'guard-rails', line: 'Asks before risky commands' },
]

export const isSetting = (name: string) => SETTINGS.some(setting => setting.name === name)

/** The installed mods the Settings section lists, in SETTINGS order. */
export const settingRows = <M extends { name: string }>(list: readonly M[]) =>
  SETTINGS.flatMap(setting => {
    const mod = list.find(m => m.name === setting.name)
    return mod ? [{ mod, line: setting.line }] : []
  })

export const blurb = (description: string) => {
  const text = description.replace(/^[^:.]{1,40}:\s*/, '').trim()
  const sentence = /^([^.]+)\.(\s|$)/.exec(text)?.[1]?.trim()
  const words = (sentence && sentence.split(/\s+/).length <= SUMMARY_WORDS ? sentence : text.split(/[,;:(.]| and | with /)[0]!)
    .trim()
    .replace(/^(a|an|the)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  const short = words.slice(0, SUMMARY_WORDS).join(' ') + (words.length > SUMMARY_WORDS ? '…' : '')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

// The persisted list is the source of truth: plugin.register runs before state is filled.
async function storedDisabled($: EngineInterface) {
  const value = await $.store.get('disabled')
  // Only a setting can be off: a mod switched off by an older version comes back on.
  return Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string' && isSetting(n)) : []
}

// Folders of every mod the engine has offered to load, from any source,
// remembered across sessions.
async function storedRoots($: EngineInterface) {
  const value = await $.store.get('roots')
  return Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : []
}

async function remember($: EngineInterface, root: string) {
  const roots = await storedRoots($)
  if (!roots.includes(root)) await $.store.set('roots', [...roots, root])
}

/** Where each installed plugin lives, from the engine's installed_plugins.json. */
export const installedRoots = (text: string): string[] => {
  try {
    const data = JSON.parse(text) as { plugins?: Record<string, Array<{ installPath?: unknown }>> }
    return Object.values(data.plugins ?? {})
      .flat()
      .map(entry => entry?.installPath)
      .filter((path): path is string => typeof path === 'string')
  } catch {
    return []
  }
}

/** Installed copies live under ~/.claude/plugins/cache, which no watcher reloads. */
export const isInstalled = (root: string) => /[\\/]plugins[\\/]cache[\\/]/.test(root)

/** The `<name>@<marketplace>` key an installed plugin is enabled under, from installed_plugins.json. */
export const installedKey = (text: string, name: string): string | undefined => {
  try {
    const data = JSON.parse(text) as { plugins?: Record<string, unknown> }
    return Object.keys(data.plugins ?? {}).find(key => key.slice(0, key.lastIndexOf('@')) === name)
  } catch {
    return undefined
  }
}

/** settings.json with `enabledPlugins[key]` set; undefined when the text is not a JSON object. */
export const withPluginEnabled = (text: string, key: string, isOn: boolean): string | undefined => {
  try {
    const data = JSON.parse(text || '{}') as Record<string, unknown>
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
    const enabled = data.enabledPlugins && typeof data.enabledPlugins === 'object' ? data.enabledPlugins : {}
    return JSON.stringify({ ...data, enabledPlugins: { ...enabled, [key]: isOn } }, null, 2) + '\n'
  } catch {
    return undefined
  }
}

const claudeDir = async ($: EngineInterface) => {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
  return home ? `${home}/.claude` : ''
}

// A switched-off mod's plugin.register refusal only reaches mods that load after
// this one, so an installed mod is switched in the engine's own enabledPlugins:
// /reload-plugins then leaves it out whatever the load order.
async function setInstalledEnabled($: EngineInterface, mod: Mod, isOn: boolean) {
  const claude = await claudeDir($)
  if (!claude) return false
  const key = installedKey(await $.fs.read(`${claude}/plugins/installed_plugins.json`).catch(() => ''), mod.name)
  if (!key) return false
  const path = `${claude}/settings.json`
  // No fallback on a failed read: writing then would replace the person's settings.
  const next = withPluginEnabled(await $.fs.read(path), key, isOn)
  if (!next) return false
  await $.fs.write(path, next)
  return true
}

const subfolders = async ($: EngineInterface, folder: string) =>
  (await $.fs.list(folder).catch(() => [])).filter(entry => entry.kind === 'dir').map(entry => `${folder}/${entry.name}`)

// A mod is a plugin with a hooks module; skills-only and command-hook plugins are not.
async function readMod($: EngineInterface, root: string): Promise<Mod | undefined> {
  const hooks = await $.fs.read(`${root}/hooks/hooks.json`).catch(() => '')
  if (!/"modules"\s*:/.test(hooks)) return undefined
  const manifest = await $.fs
    .read(`${root}/.claude-plugin/plugin.json`)
    .then(text => JSON.parse(text) as { name?: string; description?: string })
    .catch(() => undefined)
  if (!manifest?.name || manifest.name === SELF) return undefined
  return { name: manifest.name, description: manifest.description ?? '', root }
}

// Every mod on this machine: the ones the engine has loaded, every installed
// plugin, every mods folder under ~/.claude/dev-mods, and this one's siblings.
// One row per name; a folder that is gone drops out.
async function scan($: EngineInterface): Promise<Mod[]> {
  const claude = await claudeDir($)
  const installed = claude ? installedRoots(await $.fs.read(`${claude}/plugins/installed_plugins.json`).catch(() => '')) : []
  const dev = claude ? (await Promise.all((await subfolders($, `${claude}/dev-mods`)).map(f => subfolders($, f)))).flat() : []
  const siblings = await subfolders($, parentOf($.plugin.root))
  const found = new Map<string, Mod>()
  for (const root of [...(await storedRoots($)), ...installed, ...siblings, ...dev]) {
    const mod = await readMod($, root)
    if (mod && !found.has(mod.name)) found.set(mod.name, mod)
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Rewriting the manifest unchanged makes the folder watcher reload that mod,
// and the reload runs plugin.register for it again.
async function poke($: EngineInterface, mod: Mod) {
  const path = `${mod.root}/.claude-plugin/plugin.json`
  await $.fs.write(path, await $.fs.read(path))
}

async function rescan($: EngineInterface) {
  const found = await scan($)
  await update($, mods, () => found)
}

/**
 * Runs the latest `fire` once, `ms` after the last call: each call cancels the one pending.
 * Rapid switches then end in a single reload that sees the final state.
 */
export const debouncer = (ms: number) => {
  let pending: Timer | undefined
  return (after: TimerCall, fire: () => void) => {
    pending?.cancel()
    pending = after(ms, () => {
      pending = undefined
      fire()
    })
  }
}

const scheduleReload = debouncer(RELOAD_DELAY_MS)

let cacheTick: Timer | undefined

// One switch at a time, so quick presses read and write the list and settings.json in order.
let switching: Promise<void> = Promise.resolve()

function toggle($: EngineInterface, mod: Mod) {
  switching = switching.then(() => switchMod($, mod)).catch(() => {})
  return switching
}

async function switchMod($: EngineInterface, mod: Mod) {
  const next = toggled(await storedDisabled($), mod.name)
  await $.store.set('disabled', next)
  await update($, disabled, () => next)
  const isOn = !next.includes(mod.name)
  const word = isOn ? 'on' : 'off'
  if (isInstalled(mod.root)) {
    const isSet = await setInstalledEnabled($, mod, isOn).catch(() => false)
    if (!isSet) {
      $.ui.toast(`${titled(mod.name)} ${word} here, but settings.json was not updated · use /plugin to ${isOn ? 'enable' : 'disable'} it`)
      return
    }
    $.ui.toast(`${titled(mod.name)} ${word} · reloading shortly`)
    // Last: one reload once the switching stops, run when the session is idle; it reloads this mod too.
    // Not awaited, since this environment may be gone by the time it settles.
    scheduleReload((ms, fn) => $.clock.after(ms, fn), () => {
      $.command.run({ command: RELOAD }).catch(() => $.ui.toast(`Run /${RELOAD} to apply the switch`))
    })
    return
  }
  await poke($, mod).catch(() => {})
  $.ui.toast(`${titled(mod.name)} ${word}`)
}

/** The quick commands row: a button per slash command, run as if typed. */
export const QUICK: ReadonlyArray<{ command: string; label: string; blurb: string; verb: string; confirm?: string; mod?: string }> = [
  { command: 'context-lens', label: 'Context Lens', blurb: 'See what is filling your context window', verb: 'Open', mod: 'context-lens' },
  { command: RELOAD, label: 'Reload plugins', blurb: 'Pick up mod changes without restarting', verb: 'Run' },
  { command: 'clear', label: 'Clear chat', blurb: 'Start a fresh conversation (asks first)', verb: 'Run', confirm: 'Clear the conversation and start fresh?' },
]

/** The actions to draw: one that opens another mod shows only while that mod's command is loaded in this session. */
export const visibleQuick = (commands: readonly string[]) =>
  QUICK.filter(q => !q.mod || commands.some(name => name === q.command || name.endsWith(`:${q.command}`)))

// Runs once the session is idle; /clear asks first, since it can't be undone.
async function runQuick($: EngineInterface, quick: (typeof QUICK)[number]) {
  if (quick.confirm) {
    const answer = await $.ui.ask(quick.confirm, { options: ['Clear', 'Cancel'], header: 'Clear' }).catch(() => 'Cancel')
    if (answer !== 'Clear') return
  }
  // Another mod's pane only comes to the front while the prompt has the keys, so this pane steps aside first.
  if (quick.mod) await $.ui.close({ id: PANE }).catch(() => {})
  await $.command.run({ command: quick.command }).catch(() => $.ui.toast(`Couldn't run /${quick.command} · type it at the prompt`))
}

async function pick($: EngineInterface, patch: Partial<Choice>) {
  const next = { ...(await read($, choice)), ...patch }
  await update($, choice, () => next)
  await $.store.set('choice', next)
}

async function openPane($: EngineInterface) {
  await rescan($)
  await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
}

export const register: Register = on => {
  // Keeps switched-off mods out of the chain at every load and reload.
  // Also notes where each mod lives, so the pane lists it wherever it loaded from.
  on('plugin.register', async ($, e, next) => {
    if (e.name === SELF) return next(e)
    if (!e.provenance.endsWith('@builtin')) await remember($, e.root).catch(() => {})
    const off = await storedDisabled($)
    return off.includes(e.name) ? { refuse: `switched off in ${TITLE}` } : next(e)
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Pick the model and effort, and change settings' })
    const off = await storedDisabled($)
    const saved = (await $.store.get('choice')) as Choice | undefined
    await update($, disabled, () => off)
    await rescan($)
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    // Clear the footer line an earlier version pinned above auto mode.
    $.ui.status(undefined)
    // Redraw once a minute so the cache countdown moves while the session is idle.
    cacheTick?.cancel()
    cacheTick = $.clock.every(60_000, () => {
      $.ui.invalidate('ui.render')
    })

    // Once per session: restore the saved model pick, and reload switched-off mods
    // that loaded before Control Panel and so slipped past plugin.register.
    if (!(await read($, booted))) {
      await update($, booted, () => true)
      if (saved) await update($, choice, () => ({ model: saved.model ?? null, effort: saved.effort ?? null }))
      for (const mod of await read($, mods)) if (off.includes(mod.name)) await poke($, mod).catch(() => {})
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await openPane($)
    return { text: `${TITLE} opened.` }
  })

  // Every main-thread request goes out with the picked model and effort.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const sent = applyChoice(e, await read($, choice))
    const now: Seen = { model: sent.model, effort: sent.effort === undefined ? null : String(sent.effort) }
    const last = await read($, seen)
    if (last?.model !== now.model || last?.effort !== now.effort) await update($, seen, () => now)
    return yield* next(sent)
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

  // The status row on the left, in the hint line's place, above the engine's hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)

    const m = await read($, meter)
    const c = await read($, choice)
    const s = await read($, seen)
    const model = c.model ?? s?.model
    const effort = c.effort ?? s?.effort
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
    // The next request's model: the panel's pick, else the session's (which follows /model).
    const nextModel = c.model ?? (await $.session.model().catch(() => undefined))
    const cache = cacheText(await read($, lastCall), cacheTtlMs(m.plan), now, nextModel)
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
        <Box key="control-panel-status" flexDirection="row" flexWrap="wrap">
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
          {cache && piece('cache', <Text color={RED}>{cache}</Text>)}
          {window('usage', m.limit)}
          {window('weekly', m.week)}
        </Box>
        {below}
      </Box>
    )
  })

  // The modes, then one chip, bottom right.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    const label = chipText()
    const isEmptyEngine = 'type' in below && below.type === 'engine' && e.props.modes.length === 0

    return (
      <Box flexDirection="column" alignItems="flex-end">
        {!isEmptyEngine && below}
        <Box key="control-panel-chip" backgroundColor={ORANGE} paddingX={1}>
          <Button key="open-control-panel" plain label={label} hover={{ bold: true }} onPress={() => openPane($)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, mods)
    const off = await read($, disabled)
    const c = await read($, choice)
    const s = await read($, seen)
    // What the session can run now: a folder remembered from an earlier session doesn't count.
    const commands = (await $.command.list().catch(() => [])).map(command => command.name)
    // With no pick yet, what the engine last sent is the one lit.
    const model = c.model ?? s?.model
    const effort = c.effort ?? s?.effort

    // An option in a row: filled with `fill` when chosen, plain otherwise.
    const option = (key: string, label: string, isChosen: boolean, fill: string, hotkey: string, onPress: () => unknown) => (
      <Box key={key} backgroundColor={isChosen ? fill : undefined} paddingX={1} hover={{ backgroundColor: isChosen ? fill : SLATE }}>
        <Button key={`${key}-btn`} plain label={label} hotkey={hotkey || undefined} hover={{ bold: true }} onPress={onPress}>
          <Text color={INK}>{label}</Text>
        </Button>
      </Box>
    )

    // Wide: the blurb sits beside the name. Narrow: on its own line under it, so it never runs off.
    const isWide = e.props.bodyColumns >= WIDE_COLUMNS

    const picker = (label: string, children: RenderChildren) => (
      <Box flexDirection="column" marginTop={1}>
        <Text color={MUTED}>{label}</Text>
        <Box flexDirection="row" flexWrap="wrap">{children}</Box>
      </Box>
    )

    const section = (label: string) => (
      <Box marginTop={1}>
        <Text color={MUTED}>{label}</Text>
      </Box>
    )

    // A settings or actions row: the name and its one-line blurb, the button at the right edge.
    const row = (key: string, name: RenderChildren, blurb: string, button: RenderChildren) => {
      const line = <Text color={MUTED} wrap="truncate-end">{blurb}</Text>
      return (
        <Box key={key} flexDirection="column" marginBottom={isWide ? 0 : 1} hover={{ backgroundColor: SLATE }}>
          <Box flexDirection="row">
            <Box flexGrow={1} flexShrink={1} flexDirection="row">
              <Box width={isWide ? 18 : undefined} flexShrink={0}>
                {name}
              </Box>
              {isWide && line}
            </Box>
            {button}
          </Box>
          {!isWide && line}
        </Box>
      )
    }

    return (
      // Black floor to ceiling: the body only grows to fit its tree, so the box asks for every row the dock has.
      <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined} backgroundColor={BLACK} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={GOLD}>
            <Text color={ORANGE}>◆ </Text>
            {TITLE}
          </Text>
          <Text color={MUTED}>{currentText(c, s)}</Text>
        </Box>

        {picker(
          'Model',
          MODELS.map(m => option(`model-${m.hotkey}`, m.label, model === m.id, ORANGE, m.hotkey, () => pick($, { model: m.id }))),
        )}
        {picker(
          'Effort',
          EFFORTS.map(f => option(`effort-${f.hotkey}`, f.label, effort === f.id, MAUVE, f.hotkey, () => pick($, { effort: f.id }))),
        )}

        {section('Settings')}
        {settingRows(list).length === 0 && <Text color={MUTED}>Bare View and Guard Rails are not installed.</Text>}
        {settingRows(list).map(({ mod, line }) => {
          const isOn = !off.includes(mod.name)
          return row(
            mod.name,
            <Text bold={isOn} color={isOn ? INK : MUTED} wrap="truncate-end">{titled(mod.name)}</Text>,
            line,
            <Box width={8} flexShrink={0} backgroundColor={isOn ? GREEN : SLATE} paddingX={1}>
              <Button key={`toggle-${mod.name}`} plain label={isOn ? '● On' : '○ Off'} hover={{ bold: true }} onPress={() => toggle($, mod)}>
                <Text color={INK}>{isOn ? '● On' : '○ Off'}</Text>
              </Button>
            </Box>,
          )
        })}

        {section('Actions')}
        {visibleQuick(commands).map(q =>
          row(
            `quick-${q.command}`,
            <Text color={INK} wrap="truncate-end">{q.label}</Text>,
            q.blurb,
            <Box width={8} flexShrink={0} backgroundColor={GOLD} paddingX={1}>
              <Button key={`quick-btn-${q.command}`} plain label={`▸ ${q.verb}`} hover={{ bold: true }} onPress={() => runQuick($, q)}>
                <Text color={BLACK}>{`▸ ${q.verb}`}</Text>
              </Button>
            </Box>,
          ),
        )}
      </Box>
    )
  })
}
