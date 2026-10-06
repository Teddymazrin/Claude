import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit } from 'claude-code'

import type { Choice, Effort, Meter, Mod, Plan, Seen } from '../types'

const SELF = 'control-panel'
const PANE = 'control-panel'
const TITLE = 'Control Panel'
const COMMAND = 'control-panel'

// Palette: warm gold frame, orange for the model, mauve for effort, green for on.
const GOLD = '#d9a441'
const FRAME = '#8a6a2f'
const ORANGE = '#e06c3c'
const MAUVE = '#a8729a'
const GREEN = '#1f9d63'
const SLATE = '#2a2f3a'

const mods = atom({ plugin: 'control-panel', key: 'mods' } as const, [])
const disabled = atom({ plugin: 'control-panel', key: 'disabled' } as const, [])
const booted = atom({ plugin: 'control-panel', key: 'booted' } as const, false)
const choice = atom({ plugin: 'control-panel', key: 'choice' } as const, { model: null, effort: null })
const seen = atom({ plugin: 'control-panel', key: 'seen' } as const, null)
const meter = atom({ plugin: 'control-panel', key: 'meter' } as const, { plan: null, context: null, limit: null })

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

/** The window the row shows: the five-hour one, else the first reported. */
export const pickLimit = (limits: readonly SessionRateLimit[]) => {
  const limit = limits.find(l => l.kind === 'five_hour') ?? limits[0]
  return limit ? { percent: limit.percentUsed, ...(limit.resetsAt ? { resetsAt: limit.resetsAt } : {}) } : null
}

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

/** The footer line: plan | model | effort | context bar | usage and time to reset. */
export const statusText = (m: Meter, model: string | null | undefined, effort: string | null | undefined, now: number) => {
  const bar = meterBar(m.context ?? 0)
  const parts = [
    m.plan ?? '…',
    model ? modelName(model) : '…',
    `effort ${effort ? effortName(effort) : '…'}`,
    `ctx ${bar.filled}${bar.empty} ${m.context === null ? '…' : `${m.context}%`}`,
  ]
  if (m.limit) parts.push(`${Math.round(m.limit.percent)}% ${untilReset(m.limit.resetsAt, now)}`.trim())
  return parts.join(' | ')
}

