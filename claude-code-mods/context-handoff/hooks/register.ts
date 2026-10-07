import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const TITLE = 'Context Handoff'
const WRITE = 'handoff'
const RESUME = 'handoff-resume'

// Context percentages that each raise one warning per session.
export const LEVELS = [70, 85] as const
// A note older than this is not offered at session start.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000
const SEND_DELAY_MS = 300

const warned = atom({ plugin: 'context-handoff', key: 'warned' } as const, 0)

/** The highest level `percent` has reached, or 0 below the first. */
export const levelFor = (percent: number) => LEVELS.filter(level => percent >= level).pop() ?? 0

export const warningText = (percent: number, level: number) =>
  level >= LEVELS[LEVELS.length - 1]!
    ? `Context ${percent}% full · run /${WRITE} now, then /clear and /${RESUME}`
    : `Context ${percent}% full · /${WRITE} saves a handoff note before it fills`

/** One file name per project, from its root folder: `C:\Users\me\app` → `C-Users-me-app.md`. */
export const noteName = (root: string) =>
  `${root.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'}.md`

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
    'Only write what is true of this session; leave a section out rather than guess. Reply with the path when done.',
  ].join('\n')

export const resumePrompt = (path: string) =>
  `Read the handoff note at ${path}. Summarize where things stand in a few lines, say which next step you would start with, and wait for me to confirm before doing it.`

async function notePath($: EngineInterface) {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
  const root = await $.session.root()
  return { root, path: `${home}/.claude/handoffs/${noteName(root)}` }
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: WRITE, description: 'Write a handoff note for this project before the context fills' })
    await $.command.register({ name: RESUME, description: 'Pick up from the last handoff note for this project' })
    // Offer a recent note, so /clear or a new session can carry on from it.
    const { path } = await notePath($)
    const note = await $.fs.stat(path).catch(() => undefined)
    if (note?.kind === 'file' && (await $.clock.now()) - note.mtimeMs < FRESH_MS) {
      $.ui.toast(`${TITLE}: a note is saved for this project · /${RESUME} to pick it up`, { timeoutMs: 8000 })
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

  on('command.run', { command: WRITE }, async $ => {
    const { root, path } = await notePath($)
    const when = new Date(await $.clock.now()).toLocaleString()
    send($, writePrompt(path, root, when))
    return { text: `${TITLE}: writing the note to ${path}` }
  })

  on('command.run', { command: RESUME }, async $ => {
    const { path } = await notePath($)
    const note = await $.fs.stat(path).catch(() => undefined)
    if (note?.kind !== 'file') return { text: `${TITLE}: no note for this project yet · /${WRITE} writes one` }
    send($, resumePrompt(path))
    return { text: `${TITLE}: picking up from ${path}` }
  })
}
