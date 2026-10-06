import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Checklist, Step, StepStatus, Tally } from '../types'

const PLUGIN = 'bare-view'
const TOOL = 'checklist'
const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`

const checklist = atom({ plugin: 'bare-view', key: 'checklist' } as const, null)
const showTools = atom({ plugin: 'bare-view', key: 'showTools' } as const, false)

// Palette, after the reference: pink frame, orange-to-pink progress, green done, violet working.
const FRAME = '#e0457b'
const PINK = '#ff4f8b'
const ORANGE = '#ff9a4d'
const BLUE = '#7aa2ff'
const GREEN_FROM = '#15803d'
const GREEN_TO = '#4ade80'
const VIOLET_FROM = '#3b2f6b'
const VIOLET_TO = '#8b8cf6'
const TRACK = '#2a2433'

const INSTRUCTIONS = `# Bare View progress checklist
The user does not see your tool calls or the text you write while a checklist is in progress; they see a checklist drawn from the \`${TOOL_ID}\` tool.
- At the start of every request that needs any work (reading, searching, editing, running), call \`${TOOL_ID}\` first with a short \`goal\` and 2-7 concrete \`steps\`, the first one \`active\`, the rest \`todo\`.
- Call it again each time a step finishes: mark it \`done\` and the next one \`active\`. Add or reword steps if the plan changes.
- Before your final answer, call it with every step \`done\`. Only text after that call is shown, so the final answer must carry the outcome.
- Skip it for a pure question you can answer without tools.`

export const REMINDER = `[Bare View] The user follows your progress through the \`${TOOL_ID}\` tool, not your tool calls, and does not see text you write while steps are open. If its schema is not loaded yet, load it first with ToolSearch (query "select:${TOOL_ID}"). For a request that needs any tool, call it before other work with a short \`goal\` and 2-7 \`steps\` (the first \`active\`, the rest \`todo\`), again each time a step finishes, and once with every step \`done\` before your final answer, which is shown and must carry the outcome. Skip it for a question you answer without tools.`

const STATUSES: readonly StepStatus[] = ['done', 'active', 'todo']

export const bar = (done: number, total: number, width = 12) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const progress = (list: Checklist) => {
  const total = list.steps.length
  const done = list.steps.filter(s => s.status === 'done').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}

export const isInProgress = (list: Checklist | null) =>
  list !== null && list.steps.length > 0 && list.steps.some(s => s.status !== 'done')

export const parseChecklist = (input: Record<string, unknown>): Checklist | string => {
  const goal = typeof input.goal === 'string' ? input.goal.trim() : ''
  if (!goal) return '`goal` must be a non-empty string.'
  if (!Array.isArray(input.steps)) return '`steps` must be an array.'
  const steps: Step[] = []
  for (const raw of input.steps) {
    const s = raw as { text?: unknown; status?: unknown }
    if (typeof s?.text !== 'string' || !s.text.trim()) return 'Each step needs a `text`.'
    const status = STATUSES.includes(s.status as StepStatus) ? (s.status as StepStatus) : 'todo'
    steps.push({ text: s.text.trim(), status })
  }
  return { goal, steps }
}

/** The MCP server a tool name belongs to (`mcp__<server>__<tool>`), shortened; undefined for a built-in tool. */
export const mcpServer = (tool: string) => {
  const match = /^mcp__(.+?)__/.exec(tool)
  if (!match) return undefined
  const server = match[1]!.replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '')
  return server.replace(/_/g, ' ')
}

/** What the tally calls a tool: its own name, or "server › tool" for an MCP one. */
export const toolLabel = (tool: string) => {
  const server = mcpServer(tool)
  return server === undefined ? tool : `${server} › ${tool.replace(/^mcp__.+?__/, '')}`
}

export const countCall = (tally: Tally | undefined, tool: string): Tally => {
  const server = mcpServer(tool)
  const mcp = { ...(tally?.mcp ?? {}) }
  const builtIn = { ...(tally?.builtIn ?? {}) }
  if (server !== undefined) mcp[server] = (mcp[server] ?? 0) + 1
  else builtIn[tool] = (builtIn[tool] ?? 0) + 1
  return { total: (tally?.total ?? 0) + 1, mcp, builtIn, running: toolLabel(tool) }
}

/** Clears the running tool once it finishes, unless another call has started since. */
export const finishCall = (tally: Tally | undefined, tool: string): Tally | undefined =>
  tally && tally.running === toolLabel(tool) ? { ...tally, running: undefined } : tally