async function measure($: EngineInterface, context: number | undefined, limits: readonly SessionRateLimit[]) {
  const before = await read($, meter)
  const plan = before.plan === 'Subscription' || (before.plan && limits.length === 0) ? before.plan : await detectPlan($, limits)
  const limit = pickLimit(limits) ?? before.limit
  await update($, meter, () => ({ plan, context: context ?? before.context, limit }))
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
  return Array.isArray(value) ? value.filter((n): n is string => typeof n === 'string') : []
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

async function readMod($: EngineInterface, root: string): Promise<Mod | undefined> {
  const manifest = await $.fs
    .read(`${root}/.claude-plugin/plugin.json`)
    .then(text => JSON.parse(text) as { name?: string; description?: string })
    .catch(() => undefined)
  if (!manifest?.name || manifest.name === SELF) return undefined
  return { name: manifest.name, description: manifest.description ?? '', root }
}

// Every mod folder next to this one, then every mod the engine has loaded from
// anywhere else; one row per name, and a folder that is gone drops out.
async function scan($: EngineInterface): Promise<Mod[]> {
  const folder = parentOf($.plugin.root)
  const siblings = (await $.fs.list(folder).catch(() => []))
    .filter(entry => entry.kind === 'dir')
    .map(entry => `${folder}/${entry.name}`)
  const found = new Map<string, Mod>()
  for (const root of [...siblings, ...(await storedRoots($))]) {
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

async function toggle($: EngineInterface, mod: Mod) {
  const next = toggled(await storedDisabled($), mod.name)
  await $.store.set('disabled', next)
  await update($, disabled, () => next)
  await poke($, mod)
  $.ui.toast(`${titled(mod.name)} ${next.includes(mod.name) ? 'off' : 'on'}`)
}

async function pick($: EngineInterface, patch: Partial<Choice>) {
  const next = { ...(await read($, choice)), ...patch }
  await update($, choice, () => next)
  await $.store.set('choice', next)
}

async function openPane($: EngineInterface) {
  await rescan($)
  await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })
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
    await $.command.register({ name: COMMAND, description: 'Switch mods on and off, pick the model and effort' })
    const off = await storedDisabled($)
    const saved = (await $.store.get('choice')) as Choice | undefined
    await update($, disabled, () => off)
    await rescan($)
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    // Clear the footer line an earlier version pinned above auto mode.
    $.ui.status(undefined)

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
    const sep = <Text dimColor> | </Text>
    const ctx = m.context ?? 0
    const bar = meterBar(ctx)
    const ctxColor = ctx >= 75 ? ORANGE : ctx >= 50 ? GOLD : GREEN
    const reset = m.limit ? untilReset(m.limit.resetsAt, now) : ''

    return (
      <Box flexDirection="column" alignItems="flex-start">
        <Box key="control-panel-status" flexDirection="row">
          <Text color={GOLD}>{m.plan ?? '…'}</Text>
          {sep}
          <Text bold color={ORANGE}>{model ? modelName(model) : '…'}</Text>
          {sep}
          <Text dimColor>effort </Text>
          <Text color={MAUVE}>{effort ? effortName(effort) : '…'}</Text>
          {sep}
          <Text dimColor>ctx </Text>
          <Text color={ctxColor}>{bar.filled}</Text>
          <Text color={SLATE}>{bar.empty}</Text>
          <Text color={ctxColor}> {m.context === null ? '…' : `${ctx}%`}</Text>
          {m.limit && sep}
          {m.limit && <Text>{`${Math.round(m.limit.percent)}%`}</Text>}
          {m.limit && reset && <Text dimColor>{` ${reset}`}</Text>}
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
        <Box key="control-panel-chip" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: ORANGE }}>
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
    // With no pick yet, what the engine last sent is the one lit.
    const model = c.model ?? s?.model
    const effort = c.effort ?? s?.effort

    // An option in a row: filled with `fill` when chosen, plain otherwise.
    const option = (key: string, label: string, isChosen: boolean, fill: string, hotkey: string, onPress: () => unknown) => (
      <Box key={key} backgroundColor={isChosen ? fill : undefined} paddingX={1} hover={{ backgroundColor: isChosen ? fill : SLATE }}>
        <Button key={`${key}-btn`} plain label={label} hotkey={hotkey || undefined} hover={{ bold: true }} onPress={onPress} />
      </Box>
    )

    const pickerRow = (label: string, children: RenderChildren) => (
      <Box flexDirection="row">
        <Box width={8} flexShrink={0}>
          <Text dimColor>{label}</Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap">{children}</Box>
      </Box>
    )

    const section = (label: string) => (
      <Box marginTop={1} marginBottom={1} paddingLeft={2}>
        <Text dimColor>{spaced(label)}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Box flexDirection="row">
            <Text color={ORANGE}>◆  </Text>
            <Text bold color={GOLD}>{spaced(TITLE)}</Text>
          </Box>
          <Text dimColor>{currentText(c, s)}</Text>
        </Box>

        {pickerRow(
          'MODEL',
          MODELS.map(m => option(`model-${m.hotkey}`, m.label, model === m.id, ORANGE, m.hotkey, () => pick($, { model: m.id }))),
        )}
        {pickerRow(
          'EFFORT',
          EFFORTS.map(f => option(`effort-${f.hotkey}`, f.label, effort === f.id, MAUVE, f.hotkey, () => pick($, { effort: f.id }))),
        )}

        {section('Mods')}
        {list.length === 0 && <Text dimColor>  No mods found.</Text>}
        {list.map(mod => {
          const isOn = !off.includes(mod.name)
          return (
            <Box key={mod.name} flexDirection="row" hover={{ backgroundColor: SLATE }}>
              <Box width={18} flexShrink={0}>
                <Text bold={isOn} wrap="truncate-end">{titled(mod.name)}</Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} marginRight={1}>
                <Text dimColor wrap="truncate-end">{blurb(mod.description)}</Text>
              </Box>
              <Box width={7} flexShrink={0} backgroundColor={isOn ? GREEN : SLATE} paddingX={1}>
                <Button key={`toggle-${mod.name}`} plain label={isOn ? '● On' : '○ Off'} hover={{ bold: true }} onPress={() => toggle($, mod)} />
              </Box>
            </Box>
          )
        })}

      </Box>
    )
  })
}
