import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit, Timer } from 'claude-code'

import type { Note, Plan, Seen } from '../types'
import { AWAY_TITLE, COLD_WHY, awayWhy, coldKey, coldSwitchWhy, coldTitle, shouldAutoNote } from './cold'
import {
  AMBER,
  COMMAND,
  COPY_LABEL,
  FRAME,
  LEVELS,
  PANE,
  RESTART_LABEL,
  SEND_DELAY_MS,
  TITLE,
  TOOL,
  TOOL_ID,
  VIOLET,
  autoPrompt,
  copyPrompt,
  fullText,
  isOpen,
  levelFor,
  parseAsk,
  isAway,
  whyFor,
  writePrompt,
} from './handoff'
import {
  GOLD,
  MAUVE,
  MUTED,
  ORANGE,
  RED,
  SLATE,
  cacheColor,
  cacheText,
  cacheTtlMs,
  effortName,
  fillColor,
  isCold,
  meterBar,
  modelName,
  nextRequest,
  pickLimit,
  pickWeek,
  resetText,
} from './session'
import type { Pick } from './session'
import { cacheLabel, limitColor, statusText } from './status'

// Session Manager: the status row (terminal) and footer line (app), the cold-cache box, and handoff.
// Everything that touches $ is in this one file: the engine follows $ only into functions declared here.

// ── State ────────────────────────────────────────────────────────────────────

// What each main-thread request went out with, as it reaches this mod.
const seen = atom({ plugin: 'session-manager', key: 'seen' } as const, null)
const meter = atom({ plugin: 'session-manager', key: 'meter' } as const, { plan: null, context: null, limit: null, week: null })
// When the main thread's last response finished, and which model gave it: the prompt cache's clock starts there.
const lastCall = atom({ plugin: 'session-manager', key: 'lastCall' } as const, null)
// The cold spell the cold-cache box was closed for; it comes back for the next one.
const coldDismissed = atom({ plugin: 'session-manager', key: 'coldDismissed' } as const, null)
const warned = atom({ plugin: 'session-manager', key: 'warned' } as const, 0)
const note = atom({ plugin: 'session-manager', key: 'note' } as const, null)
const band = atom({ plugin: 'session-manager', key: 'band' } as const, false)
const offer = atom({ plugin: 'session-manager', key: 'offer' } as const, null)

const CONTROL_PANEL_CHOICE = { plugin: 'control-panel', key: 'choice' } as const

// ── The session's numbers ────────────────────────────────────────────────────

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
  const limit = pickLimit(limits) ?? before.limit
  const week = pickWeek(limits) ?? before.week
  await update($, meter, () => ({ plan, context: context ?? before.context, limit, week }))
}

// Control Panel's pick, or undefined when it isn't installed or hasn't picked.
async function readPick($: EngineInterface): Promise<Pick | undefined> {
  let held: unknown
  try {
    held = await $.state.get(CONTROL_PANEL_CHOICE as never)
  } catch {
    held = undefined
  }
  const value = (held as { value?: unknown } | undefined)?.value as Partial<Pick> | undefined
  return value && typeof value === 'object' ? { model: value.model ?? null, effort: value.effort ?? null } : undefined
}

/** Everything the row, the footer and the cold-cache box draw from, read once. */
async function snapshot($: EngineInterface) {
  const m = await read($, meter)
  const last = await read($, lastCall)
  const sessionModel = await $.session.model().catch(() => undefined)
  const { model, effort } = nextRequest(await readPick($), await read($, seen), sessionModel)
  const now = await $.clock.now()
  const cache = cacheText(last, cacheTtlMs(m.plan), now, model ?? undefined)
  return { m, last, model, effort, now, cache }
}

let tick: Timer | undefined

// A main-thread turn is running: nobody is away, and the cache is in use.
let isBusy = false
// A note is being written from the cache now.
let isWriting = false

/**
 * While you are away, just before the cache goes cold: the handoff note, written from the cache with a side request
 * that adds nothing to the chat. Reading the cache keeps it warm, so the countdown starts over from the write.
 */
