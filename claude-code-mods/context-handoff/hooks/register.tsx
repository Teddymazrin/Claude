import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Note } from '../types'

const TITLE = 'Context Handoff'
const PANE = 'context-handoff'
const COMMAND = 'handoff'

// Context percentages that each raise one warning per session.
export const LEVELS = [70, 85] as const
// A note older than this is not mentioned at session start.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const SEND_DELAY_MS = 300

// Palette: violet frame and title, amber for the path, slate buttons.
const FRAME = '#6d5aa8'
const VIOLET = '#b4a2f0'
const AMBER = '#f6c177'
const SLATE = '#2a2f3a'

const warned = atom({ plugin: 'context-handoff', key: 'warned' } as const, 0)
const note = atom({ plugin: 'context-handoff', key: 'note' } as const, null)
const band = atom({ plugin: 'context-handoff', key: 'band' } as const, false)

/** The highest level `percent` has reached, or 0 below the first. */
export const levelFor = (percent: number) => LEVELS.filter(level => percent >= level).pop() ?? 0

export const warningText = (percent: number, level: number) =>
  level >= LEVELS[LEVELS.length - 1]!
    ? `Context ${percent}% full · run /${COMMAND} now, then copy the prompt and /clear`
    : `Context ${percent}% full · /${COMMAND} saves a handoff note before it fills`

/** One file name per project, from its root folder: `C:\Users\me\app` → `C-Users-me-app.md`. */
export const noteName = (root: string) =>
  `${root.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'}.md`

/** Whether two spellings name the same file: slashes either way, any case (Windows paths). */
export const samePath = (a: string, b: string) => {
  const plain = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
  return plain(a) === plain(b)
}

/** `/handoff open` shows the saved note; anything else writes a fresh one. */
export const isOpen = (args: string) => /^\s*(open|show|view)\s*$/i.test(args)

export const writePrompt = (path: string, root: string, when: string) =>
  [
    `Write a handoff note for this session to ${path} (create the folder if needed, replace the file if it exists).`,
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
    'The note opens in the Context Handoff pane once saved, so reply with one short line, not the note.',
  ].join('\n')

/** What the person pastes into a fresh session to pick the work back up. */
export const copyPrompt = (path: string) =>
  `Read the handoff note at ${path}. Summarize where things stand in a few lines, say which next step you would start with, and wait for me to confirm before doing it.`

async function notePath($: EngineInterface) {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
  const root = await $.session.root()
  return { root, path: `${home}/.claude/handoffs/${noteName(root)}` }
}

// Reads the note into state; false when there is none.
async function load($: EngineInterface, path: string) {
  const text = await $.fs.read(path).catch(() => undefined)
  if (text === undefined) return false
  const saved: Note = { path, text: text.trim(), at: await $.clock.now() }
  await update($, note, () => saved)
  return true
}

// The side pane when there is room; the box above the prompt otherwise, so it always shows.
async function show($: EngineInterface, isAsked: boolean) {
  const opened = await $.ui
    .open({ id: PANE, title: TITLE, ...(isAsked ? { focus: true as const, closeOnEscape: true as const } : {}) })
    .catch(() => undefined)
  const mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
  await update($, band, () => !(opened?.isPlaced && mine?.isShown))
}

// A file just written or edited: when it is this project's note, show it.
async function saved($: EngineInterface, file: string) {
  const { path } = await notePath($)
  if (samePath(file, path) && (await load($, path))) await show($, false)
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

async function copy($: EngineInterface, text: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface'], what: string) {
  const copied = await $.ui.copy({ text, surface })
  $.ui.toast(copied.isCopied ? `${what} copied` : `Could not copy the ${what.toLowerCase()}`)
}

type Surface = Parameters<EngineInterface['ui']['resolve']>[0]

// Copy prompt, Copy note, and Open (in the box only).
function buttons($: EngineInterface, e: Surface, saved: Note, withOpen: boolean) {
  const { Box, Button } = $.ui.resolve(e)
  const button = (key: string, label: string, onPress: (press: { surface: Surface['surface'] }) => unknown) => (
    <Box key={`${key}-box`} backgroundColor={SLATE} paddingX={1} marginRight={1} hover={{ backgroundColor: FRAME }}>
      <Button key={key} plain label={label} hover={{ bold: true }} onPress={onPress} />
    </Box>
  )
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {button('copy-prompt', '⧉ Copy prompt', press => copy($, copyPrompt(saved.path), press.surface, 'Prompt'))}
      {button('copy-note', '⧉ Copy note', press => copy($, saved.text, press.surface, 'Note'))}
      {withOpen && button('open-pane', '▸ Open', () => show($, true))}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Write a handoff note for this project (`open` shows the saved one)',
      argumentHint: '[open]',
    })
    // Mention a recent note, so /clear or a new session can carry on from it.
    const { path } = await notePath($)
    const saved = await $.fs.stat(path).catch(() => undefined)
    if (saved?.kind === 'file' && (await $.clock.now()) - saved.mtimeMs < FRESH_MS) {
      $.ui.toast(`${TITLE}: a note is saved for this project · /${COMMAND} open to see it`, { timeoutMs: 8000 })
    }
    return next(e)
  })

  // One toast per level crossed; dropping back below the first (after /clear or a compact) re-arms it.
  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    if (percent !== undefined) {
      const level = levelFor(percent)
      const shown = await read($, warned)
      if (level > shown) $.ui.toast(warningText(percent, level), { timeoutMs: 10000 })
      if (level !== shown) await update($, warned, () => level)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // When Claude saves the note, it opens in the pane.
  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) await saved($, e.file_path).catch(() => {})
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) await saved($, e.file_path).catch(() => {})
    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const { root, path } = await notePath($)
    if (isOpen(e.args)) {
      if (!(await load($, path))) return { text: `${TITLE}: no note for this project yet · /${COMMAND} writes one` }
      await show($, true)
      return { text: `${TITLE}: opened ${path}` }
    }
    const when = new Date(await $.clock.now()).toLocaleString()
    send($, writePrompt(path, root, when))
    return { text: `${TITLE}: writing the note to ${path} · it opens here once saved` }
  })

  // The note shown above the prompt when the side pane had no room.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const saved = await read($, note)
    if (!(await read($, band)) || !saved || e.props.hasSurvey) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box key="handoff-band" flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
          <Box key="band-header" flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color={VIOLET}>◈ </Text>
              <Text bold color={VIOLET}>Handoff note saved</Text>
              <Text dimColor>{` · ${saved.path}`}</Text>
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
    if (!saved) return frame(<Text dimColor>{`No note yet. /${COMMAND} writes one for this project.`}</Text>)
    return frame([
      <Text key="path" color={AMBER} wrap="truncate-middle">{saved.path}</Text>,
      <Box key="actions" marginTop={1} marginBottom={1}>{buttons($, e, saved, false)}</Box>,
      <Text key="hint" dimColor>{'Copy the prompt, run /clear, then paste it to carry on.'}</Text>,
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