const byCount = (counts: Record<string, number>) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${name} ${n}`)
    .join(', ')

/** One line for the band: "12 tool calls · Built-in 9: Bash 5, Read 4 · MCP 3: Gmail 2, microsoft-learn 1". */
export const tallyLine = (tally: Tally | undefined) => {
  const total = tally?.total ?? 0
  const mcp = tally?.mcp ?? {}
  const mcpTotal = Object.values(mcp).reduce((n, c) => n + c, 0)
  const builtInTotal = total - mcpTotal
  const parts = [`${total} tool call${total === 1 ? '' : 's'}`]
  if (builtInTotal > 0) {
    // A tally counted before tools were named has only the number.
    const named = tally?.builtIn && Object.keys(tally.builtIn).length > 0
    parts.push(named ? `Built-in ${builtInTotal}: ${byCount(tally!.builtIn!)}` : `${builtInTotal} built-in`)
  }
  if (mcpTotal > 0) parts.push(`MCP ${mcpTotal}: ${byCount(mcp)}`)
  return parts.join(' · ')
}

const firstLine = (text: string, max = 80) => {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export const fit = (text: string, width: number) =>
  width <= 0 ? '' : text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(0, width - 1))}…`

const hex = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))

/** The colour `t` (0..1) of the way from `from` to `to`. */
export const mix = (from: string, to: string, t: number) => {
  const a = hex(from)
  const b = hex(to)
  const k = Math.min(1, Math.max(0, t))
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * k).toString(16).padStart(2, '0')).join('')}`
}

export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

// Which word a status reads as: the first open step after the active one is "Next".
export const statusWord = (steps: readonly Step[], index: number) => {
  const step = steps[index]!
  if (step.status === 'done') return 'Done'
  if (step.status === 'active') return 'Working'
  const firstTodo = steps.findIndex(s => s.status === 'todo')
  return index === firstTodo ? 'Next' : 'Up next'
}

// Messages (by id) drawn while a checklist was open stay hidden after it closes.
// A module value: a render hook may not write state, and a reload only shows them again.
const muted = new Set<string>()

// Redraws the band once a second while a checklist is open, for the timer and
// the working shimmer.
let isTicking = false
async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    while (isInProgress(await read($, checklist))) {
      await $.clock.sleep(1000)
      $.ui.invalidate('ui.render')
    }
  } finally {
    isTicking = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        'Report your plan and progress to the user as a checklist. Call it at the start of a task and after each step completes. Send the whole list every time.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'What you are working on, one short line.' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The step, a few words.' },
                status: { type: 'string', enum: ['done', 'active', 'todo'] },
              },
              required: ['text', 'status'],
            },
          },
        },
        required: ['goal', 'steps'],
      },
    })
    // The checklist shows in the band alone; clear a footer line an older version pinned.
    $.ui.status(undefined)
    await $.command.register({
      name: 'checklist',
      description: 'Toggle between the clean checklist view and the full view (tool calls and text)',
    })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [
        ...composed.sections,
        { id: `${PLUGIN}:instructions`, text: INSTRUCTIONS, scope: 'session' as const },
      ],
    }
  })

  // A new prompt: show it as the goal until the model sends its plan, and remind
  // the model of the tool. The system prompt section alone misses a session the
  // mod joined mid-way (that prompt was rendered before it loaded), and the tool
  // is deferred, so the reminder also says how to load it.
  on('prompt.submit', async ($, e, next) => {
    const goal = firstLine(e.text)
    if (!goal || goal.startsWith('/')) return next(e)
    const startedAt = await $.clock.now()
    await update($, checklist, () => ({ goal, steps: [], startedAt }))
    return next({ ...e, context: [...(e.context ?? []), REMINDER] })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const parsed = parseChecklist(e as unknown as Record<string, unknown>)
    if (typeof parsed === 'string') {
      return { result: `Checklist not updated: ${parsed}`, isError: true }
    }
    const now = await $.clock.now()
    const before = await read($, checklist)
    const startedAt = before?.startedAt ?? now
    const next: Checklist = { ...parsed, startedAt, ...(isInProgress(parsed) ? {} : { finishedAt: now }) }
    // Keep the tally counted so far; a concurrent count may land meanwhile, so read it inside the update.
    await update($, checklist, cur => ({ ...next, ...(cur?.tally ? { tally: cur.tally } : {}) }))
    if (isInProgress(next)) void tick($).catch(() => {})
    return { result: 'Checklist updated.' }
  })

  // Tally every other tool call (built-in, MCP, subagents') since the prompt,
  // naming the one running until it finishes.
  on('tool.call', async ($, e, next) => {
    if (e.tool === TOOL_ID) return next(e)
    await update($, checklist, cur => (cur === null ? cur : { ...cur, tally: countCall(cur.tally, e.tool) })).catch(() => {})
    try {
      return await next(e)
    } finally {
      await update($, checklist, cur => (cur === null ? cur : { ...cur, tally: finishCall(cur.tally, e.tool) })).catch(() => {})
    }
  })

  on('command.run', { command: 'checklist' }, async $ => {
    const shown = await update($, showTools, v => !v)
    return { text: shown ? 'Showing every tool call and message.' : 'Clean checklist view on: tool calls and working text hidden.' }
  })

  // Mute what the model writes while steps are open; its final answer, written
  // after every step is done, still shows.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (await read($, showTools)) return next(e)
    if (isInProgress(await read($, checklist))) muted.add(e.requestId)
    if (!muted.has(e.requestId)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Hide the tool-call rows; errors still show so nothing fails silently.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== TOOL_ID && (e.props.isErrored || (await read($, showTools)))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.tool !== TOOL_ID && (e.props.isErrored || (await read($, showTools)))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded || (await read($, showTools))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Draw whatever other plugins put in the band too, so they can share it.
    const below = await next(e)
    const list = await read($, checklist)
    if (e.props.hasSurvey || list === null) return below

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const { done, total, percent } = progress(list)
    const isFinished = total > 0 && done === total
    const timer = list.startedAt === undefined ? '' : elapsed((list.finishedAt ?? now) - list.startedAt)
    const tickNo = Math.floor(now / 1000)

    // Inside the frame: two border cells and two of padding.
    const inner = Math.max(30, e.props.bodyColumns - 4)
    const label = total === 0 ? (e.props.isWorking ? 'Planning…' : 'No plan yet') : isFinished ? `All ${total} done` : `Step ${Math.min(done + 1, total)} of ${total}`
    const labelW = 14
    const pctText = `${percent}%`
    const barW = Math.max(8, inner - labelW - pctText.length - 1)
    const filled = total === 0 ? 0 : Math.round((done / total) * barW)

    // The tool running right now sits at the right end of the tally row, while a turn is going.
    const running = e.props.isWorking && list.tally?.running ? `▶ ${fit(list.tally.running, 40).trimEnd()}` : ''
    const runningW = running ? running.length + 2 : 0

    const textW = Math.max(16, Math.min(44, Math.floor(inner * 0.4)))
    const miniW = 12
    const statusW = 9

    // Goal words shade orange to pink to blue, as in the reference.
    const words = list.goal.split(/(\s+)/)
    const goalW = inner - timer.length - 3
    let used = 0

    const cells = (count: number, color: (i: number) => string, char = '█') =>
      Array.from({ length: count }, (_, i) => <Text color={color(i)}>{char}</Text>)

    const mini = (step: Step, index: number) => {
      if (step.status === 'done') return cells(miniW, i => mix(GREEN_FROM, GREEN_TO, i / (miniW - 1)))
      if (step.status === 'todo') return [<Text>{' '.repeat(miniW)}</Text>]
      // Working: a violet run that grows and wraps once a second.
      const run = 3 + ((tickNo + index) % (miniW - 3))
      const start = miniW - run
      return [
        <Text>{' '.repeat(start)}</Text>,
        ...cells(run, i => mix(VIOLET_FROM, VIOLET_TO, run === 1 ? 1 : i / (run - 1))),
      ]
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color={PINK}>✱ </Text>
              {words.map((w, i) => {
                if (used >= goalW) return null
                const room = goalW - used
                const piece = w.length > room ? `${w.slice(0, Math.max(0, room - 1))}…` : w
                used += piece.length
                const t = words.length <= 1 ? 0 : i / (words.length - 1)
                const color = t < 0.5 ? mix(ORANGE, PINK, t * 2) : mix(PINK, BLUE, (t - 0.5) * 2)
                return (
                  <Text bold color={color}>
                    {piece}
                  </Text>
                )
              })}
            </Text>
            <Text dimColor>{timer}</Text>
          </Box>

          <Box flexDirection="row">
            <Text dimColor={total === 0} color={isFinished ? GREEN_TO : undefined}>
              {fit(label, labelW)}
            </Text>
            <Text>
              {cells(filled, i => mix(ORANGE, PINK, filled <= 1 ? 1 : i / (filled - 1)))}
              <Text color={TRACK}>{'█'.repeat(barW - filled)}</Text>
            </Text>
            <Text> </Text>
            <Text bold color={isFinished ? GREEN_TO : PINK}>
              {pctText}
            </Text>
          </Box>

          {list.tally && list.tally.total > 0 ? (
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>
                <Text color={BLUE}>⚙ </Text>
                {fit(tallyLine(list.tally), inner - 2 - runningW).trimEnd()}
              </Text>
              {running ? <Text color={VIOLET_TO}>{running}</Text> : null}
            </Box>
          ) : null}

          {list.steps.map((step, i) => {
            const word = statusWord(list.steps, i)
            const isActive = step.status === 'active'
            return (
              <Box flexDirection="row">
                <Text color={step.status === 'done' ? GREEN_TO : isActive ? PINK : undefined} dimColor={step.status === 'todo'}>
                  {step.status === 'done' ? '✓ ' : isActive ? '● ' : '○ '}
                </Text>
                <Text bold={isActive} dimColor={!isActive}>
                  {fit(step.text, textW)}
                </Text>
                <Text> </Text>
                <Text>{mini(step, i)}</Text>
                <Text>  </Text>
                <Text bold={isActive} color={isActive ? PINK : undefined} dimColor={!isActive}>
                  {fit(word, statusW)}
                </Text>
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