async function autoNote($: EngineInterface) {
  if (isWriting) return
  const { m, last, model, now } = await snapshot($)
  const saved = await read($, note)
  const ttlMs = cacheTtlMs(m.plan)
  if (!shouldAutoNote({ last, ttlMs, now, context: m.context, nextModel: model, isBusy, noteAt: saved?.at ?? null })) return
  await writeAwayNote($)
}

// `/handoff away`: the away box drawn as if the cache ran out, for a preview; cleared when the box closes.
let previewCold = false

/** Writes the note from the cache and puts it in the away box; resolves with why not, or null when written. */
async function writeAwayNote($: EngineInterface, isAsked = false): Promise<string | null> {
  if (isWriting) return 'a note is already being written'
  const { last, now } = await snapshot($)
  isWriting = true
  try {
    const root = await $.session.root()
    const reply = await $.model.fork({ prompt: autoPrompt(root, new Date(now).toLocaleString()) })
    if (!reply.isAnswered) return reply.reason
    if (!reply.text.trim()) return 'the reply was empty'
    const at = await $.clock.now()
    if (reply.usage.cache_read_input_tokens > 0 && last) await update($, lastCall, () => ({ at, model: last.model }))
    // The whole note in the side pane, as /handoff shows it, and the away box above the prompt, which always has
    // room: the pane opens unasked only on a wide terminal. The away box stands in for the note's own band.
    await update($, note, () => ({ root, text: reply.text.trim(), at, auto: true }))
    await show($, isAsked)
    await update($, band, () => false)
    $.ui.invalidate('ui.render')
    return null
  } finally {
    isWriting = false
  }
}

// ── Handoff ──────────────────────────────────────────────────────────────────

// The side pane when there is room; the box above the prompt otherwise, so it always shows.
async function show($: EngineInterface, isAsked: boolean) {
  const opened = await $.ui
    .open({ id: PANE, title: TITLE, ...(isAsked ? { focus: true as const, closeOnEscape: true as const } : {}) })
    .catch(() => undefined)
  const mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
  await update($, band, () => !(opened?.isPlaced && mine?.isShown))
}

// After the command has finished, so the turn isn't started from inside it. If the
// engine still refuses, the prompt goes in the box instead: one Enter sends it, and `hint` says what that does.
function send($: EngineInterface, text: string, hint = `${TITLE}: press Enter to send the prompt`) {
  $.clock.after(SEND_DELAY_MS, () => {
    $.prompt.submit({ text }).catch(async (error: unknown) => {
      const filled = await $.prompt.fill({ text }).catch(() => undefined)
      const why = error instanceof Error ? error.message : String(error)
      $.ui.toast(filled?.isFilled ? hint : `Couldn't send it (${why}) · type ${text}`, { timeoutMs: 10000 })
    })
  })
}

/** Ask Claude for a handoff note now, the same as `/handoff`; closes the offer box. The cold-cache box uses it too. */
async function writeHandoff($: EngineInterface) {
  await update($, offer, () => null)
  send($, writePrompt(await $.session.root(), new Date(await $.clock.now()).toLocaleString()))
}

// Clear and continue: after one confirm, /clear, then the copied prompt goes in as the fresh chat's first message.
// The text is taken before the clear, so it does not depend on what the clear leaves of this session.
async function startFresh($: EngineInterface, text: string) {
  const answer = await $.ui
    .ask('Clear this chat and continue from the handoff note? The conversation so far is deleted.', { options: ['Clear & continue', 'Cancel'], header: 'Handoff' })
    .catch(() => 'Cancel')
  if (answer !== 'Clear & continue') return
  await $.ui.close({ id: PANE }).catch(() => {})
  await update($, band, () => false)
  const cleared = await $.command
    .run({ command: 'clear' })
    .then(() => true)
    .catch(() => false)
  if (!cleared) {
    $.ui.toast(`${TITLE}: couldn't clear · run /clear, then Copy prompt and paste it`, { timeoutMs: 10000 })
    return
  }
  send($, copyPrompt(text))
}

