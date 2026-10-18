// Handoff: the names, wording and prompts. Everything that touches $ lives in register.tsx.

export const PLUGIN = 'session-manager'
export const TITLE = 'Handoff'
export const PANE = 'session-manager-handoff'
export const COMMAND = 'handoff'
export const TOOL = 'handoff_note'
export const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`

// Context percentages that each raise the box above the prompt once, until the context drops back below them.
export const LEVELS = [50, 65, 80] as const
export const SEND_DELAY_MS = 300
// The two ways on from a note.
export const COPY_LABEL = '⧉ Copy & continue in a new chat'
export const RESTART_LABEL = '↻ Clear this chat & continue with note'

// Palette: violet frame and title, amber for the project, slate buttons.
export const FRAME = '#6d5aa8'
export const VIOLET = '#b4a2f0'
export const AMBER = '#f6c177'

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

/** `/handoff away` writes the note now and shows the away box as if the cache had run out (`cold` is still taken). */
export const isAway = (args: string) => /^\s*away(?:\s+cold)?\s*$/i.test(args)

/** `/handoff ask [50|65|80]` shows the box now, at that percentage or the context's own. Null when not an ask. */
export const parseAsk = (args: string): { percent?: number } | null => {
  const match = /^\s*(?:ask|offer|preview)(?:\s+(\d{1,3}))?\s*$/i.exec(args)
  if (!match) return null
  return match[1] ? { percent: Number(match[1]) } : {}
}

// The note's sections, the same however it is written.
const sections = (root: string, when: string) => [
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
]

export const writePrompt = (root: string, when: string) =>
  [
    `Write a handoff note for this session and send it with the ${TOOL} tool (pass the whole note as \`note\`). Don't write it to a file.`,
    ...sections(root, when),
    'The note opens in the Handoff pane, so reply with one short line, not the note.',
  ].join('\n')

/** Asked from the cache while the user is away: no tools run, so the reply is the note itself. */
export const autoPrompt = (root: string, when: string) =>
  [
    'The user has stepped away and this chat is about to drop out of the cache. Write a handoff note for this session now. No tools are available.',
    ...sections(root, when),
    'Reply with the note alone, in Markdown, starting with its # Handoff line: nothing before or after it.',
  ].join('\n')

/** What the person pastes into a fresh session: the note itself, with what to do with it. */
export const copyPrompt = (text: string) =>
  [
    "Here's a handoff note from my last session. Sum up where things stand in a few lines, say which next step you would start with, and wait for me to confirm before doing it.",
    '',
    text,
  ].join('\n')
