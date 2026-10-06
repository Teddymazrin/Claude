import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NextStep, StepSet } from '../types'

const PLUGIN = 'action-steps'
const PANE = 'action-steps'
const TITLE = 'Action Steps'
const COMMAND = 'action-steps'
const TOOL = 'action_steps'
const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`
const KEEP = 8

const sets = atom({ plugin: 'action-steps', key: 'sets' } as const, [])
const expanded = atom({ plugin: 'action-steps', key: 'expanded' } as const, null)
const band = atom({ plugin: 'action-steps', key: 'band' } as const, null)

// Palette: teal frame and title, amber commands, green done.
const FRAME = '#2f7f86'
const TEAL = '#4fd1c5'
const AMBER = '#f6c177'
const GREEN = '#4ade80'
const CODE_BG = '#1f2630'
const SLATE = '#2a2f3a'

const INSTRUCTIONS = `# Action Steps pane
The user keeps an Action Steps pane beside the chat for what they must do themselves after you finish: run a script you wrote, fill in a parameter, sign in, check a setting in a portal, restart something.
- When a task leaves the user with follow-up actions, call \`${TOOL_ID}\` once near the end with a short \`title\` (the task) and 2-6 \`steps\`. Each step is one short imperative line (under ~60 characters, no explanation), with the exact \`command\` to run where there is one (real paths and parameter names, placeholders in <angle brackets>).
- Then keep the how-to out of your final answer: say what you did and that the steps are in the Action Steps pane.
- Skip it for questions, explanations, or tasks that leave nothing for the user to do.`

export const REMINDER = `[Action Steps] If this task leaves the user with things to do themselves (run, configure, verify), send them to \`${TOOL_ID}\` before your final answer (load it with ToolSearch "select:${TOOL_ID}" if needed) and keep the how-to out of the chat. Skip it when there is nothing for them to do.`

export const parseSet = (input: Record<string, unknown>, id: string, at: number): StepSet | string => {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return '`title` must be a non-empty string.'
  if (!Array.isArray(input.steps) || input.steps.length === 0) return '`steps` must be a non-empty array.'
  const steps: NextStep[] = []
  for (const raw of input.steps) {
    const s = raw as { text?: unknown; command?: unknown }
    if (typeof s?.text !== 'string' || !s.text.trim()) return 'Each step needs a `text`.'
    const command = typeof s.command === 'string' && s.command.trim() ? s.command.trim() : undefined
    steps.push({ text: s.text.trim(), ...(command ? { command } : {}), isDone: false })
  }
  return { id, title, steps, at }
}

/** The newest first, `KEEP` at most; a set with the same title replaces the older one. */
export const addSet = (list: readonly StepSet[], set: StepSet) =>
  [set, ...list.filter(s => s.title !== set.title)].slice(0, KEEP)

export const toggleStep = (list: readonly StepSet[], id: string, index: number) =>
  list.map(s => (s.id !== id ? s : { ...s, steps: s.steps.map((st, i) => (i === index ? { ...st, isDone: !st.isDone } : st)) }))

export const doneCount = (set: StepSet) => set.steps.filter(s => s.isDone).length

export const spaced = (text: string) => text.toUpperCase().split('').join(' ')

export const ago = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/** "5 steps", then "5 steps · 2 done" once some are ticked, "All 5 done" at the end. */
export const countText = (set: StepSet) => {
  const total = set.steps.length
  const done = doneCount(set)
  const steps = `${total} step${total === 1 ? '' : 's'}`
  if (done === 0) return steps
  return done === total ? `All ${total} done` : `${steps} · ${done} done`
}

// Every change goes to the session's state (redraws the pane) and the store (kept across sessions).
async function save($: EngineInterface, fn: (list: StepSet[]) => StepSet[]) {
  const next = await update($, sets, list => fn(list))
  await $.store.set('sets', next).catch(() => {})
}

type Surface = Parameters<EngineInterface['ui']['resolve']>[0]