type Surface = Parameters<EngineInterface['ui']['resolve']>[0]

// The two ways on: copy the prompt for a new chat (this one stays), or restart this chat with the note.
// Plus Open, in the box above the prompt.
function buttons($: EngineInterface, e: Surface, saved: Note, withOpen: boolean) {
  const { Box, Button } = $.ui.resolve(e)
  const button = (key: string, label: string, onPress: (press: { surface: Surface['surface'] }) => unknown) => (
    <Box key={`${key}-box`} backgroundColor={SLATE} paddingX={1} marginRight={1} hover={{ backgroundColor: FRAME }}>
      <Button key={key} plain label={label} hover={{ bold: true }} onPress={onPress} />
    </Box>
  )
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {button('copy-prompt', COPY_LABEL, async press => {
        const copied = await $.ui.copy({ text: copyPrompt(saved.text), surface: press.surface })
        $.ui.toast(copied.isCopied ? 'Copied · open a new session and paste it to pick up where you left off' : 'Could not copy the prompt')
      })}
      {button('start-fresh', RESTART_LABEL, () => startFresh($, saved.text))}
      {withOpen && button('open-pane', '▸ Open', () => show($, true))}
    </Box>
  )
}

/** At session start: the note tool and /handoff. */
async function startHandoff($: EngineInterface) {
  await $.tool.register({
    name: TOOL,
    description: `Send the handoff note for this session to the user's ${TITLE} pane, where they copy it into a fresh session. Use only when asked to write a handoff note.`,
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The whole handoff note, in Markdown, with its sections.' } },
      required: ['note'],
    },
  })
  await $.command.register({
    name: COMMAND,
    description: 'Write a handoff note for this session (`open` shows it again, `ask 50|65|80` previews the offer box, `away` the box you see after the cache ran out while you were away)',
    argumentHint: '[open|ask [50|65|80]]',
  })
}

/**
 * The offer box above the prompt, once per level crossed. Dropping back below a level (after /clear or a compact)
 * closes the box and re-arms that level.
 */
async function measureHandoff($: EngineInterface, percent: number | undefined) {
  if (percent === undefined) return
  const level = levelFor(percent)
  const shown = await read($, warned)
  if (level > shown) await update($, offer, () => percent)
  else if (level < shown) await update($, offer, () => null)
  if (level !== shown) await update($, warned, () => level)
}


/** Above the prompt: the offer box, and the note's buttons when the side pane had no room. Null when neither shows. */
async function handoffBoxes($: EngineInterface, e: Surface) {
  const saved = await read($, note)
  const atPercent = await read($, offer)
  const isBand = (await read($, band)) && saved !== null
  if (atPercent === null && !isBand) return null
  const { Box, Text, Button } = $.ui.resolve(e)
  const dismiss = () => update($, offer, () => null)
  const offerBox =
    atPercent === null ? null : (
      <Box key="handoff-offer" flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
        <Box key="offer-header" flexDirection="row" justifyContent="space-between">
          <Text>
            <Text color={VIOLET}>◈ </Text>
            <Text bold color={VIOLET}>{fullText(atPercent)}</Text>
            <Text dimColor>{whyFor(atPercent)}</Text>
          </Text>
          <Button key="offer-close" plain label="✕" hover={{ bold: true }} onPress={dismiss} />
        </Box>
        <Box key="offer-actions" flexDirection="row" flexWrap="wrap">
          <Box key="offer-write-box" backgroundColor={FRAME} paddingX={1} marginRight={1} hover={{ backgroundColor: VIOLET }}>
            <Button
              key="offer-write"
              plain
              label="✎ Write handoff"
              hover={{ bold: true }}
              onPress={() => writeHandoff($)}
            />
          </Box>
          <Box key="offer-later-box" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: FRAME }}>
            <Button key="offer-later" plain label="Not now" hover={{ bold: true }} onPress={dismiss} />
          </Box>
        </Box>
      </Box>
    )
  if (!isBand || !saved) return [offerBox]
  return [
    offerBox,
    <Box key="handoff-band" flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
      <Box key="band-header" flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={VIOLET}>◈ </Text>
          <Text bold color={VIOLET}>Handoff note ready</Text>
          <Text dimColor>{' · continue in a new chat, or clear this one'}</Text>
        </Text>
        <Button key="band-close" plain label="✕" hover={{ bold: true }} onPress={() => update($, band, () => false)} />
      </Box>
      {buttons($, e, saved, true)}
    </Box>,
  ]
}


