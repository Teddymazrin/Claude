import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Note } from '../types'

const PLUGIN = 'context-handoff'
const TITLE = 'Context Handoff'
const PANE = 'context-handoff'
const COMMAND = 'handoff'
const TOOL = 'handoff_note'
const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`

// Context percentages that each raise the box above the prompt once, until the context drops back below them.
export const LEVELS = [50, 65, 80] as const
const SEND_DELAY_MS = 300
// The two ways on from a note.
export const COPY_LABEL = '⧉ Copy & continue in a new chat'
export const RESTART_LABEL = '↻ Clear this chat & continue with note'

// Palette: violet frame and title, amber for the project, slate buttons.
const FRAME = '#6d5aa8'
const VIOLET = '#b4a2f0'
const AMBER = '#f6c177'
const SLATE = '#2a2f3a'

const warned = atom({ plugin: 'context-handoff', key: 'warned' } as const, 0)
const note = atom({ plugin: 'context-handoff', key: 'note' } as const, null)
const band = atom({ plugin: 'context-handoff', key: 'band' } as const, false)
const offer = atom({ plugin: 'context-handoff', key: 'offer' } as const, null)

/** The highest level `percent` has reached, or 0 below the first. */
export const levelFor = (percent: number) => LEVELS.filter(level => percent >= level).pop() ?? 0

// Why handing off matters, more urgent at each level.
const WHY: Record<(typeof LEVELS)[number], string> = {
  50: ' · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?',
  65: ' · Every message now costs more usage, and Claude may start missing details. Start fresh at your next break.',
  80: ' · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now.',
}

/** The bold start of the box's line. */
export const fullText = (percent: number) => `This chat is ${percent}% full`

/** The part of the box's line after the percentage; below the first level it reads as the first. */
export const whyFor = (percent: number) => WHY[(levelFor(percent) || LEVELS[0]) as (typeof LEVELS)[number]]

/** The box's whole line, with the percentage the context is at. */
export const offerText = (percent: number) => `${fullText(percent)}${whyFor(percent)}`

/** `/handoff open` shows this session's note again; anything else writes a fresh one. */
export const isOpen = (args: string) => /^\s*(open|show|view)\s*$/i.test(args)

/** `/handoff ask [50|65|80]` shows the box now, at that percentage or the context's own. Null when not an ask. */
export const parseAsk = (args: string): { percent?: number } | null => {
  const match = /^\s*(?:ask|offer|preview)(?:\s+(\d{1,3}))?\s*$/i.exec(args)
  if (!match) return null
  return match[1] ? { percent: Number(match[1]) } : {}
}

export const writePrompt = (root: string, when: string) =>
  [
    `Write a handoff note for this session and send it with the ${TOOL} tool (pass the whole note as \`note\`). Don't write it to a file.`,
    'It is for a fresh session with none of this conversation, so make it complete but short. Use these sections:',
    `# Handoff: ${root}`,
    `Written ${when}`,
    '## Goal: what we are trying to do, in one or two lines',
    '## Done: what is finished and verified',
    '## In progress: what was mid-way and exactly where it stopped',
    '## Next steps: a numbered list, the first one ready to start',
    '## Key files: paths that matter, with a few words on each',
    '## Decisions and gotchas: choices made and why, things that failed, things to avoid',
    'Only write what is true of this session; leave a section out rather than guess.',
    'The note opens in the Context Handoff pane, so reply with one short line, not the note.',
  ].join('\n')

/** What the person pastes into a fresh session: the note itself, with what to do with it. */
export const copyPrompt = (text: string) =>
  [
    "Here's a handoff note from my last session. Sum up where things stand in a few lines, say which next step you would start with, and wait for me to confirm before doing it.",
    '',
    text,
  ].join('\n')

// The side pane when there is room; the box above the prompt otherwise, so it always shows.
async function show($: EngineInterface, isAsked: boolean) {
  const opened = await $.ui
    .open({ id: PANE, title: TITLE, ...(isAsked ? { focus: true as const, closeOnEscape: true as const } : {}) })
    .catch(() => undefined)
  const mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
  await update($, band, () => !(opened?.isPlaced && mine?.isShown))
}

// After the command has finished, so the turn isn't started from inside it. If the
// engine still refuses, the prompt goes in the box instead: one Enter sends it.
function send($: EngineInterface, text: string) {
  $.clock.after(SEND_DELAY_MS, () => {
    $.prompt.submit({ text }).catch(async (error: unknown) => {
      const filled = await $.prompt.fill({ text }).catch(() => undefined)
      const why = error instanceof Error ? error.message : String(error)
      $.ui.toast(filled?.isFilled ? `${TITLE}: press Enter to send the prompt` : `${TITLE}: couldn't start the turn (${why})`, { timeoutMs: 10000 })
    })
  })
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
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
      description: 'Write a handoff note for this session (`open` shows it again, `ask 50|65|80` previews the offer box)',
      argumentHint: '[open|ask [50|65|80]]',
    })
    return next(e)
  })

  // The box above the prompt, once per level crossed. Dropping back below a level (after /clear or a compact)
  // closes the box and re-arms that level.
  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    if (percent !== undefined) {
      const level = levelFor(percent)
      const shown = await read($, warned)
      if (level > shown) await update($, offer, () => percent)
      else if (level < shown) await update($, offer, () => null)
      if (level !== shown) await update($, warned, () => level)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

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
    const when = new Date(await $.clock.now()).toLocaleString()
    await update($, offer, () => null)
    send($, writePrompt(await $.session.root(), when))
    return { text: `${TITLE}: writing the note · it opens here once ready` }
  })

  // Above the prompt: the 50% offer, and the note's buttons when the side pane had no room.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const saved = await read($, note)
    const atPercent = await read($, offer)
    const isBand = (await read($, band)) && saved !== null
    if (atPercent === null && !isBand) return below
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
                onPress={async () => {
                  await dismiss()
                  send($, writePrompt(await $.session.root(), new Date(await $.clock.now()).toLocaleString()))
                }}
              />
            </Box>
            <Box key="offer-later-box" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: FRAME }}>
              <Button key="offer-later" plain label="Not now" hover={{ bold: true }} onPress={dismiss} />
            </Box>
          </Box>
        </Box>
      )
    if (!isBand || !saved) return (
      <Box flexDirection="column">
        {offerBox}
        {below}
      </Box>
    )
    return (
      <Box flexDirection="column">
        {offerBox}
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
        </Box>
        {below}
      </Box>
    )
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