// "1: Sign in to Azure", the number ticking it off; its command, if any, beneath with Copy.
function stepLine($: EngineInterface, e: Surface, set: StepSet, step: NextStep, i: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box key={`${set.id}-${i}`} flexDirection="column">
      <Box key={`row-${set.id}-${i}`} flexDirection="row" hover={{ backgroundColor: SLATE }}>
        <Box width={4} flexShrink={0}>
          <Button
            key={`tick-${set.id}-${i}`}
            plain
            label={step.isDone ? '✓ ' : `${i + 1}:`}
            hover={{ bold: true }}
            onPress={() => save($, l => toggleStep(l, set.id, i))}
          />
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor={step.isDone} strikethrough={step.isDone} color={step.isDone ? GREEN : undefined}>
            {step.text}
          </Text>
        </Box>
      </Box>
      {step.command && !step.isDone && (
        <Box flexDirection="row" marginLeft={4}>
          <Box flexGrow={1} flexShrink={1} backgroundColor={CODE_BG} paddingX={1}>
            <Text color={AMBER}>{step.command}</Text>
          </Box>
          <Box key={`copybox-${set.id}-${i}`} flexShrink={0} marginLeft={1} backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: FRAME }}>
            <Button
              key={`copy-${set.id}-${i}`}
              plain
              label="Copy"
              hover={{ bold: true }}
              onPress={async press => {
                const copied = await $.ui.copy({ text: step.command!, surface: press.surface })
                $.ui.toast(copied.isCopied ? 'Command copied' : 'Could not copy the command')
              }}
            />
          </Box>
        </Box>
      )}
    </Box>
  )
}

// The pane's last drawing error, if any; a pane whose drawing throws is dropped by the engine.
let renderError: string | undefined

// One line on where the pane stands, for the tool result and the command: a missing pane says why.
async function paneReport($: EngineInterface) {
  const mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
  const state = mine ? `pane placed=${mine.isPlaced} shown=${mine.isShown} focused=${mine.isFocused}` : 'pane not open'
  return renderError ? `${state}; draw error: ${renderError}` : state
}