// ── The cold-cache box ───────────────────────────────────────────────────────

/**
 * Above the prompt, in the terminal and the app: a box when the cache has gone cold, once per cold spell; null otherwise.
 * Write handoff starts /handoff; Keep going and ✕ close it until the next cold spell.
 */
async function coldBox($: EngineInterface, e: Surface) {
  // Nothing to be cold before Claude's first reply; skip the rest of the reads.
  if (!(await read($, lastCall))) return null
  const { m, last, model, now, cache } = await snapshot($)
  if (!last || !isCold(cache)) return null
  const key = coldKey(last, model)
  if ((await read($, coldDismissed)) === key) return null
  if ((await read($, note))?.auto) return null

  const { Box, Text, Button } = $.ui.resolve(e)
  const dismiss = () => update($, coldDismissed, () => key)
  const handoff = async () => {
    await dismiss()
    await writeHandoff($)
  }
  // Cold only because the model changed, and the old model's cache is still warm: go back there to write the note.
  const isSwitch = cache === 'cache cold · new model' && last.at + cacheTtlMs(m.plan) > now
  // A note written while you were away: the away box says so instead.
  const oldId = last.model
  const switchBack = async () => {
    await dismiss()
    send($, `/model ${oldId}`, `Press Enter to switch back to ${modelName(oldId)}`)
  }
  return (
    <Box key="cold-cache" flexDirection="column" borderStyle="round" borderColor={ORANGE} paddingX={1}>
      <Box key="cold-header" flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={RED}>⚠ </Text>
          <Text bold color={RED}>{coldTitle(cache)}</Text>
          <Text dimColor>{isSwitch ? coldSwitchWhy(model ? modelName(model) : 'This model', modelName(oldId)) : COLD_WHY}</Text>
        </Text>
        <Button key="cold-close" plain label="✕" hover={{ bold: true }} onPress={dismiss} />
      </Box>
      <Box key="cold-actions" flexDirection="row" flexWrap="wrap">
        {isSwitch ? (
          <Box key="cold-back-box" backgroundColor={ORANGE} paddingX={1} marginRight={1} hover={{ backgroundColor: RED }}>
            <Button key="cold-back" plain label={`↩ Switch back to ${modelName(oldId)}`} hover={{ bold: true }} onPress={switchBack} />
          </Box>
        ) : (
          <Box key="cold-handoff-box" backgroundColor={ORANGE} paddingX={1} marginRight={1} hover={{ backgroundColor: RED }}>
            <Button key="cold-handoff" plain label="✎ Write handoff" hover={{ bold: true }} onPress={handoff} />
          </Box>
        )}
        <Box key="cold-keep-box" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: ORANGE }}>
          <Button key="cold-keep" plain label="Keep going" hover={{ bold: true }} onPress={dismiss} />
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Above the prompt, once the cache has run out: the note written while you were away, and the ways on. The note
 * itself is in the Handoff pane. While the cache is still warm there is nothing to warn about, so it waits there.
 * Shows until you close it or send a message.
 */
