import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, Timer, TimerCall } from 'claude-code'

import type { Choice, Effort, Mod, Seen } from '../types'

const SELF = 'control-panel'
const PANE = 'control-panel'
const TITLE = 'Control Panel'
const COMMAND = 'control-panel'
const RELOAD = 'reload-plugins'
// Quiet time after the last switch before the one reload runs.
export const RELOAD_DELAY_MS = 1500
// The dock width the pane asks for, and the width from which rows show their blurbs.
const PANE_COLUMNS = 46
// How long a model pick waits before sending /model, so it goes out after the button press has finished.
const SEND_DELAY_MS = 300
const WIDE_COLUMNS = 64
// The longest blurb: the narrow pane less its padding, so a blurb never truncates.
export const BLURB_MAX = PANE_COLUMNS - 4

// Palette: warm gold title, orange for the model, mauve for effort, green for on.
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const MAUVE = '#a8729a'
const GREEN = '#1f9d63'
const SLATE = '#2a2f3a'
// The pane's dark look: near-black ground, light ink, grey for the quiet parts.
const BLACK = '#0c0c0e'
const INK = '#e8e6e3'
const MUTED = '#7d8190'

const mods = atom({ plugin: 'control-panel', key: 'mods' } as const, [])
const disabled = atom({ plugin: 'control-panel', key: 'disabled' } as const, [])
const booted = atom({ plugin: 'control-panel', key: 'booted' } as const, false)
const choice = atom({ plugin: 'control-panel', key: 'choice' } as const, { model: null, effort: null })
const seen = atom({ plugin: 'control-panel', key: 'seen' } as const, null)

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

// A pick sends `/model <id>` or `/effort <level>` as if you typed it, so the engine's own setting changes and the
// app's menu, the footer and every other mod agree. In the terminal it runs as a mod command and switches straight
// away. The desktop app only sets a hidden "this session only" value from a mod command and keeps its menu's, so
// there it goes through the prompt. Nothing is kept as an override on requests: /effort or /model typed later wins.
async function sendSetting($: EngineInterface, command: 'model' | 'effort', arg: string) {
  const what = command === 'model' ? 'model' : 'effort'
  const viaPrompt = () =>
    $.prompt
      .submit({ text: `/${command} ${arg}` })
      .then(() => $.ui.invalidate('ui.render'))
      .catch(async () => {
        const filled = await $.prompt.fill({ text: `/${command} ${arg}` }).catch(() => undefined)
        $.ui.toast(filled?.isFilled ? `Press Enter to switch the ${what}` : `Couldn't switch the ${what} · type /${command} ${arg}`)
      })
  const inApp = (await $.session.surfaces().catch(() => [])).some(s => s !== 'terminal')
  // After the press has finished: sent from inside the button's own handler, it is refused. If the prompt still
  // refuses, the command goes in the prompt box and one Enter sends it.
  $.clock.after(SEND_DELAY_MS, () => {
    if (inApp) return viaPrompt()
    $.command
      .run({ command, args: arg })
      .then(() => $.ui.invalidate('ui.render'))
      .catch(viaPrompt)
  })
}

// The effort pick is held only until the next request shows what the engine sends; the pane lights it meanwhile.
async function pick($: EngineInterface, patch: Partial<Choice>) {
  if (patch.model) await sendSetting($, 'model', patch.model)
  if (patch.effort) await sendSetting($, 'effort', patch.effort)
  await update($, choice, c => ({ model: null, effort: patch.effort ?? c.effort }))
  await $.store.set('choice', { model: null, effort: null })
}

async function openPane($: EngineInterface) {
  await rescan($)
  await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true, columns: PANE_COLUMNS })
}

// The footer chip: closes the pane when it's the one showing, else opens it or brings it to the front.
async function togglePane($: EngineInterface) {
  const mine = (await $.ui.panes().catch(() => [])).find(pane => pane.id === PANE)
  if (mine?.isShown) return $.ui.close({ id: PANE })
  // Opening an id that is already a tab only retitles it; closing it first lets the open raise it.
  if (mine) await $.ui.close({ id: PANE }).catch(() => {})
  return openPane($)
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
    // Clear the footer line an earlier version pinned above auto mode.
    $.ui.status(undefined)

    // Once per session: reload switched-off mods that loaded before Control Panel and so slipped past plugin.register.
    if (!(await read($, booted))) {
      await update($, booted, () => true)
      // A pick saved by an earlier version is dropped: it overrode /effort and /model on every request.
      if (saved?.model || saved?.effort) await $.store.set('choice', { model: null, effort: null })
      for (const mod of await read($, mods)) if (off.includes(mod.name)) await poke($, mod).catch(() => {})
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await openPane($)
    return { text: `${TITLE} opened.` }
  })

  // Notes what each main-thread request goes out with; a pending pick gives way to it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const now: Seen = { model: e.model, effort: e.effort === undefined ? null : String(e.effort) }
    const last = await read($, seen)
    if (last?.model !== now.model || last?.effort !== now.effort) await update($, seen, () => now)
    if ((await read($, choice)).effort) await update($, choice, () => ({ model: null, effort: null }))
    return yield* next(e)
  })

  // The modes, then one chip, bottom right.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const { Box, Button } = $.ui.resolve(e)
    const label = chipText()
    const isEngine = 'type' in below && below.type === 'engine'
    const isEmptyEngine = isEngine && e.props.modes.length === 0
    const chip = (
      <Box key="control-panel-chip" backgroundColor={ORANGE} paddingX={1}>
        <Button key="open-control-panel" plain label={label} hover={{ bold: true }} onPress={() => togglePane($)} />
      </Box>
    )

    // Another mod's chip (Tenant Lens) is beneath: sit to its right, on the bottom line.
    if (!isEngine)
      return (
        <Box flexDirection="row" alignItems="flex-end">
          <Box marginRight={1}>{below}</Box>
          {chip}
        </Box>
      )
    return (
      <Box flexDirection="column" alignItems="flex-end">
        {!isEmptyEngine && below}
        {chip}
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
    // The session's own model is the one lit (it's what /model and the app's picker change); else what was last sent.
    const model = (await $.session.model().catch(() => undefined)) ?? s?.model
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