async function openPane($: EngineInterface, isAsked: boolean) {
  return $.ui.open({ id: PANE, title: TITLE, ...(isAsked ? { focus: true as const, closeOnEscape: true as const } : {}) })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        "Pin the user's follow-up actions for the task you just did (run a script, set a parameter, verify something) in their Action Steps pane. Call once near the end of a task that leaves them things to do.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The task these steps follow, a few words.' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'One action, a few plain words.' },
                command: { type: 'string', description: 'The exact command to run for this step, if any.' },
              },
              required: ['text'],
            },
          },
        },
        required: ['title', 'steps'],
      },
    })
    await $.command.register({ name: COMMAND, description: 'Open the Action Steps pane' })
    // Bring back what earlier sessions pinned.
    if ((await read($, sets)).length === 0) {
      const stored = (await $.store.get('sets')) as StepSet[] | undefined
      if (Array.isArray(stored) && stored.length > 0) await update($, sets, () => stored)
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [...composed.sections, { id: `${PLUGIN}:instructions`, text: INSTRUCTIONS, scope: 'session' as const }],
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.text.trim().startsWith('/')) return next(e)
    return next({ ...e, context: [...(e.context ?? []), REMINDER] })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const now = await $.clock.now()
    const parsed = parseSet(e as unknown as Record<string, unknown>, String(now), now)
    if (typeof parsed === 'string') return { result: `Action steps not saved: ${parsed}`, isError: true }
    await save($, list => addSet(list, parsed))
    await update($, expanded, () => null)
    // The side pane when the window has room for it; above the prompt otherwise, so it always shows.
    const opened = await openPane($, false).catch(() => undefined)
    let mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
    // Placed but a tab behind another pane: raise it so it actually pops up.
    if (mine?.isPlaced && !mine.isShown) {
      await openPane($, true).catch(() => undefined)
      mine = (await $.ui.panes().catch(() => [])).find(p => p.id === PANE)
    }
    const isShown = opened?.isPlaced === true && mine?.isShown === true
    await update($, band, () => (isShown ? null : parsed.id))
    const where = isShown ? 'the Action Steps pane' : 'the Action Steps box above the prompt'
    // Where the pane stands goes along only when it is not showing, to say why.
    const report = isShown ? '' : ` [${await paneReport($)}]`
    return { result: `Saved; shown in ${where}. Tell the user the steps are there instead of repeating them.${report}` }
  })

  // Once the side pane is up, the box above the prompt is not needed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const id = await read($, band)
    if (id === null || e.props.hasSurvey) return below
    const set = (await read($, sets)).find(s => s.id === id)
    if (!set || doneCount(set) === set.steps.length) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box key="action-steps-band" flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
          <Box key="band-header" flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color={TEAL}>▸ </Text>
              <Text bold color={TEAL}>{`Action steps · ${set.title}`}</Text>
            </Text>
            <Button key="band-close" plain label="✕" hover={{ bold: true }} onPress={() => update($, band, () => null)} />
          </Box>
          {set.steps.map((step, i) => stepLine($, e, set, step, i))}
        </Box>
        {below}
      </Box>
    )
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const opened = await openPane($, true)
    const room = `${e.presentation.isFullscreen ? 'fullscreen' : 'main screen'}, ${e.presentation.columns} cols`
    const why = opened.isPlaced ? '' : ` Waiting: ${opened.reason}.`
    return { text: `${TITLE} opened (${room}; ${await paneReport($)}).${why}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    try {
    renderError = undefined
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, sets)
    const openId = (await read($, expanded)) ?? list[0]?.id
    const now = await $.clock.now()

    const header = (
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row">
          <Text color={TEAL}>▸  </Text>
          <Text bold color={TEAL}>{spaced(TITLE)}</Text>
        </Box>
        {list.length > 0 && (
          <Box key="clear-all-box" backgroundColor={SLATE} paddingX={1} hover={{ backgroundColor: FRAME }}>
            <Button key="clear-all" plain label="Clear all" hover={{ bold: true }} onPress={() => save($, () => [])} />
          </Box>
        )}
      </Box>
    )

    if (list.length === 0) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
          {header}
          <Text dimColor>Nothing to do yet. When a task leaves you steps to follow, they show up here.</Text>
        </Box>
      )
    }

    const current = list.find(s => s.id === openId) ?? list[0]!
    const earlier = list.filter(s => s.id !== current.id)
    const done = doneCount(current)

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
        {header}
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Text bold>{current.title}</Text>
          <Text color={done === current.steps.length ? GREEN : AMBER}>{countText(current)}</Text>
        </Box>
        {current.steps.map((step, i) => stepLine($, e, current, step, i))}

        {earlier.length > 0 && (
          <Box marginTop={1}>
            <Text dimColor>{spaced('Earlier')}</Text>
          </Box>
        )}
        {earlier.map(set => (
          <Box key={set.id} flexDirection="row" hover={{ backgroundColor: SLATE }}>
            <Box flexGrow={1} flexShrink={1}>
              <Button key={`expand-${set.id}`} plain label={`▸ ${set.title}`} hover={{ bold: true }} onPress={() => update($, expanded, () => set.id)} />
            </Box>
            <Text dimColor>{` ${countText(set)} · ${ago(now - set.at)} `}</Text>
            <Button key={`remove-${set.id}`} plain label="✕" hover={{ bold: true }} onPress={() => save($, l => l.filter(s => s.id !== set.id))} />
          </Box>
        ))}
      </Box>
    )
    } catch (err) {
      // Draw the error instead of losing the pane, and keep it for /action-steps to report.
      renderError = err instanceof Error ? err.message : String(err)
      const { Text } = $.ui.resolve(e)
      return <Text color={AMBER}>{`Action Steps could not draw: ${renderError}`}</Text>
    }
  })
}