async function awayBox($: EngineInterface, e: Surface) {
  const saved = await read($, note)
  if (!saved?.auto) return null
  const { cache } = await snapshot($)
  if (!isCold(cache) && !previewCold) return null
  const { Box, Text, Button } = $.ui.resolve(e)
  let when: string
  try {
    when = new Date(saved.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    when = new Date(saved.at).toISOString().slice(11, 16)
  }
  const close = () => {
    previewCold = false
    return update($, note, n => (n ? { ...n, auto: false } : n))
  }
  const button = (key: string, label: string, fill: string, onPress: (press: { surface: Surface['surface'] }) => unknown) => (
    <Box key={`${key}-box`} backgroundColor={fill} paddingX={1} marginRight={1} hover={{ backgroundColor: FRAME }}>
      <Button key={key} plain label={label} hover={{ bold: true }} onPress={onPress} />
    </Box>
  )
  return (
    <Box key="away-note" flexDirection="column" borderStyle="round" borderColor={ORANGE} paddingX={1}>
      <Box key="away-header" flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={RED}>◈ </Text>
          <Text bold color={RED}>{AWAY_TITLE}</Text>
        </Text>
        <Button key="away-close" plain label="✕" hover={{ bold: true }} onPress={close} />
      </Box>
      <Text key="away-why" dimColor>{awayWhy(when)}</Text>
      <Box key="away-actions" flexDirection="row" flexWrap="wrap" marginTop={1}>
        {button('away-copy', COPY_LABEL, ORANGE, async press => {
          const copied = await $.ui.copy({ text: copyPrompt(saved.text), surface: press.surface })
          $.ui.toast(copied.isCopied ? 'Copied · open a new session and paste it to pick up where you left off' : 'Could not copy the prompt')
        })}
        {button('away-open', '▸ Open', SLATE, () => show($, true))}
        {button('away-keep', 'Keep going', SLATE, close)}
      </Box>
    </Box>
  )
}

// The model the last tick saw, to notice a switch in the app's model menu, which no hook hears.
let tickModel: string | null | undefined

/**
 * Lets the cold-cache box show again after it was closed: when the cache is warm again (switched back to the model
 * that has it) or the model changed. Runs on the tick, outside drawing, so the write sticks; a second switch to the
 * same model with no reply between looks like the spell already closed otherwise.
 */
async function rearmCold($: EngineInterface) {
  const { last, model, cache } = await snapshot($)
  const isSwitched = tickModel !== undefined && model !== tickModel
  tickModel = model
  if ((await read($, coldDismissed)) === null) return
  if (!last || !isCold(cache) || isSwitched) await update($, coldDismissed, () => null)
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export const register: Register = on => {
  // Session start: the first measure, a redraw every 2 seconds (so the cache countdown, the cold-cache box and a
  // switch in the app's model menu, which no hook hears, show within moments), and the handoff tool and command.
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage().catch(() => undefined)
    await measure($, usage?.context.percent, usage?.rateLimits ?? []).catch(() => {})
    tick?.cancel()
    tick = $.clock.every(2_000, () => {
      void rearmCold($).finally(() => $.ui.invalidate('ui.render'))
      void autoNote($).catch(() => {})
    })
    await startHandoff($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e.context.percent, e.rateLimits)
    await measureHandoff($, e.context.percent)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Above the prompt: the cold-cache box, then the handoff offer and the note's buttons.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const away = await awayBox($, e)
    const cold = await coldBox($, e)
    const handoff = await handoffBoxes($, e)
    if (!away && !cold && !handoff) return below
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {away}
        {cold}
        {handoff}
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Desktop app: just the cache, `cache 59m` or `cache cold`, left of Control Panel in the footer. The footer's
  // one spot has no room for more. A Button, like Control Panel's chip: the app lays its buttons out in order, while
  // plain text ended up after them and cut short. Pressing it shows the full row as a toast.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface === 'terminal') return below
    const { m, model, effort, now, cache } = await snapshot($)
    if (!cache) return below
    const { Box, Button } = $.ui.resolve(e)
    const mine = (
      <Box key="session-manager-cache" flexShrink={0} marginRight={1}>
        <Button
          key="session-manager-cache-button"
          plain
          label={cacheLabel(cache)}
          hover={{ bold: true }}
          onPress={() => $.ui.toast(statusText(m, model, effort, now, cache), { timeoutMs: 8000 })}
        />
      </Box>
    )
    return (
      <Box flexDirection="row" alignItems="flex-end">
        {mine}
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))

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
  on('turn.start', async ($, e, next) => {
    isBusy = true
    // You're back and chatting: the away box has done its job. The note stays in the Handoff pane.
    if ((await read($, note))?.auto) await update($, note, n => (n ? { ...n, auto: false } : n))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) isBusy = false
    if (e.agentId === undefined && e.usage) {
      const call = { at: await $.clock.now(), model: e.usage.model }
      await update($, lastCall, () => call)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A model switch changes which cache is warm: redraw now rather than at the next tick.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    // Every /model is a new switch: a box closed for an earlier switch to the same model shows again.
    await update($, coldDismissed, () => null).catch(() => {})
    $.ui.invalidate('ui.render')
    return result
  }).catch(($, e, next) => next(e))

  // Terminal: the full row on the left, in the hint line's place, above the engine's hint.
  // The desktop app does not draw a mod's tree in the hint line; it gets the footer line below instead.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'terminal') return below
    const { Box, Text } = $.ui.resolve(e)
    const { m, model, effort, now, cache } = await snapshot($)

    // One piece of the row, kept whole: a narrow terminal wraps the row between pieces, never inside one.
    const piece = (key: string, children: RenderChildren, isFirst = false) => (
      <Box key={key} flexDirection="row" flexShrink={0}>
        {!isFirst && <Text dimColor> | </Text>}
        {children}
      </Box>
    )
    const ctx = m.context ?? 0
    const bar = meterBar(ctx)
    const ctxColor = fillColor(ctx)
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
        <Box key="session-manager-status" flexDirection="row" flexWrap="wrap">
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


  // Claude hands the note over: held for this session only, and shown. Nothing is saved.
  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const text = (e as unknown as { note?: unknown }).note
    if (typeof text !== 'string' || !text.trim()) return { result: 'Handoff note not saved: `note` is empty.', isError: true }
    const fresh: Note = { root: await $.session.root(), text: text.trim(), at: await $.clock.now() }
    await update($, note, () => fresh)
    await show($, false)
    return { result: `Saved; shown in the ${TITLE} pane. Reply with one short line, not the note.` }
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (isAway(e.args)) {
      previewCold = true
      $.ui.toast(`${TITLE}: writing the note from the cache…`)
      const why = await writeAwayNote($, true)
      if (why) previewCold = false
      return { text: why ? `${TITLE}: couldn't write the note (${why})` : `${TITLE}: showing the away box above the prompt` }
    }
    const ask = parseAsk(e.args)
    if (ask) {
      const percent = ask.percent ?? (await $.session.usage().catch(() => undefined))?.context.percent ?? LEVELS[0]
      await update($, offer, () => percent)
      return { text: `${TITLE}: showing the handoff offer above the prompt` }
    }
    if (isOpen(e.args)) {
      if (!(await read($, note))) return { text: `${TITLE}: no note in this session yet · /${COMMAND} writes one` }
      await show($, true)
      return { text: `${TITLE}: opened this session's note` }
    }
    await writeHandoff($)
    return { text: `${TITLE}: writing the note · it opens here once ready` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const saved = await read($, note)
    const frame = (children: RenderChildren) => (
      <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
        <Box flexDirection="row" marginBottom={1}>
          <Text color={VIOLET}>◈  </Text>
          <Text bold color={VIOLET}>{TITLE.toUpperCase().split('').join(' ')}</Text>
        </Box>
        {children}
      </Box>
    )
    if (!saved) return frame(<Text dimColor>{`No note yet. /${COMMAND} writes one for this session.`}</Text>)
    return frame([
      <Text key="root" color={AMBER} wrap="truncate-middle">{saved.root}</Text>,
      <Box key="actions" marginTop={1} marginBottom={1}>{buttons($, e, saved, false)}</Box>,
      <Text key="hint" dimColor>{'Copy it into a new session to keep this chat, or clear this chat and continue here.'}</Text>,
      <Box key="note" marginTop={1} flexDirection="column">
        {saved.text.split(/\r?\n/).map((line, i) => (
          <Text key={`line-${i}`} bold={line.startsWith('#')} color={line.startsWith('#') ? VIOLET : undefined}>
            {line || ' '}
          </Text>
        ))}
      </Box>,
    ])
  })
}
