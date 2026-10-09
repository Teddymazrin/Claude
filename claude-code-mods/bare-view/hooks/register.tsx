import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Call, Checklist, Phase, Step, StepStatus, Tally, TallyKey } from '../types'

const PLUGIN = 'bare-view'
const TOOL = 'checklist'
const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`
// The most calls a peek lists under a step: the newest, with a count of the rest.
export const PEEK_MAX = 8

const checklist = atom({ plugin: 'bare-view', key: 'checklist' } as const, null)
const showTools = atom({ plugin: 'bare-view', key: 'showTools' } as const, false)
const peek = atom({ plugin: 'bare-view', key: 'peek' } as const, null)
const openTally = atom({ plugin: 'bare-view', key: 'openTally' } as const, [] as TallyKey[])
const activity = atom({ plugin: 'bare-view', key: 'activity' } as const, null as Activity | null)
const unfolded = atom({ plugin: 'bare-view', key: 'unfolded' } as const, false)

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
- Call it again only when the plan changes; do not send an update after every step.
- Mark a step \`failed\` only when its result did not happen and you are not fixing it this turn (a push rejected, tests still failing, a file not written), and give it a \`reason\`: what went wrong, in a few plain words the user understands ("Branch not found", "GitHub rejected the push: behind main"). A tool call that errored but was retried, or did not matter, does not make a step failed.
- Before your final answer, call it with every step \`done\` (or \`failed\`). Only text after that call is shown.
- If any tool call errored, the final answer says in one line whether it affected the result.
- Final answer: lead with the result in 1-3 sentences. Add details only if the user must act on them or something surprising happened. Don't recap the steps; the checklist already showed them.
- Skip it for a pure question you can answer without tools.`

export const REMINDER = `[Bare View] Use the checklist (ToolSearch "select:${TOOL_ID}" if not loaded); final answer = short outcome.`

const STATUSES: readonly StepStatus[] = ['done', 'active', 'todo', 'failed']

/** A step that is over: done, or failed and left. */
export const isClosed = (step: Step) => step.status === 'done' || step.status === 'failed'

export const bar = (done: number, total: number, width = 12) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const progress = (list: Checklist) => {
  const total = list.steps.length
  // Failed steps are over too: they fill the bar like done ones.
  const done = list.steps.filter(isClosed).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const failed = list.steps.filter(s => s.status === 'failed').length
  return { done, total, percent, failed }
}

export const isInProgress = (list: Checklist | null) =>
  list !== null && list.steps.length > 0 && list.steps.some(s => !isClosed(s))

export const parseChecklist = (input: Record<string, unknown>): Checklist | string => {
  const goal = typeof input.goal === 'string' ? input.goal.trim() : ''
  if (!goal) return '`goal` must be a non-empty string.'
  if (!Array.isArray(input.steps)) return '`steps` must be an array.'
  const steps: Step[] = []
  for (const raw of input.steps) {
    const s = raw as { text?: unknown; status?: unknown; reason?: unknown }
    if (typeof s?.text !== 'string' || !s.text.trim()) return 'Each step needs a `text`.'
    const status = STATUSES.includes(s.status as StepStatus) ? (s.status as StepStatus) : 'todo'
    // A reason belongs to a failed step only.
    const reason = status === 'failed' && typeof s.reason === 'string' ? s.reason.replace(/\s+/g, ' ').trim() : ''
    steps.push({ text: s.text.trim(), status, ...(reason ? { reason } : {}) })
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
  // MCP calls are counted per tool, as "server › tool", and grouped by server when shown.
  if (server !== undefined) mcp[toolLabel(tool)] = (mcp[toolLabel(tool)] ?? 0) + 1
  else builtIn[tool] = (builtIn[tool] ?? 0) + 1
  return { total: (tally?.total ?? 0) + 1, mcp, builtIn, running: toolLabel(tool) }
}

/** Clears the running tool once it finishes, unless another call has started since. */
export const finishCall = (tally: Tally | undefined, tool: string): Tally | undefined =>
  tally && tally.running === toolLabel(tool) ? { ...tally, running: undefined } : tally

const byCount = (counts: Record<string, number>): [string, number][] =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

/**
 * The tally row's groups: "Built-in 9" and "MCP 3", each with the tools it ran
 * ("Bash 5", "Gmail › search 2"), listed when the group is expanded. A tally
 * counted before tools were named has a count and no tools.
 */
export const tallyGroups = (tally: Tally | undefined) => {
  const total = tally?.total ?? 0
  const mcp = tally?.mcp ?? {}
  const mcpTotal = Object.values(mcp).reduce((n, c) => n + c, 0)
  const builtInTotal = total - mcpTotal
  const groups: { key: TallyKey; label: string; n: number; tools: [string, number][] }[] = []
  if (builtInTotal > 0) groups.push({ key: 'builtIn', label: 'Built-in', n: builtInTotal, tools: byCount(tally?.builtIn ?? {}) })
  if (mcpTotal > 0) groups.push({ key: 'mcp', label: 'MCP', n: mcpTotal, tools: byCount(mcp) })
  return groups
}

// The input field that says what a call did, by tool; any other tool shows its first short string.
const DETAIL_FIELDS: Record<string, string> = {
  Bash: 'command',
  PowerShell: 'command',
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
  Grep: 'pattern',
  Glob: 'pattern',
  WebFetch: 'url',
  WebSearch: 'query',
  Agent: 'description',
  Skill: 'skill',
  ToolSearch: 'query',
}

/** A few words on what a call did: the command, the file, the pattern, the query. */
export const callDetail = (tool: string, input: Record<string, unknown>, max = 70) => {
  const field = DETAIL_FIELDS[tool]
  const value = field
    ? input[field]
    : Object.entries(input).find(([k, v]) => k !== 'tool' && k !== 'tool_use_id' && typeof v === 'string' && v.trim() && v.length <= 200)?.[1]
  const line = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** Where a call belongs: the active step, else the first open one, else the last; before any plan, `early`. */
export const addCall = (list: Checklist, call: Call): Checklist => {
  if (list.steps.length === 0) return { ...list, early: [...(list.early ?? []), call] }
  let at = list.steps.findIndex(s => s.status === 'active')
  if (at < 0) at = list.steps.findIndex(s => !isClosed(s))
  if (at < 0) at = list.steps.length - 1
  return { ...list, steps: list.steps.map((s, i) => (i === at ? { ...s, calls: [...(s.calls ?? []), call] } : s)) }
}

/** Records how the call with `id` ended (failed or not, how long it took, what it returned), wherever it sits. */
export const endCall = (list: Checklist, id: string, end: Pick<Call, 'isError' | 'ms' | 'preview'>): Checklist => {
  const mark = (calls?: Call[]) => calls?.map(c => (c.id === id ? { ...c, ...end } : c))
  return { ...list, early: mark(list.early), steps: list.steps.map(s => (s.calls ? { ...s, calls: mark(s.calls) } : s)) }
}

/** Marks the call with `id` as failed, wherever it sits. */
export const failCall = (list: Checklist, id: string): Checklist => endCall(list, id, { isError: true })

/** The first line of what a call returned, for its peek: the reason it was refused, the text the model read, or a plain string result. */
export const resultPreview = (ran: { text?: unknown; result?: unknown; deny?: unknown }, max = 90) => {
  const raw = typeof ran.deny === 'string' ? ran.deny : typeof ran.text === 'string' ? ran.text : typeof ran.result === 'string' ? ran.result : ''
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  // "Exit code 128" says nothing on its own: show the line that says what went wrong, with the code after it.
  const exit = /^exit code (\d+)$/i.exec(lines[0] ?? '')
  const said = exit ? lines.find(l => !/^exit code \d+$/i.test(l)) : undefined
  const line = exit && said ? `${said} (exit ${exit[1]})` : (lines[0] ?? '')
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** "850ms", "2.4s", "1m 05s". */
export const duration = (ms: number) => (ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : elapsed(ms))

/**
 * A new plan keeps the calls already made: each step takes the calls of the old
 * step with the same text, or else the one in the same place; calls made before
 * the first plan join its first step.
 */
export const carryCalls = (before: Checklist | null, steps: Step[]): Step[] => {
  const old = before?.steps ?? []
  const taken = new Set<number>()
  const out = steps.map(step => {
    const same = old.findIndex((s, i) => !taken.has(i) && s.text === step.text)
    if (same >= 0) {
      taken.add(same)
      return old[same]!.calls ? { ...step, calls: old[same]!.calls } : step
    }
    return step
  })
  const placed = out.map((step, i) => {
    if (step.calls || taken.has(i) || !old[i]?.calls) return step
    taken.add(i)
    return { ...step, calls: old[i]!.calls }
  })
  const early = before?.early ?? []
  if (early.length === 0 || placed.length === 0) return placed
  return placed.map((s, i) => (i === 0 ? { ...s, calls: [...early, ...(s.calls ?? [])] } : s))
}

/** The lines a peek lists: the newest PEEK_MAX calls, and how many older ones are left out. */
export const peekLines = (calls: readonly Call[] | undefined) => {
  const all = calls ?? []
  const shown = all.slice(-PEEK_MAX)
  return { shown, hidden: all.length - shown.length }
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
  if (step.status === 'failed') return 'Failed'
  if (step.status === 'active') return 'Working'
  const firstTodo = steps.findIndex(s => s.status === 'todo')
  return index === firstTodo ? 'Next' : 'Up next'
}

/** The phase a piece of the model's reply puts the activity row in; undefined for a piece that changes nothing. */
export const chunkPhase = (kind: string): Phase | undefined =>
  kind === 'thinking' ? 'thinking' : kind === 'text' ? 'writing' : kind === 'tool' ? 'calling' : undefined

/** The activity row's words: what is happening and for how long. The tool is named, not what it runs. */
export const activityLine = (act: Activity, now: number) => {
  const verb =
    act.phase === 'thinking'
      ? 'Thinking'
      : act.phase === 'writing'
        ? 'Writing'
        : act.phase === 'calling'
          ? `Starting ${act.tool ?? 'a tool'}`
          : act.phase === 'running'
            ? `Running ${act.tool ?? 'a tool'}`
            : act.phase === 'approval'
              ? `Waiting for you to approve ${act.tool ?? 'a tool'}`
              : 'Waiting for the model'
  const agents = act.agents ? ` · ${act.agents} agent${act.agents === 1 ? '' : 's'} working` : ''
  return { verb, took: `${elapsed(now - act.since)}${agents}` }
}

/**
 * A finished checklist in one line: "All 4 done · 2m 13s · 14 tool calls · 1 error", or
 * "3 done · 1 step failed · …" when Claude marked a step failed. A tool error is not a failure.
 */
export const foldedLine = (list: Checklist, timer: string) => {
  const calls = [...(list.early ?? []), ...list.steps.flatMap(s => s.calls ?? [])]
  const errors = calls.filter(c => c.isError).length
  const total = list.tally?.total ?? calls.length
  const failed = list.steps.filter(s => s.status === 'failed').length
  const head = failed > 0 ? `${list.steps.length - failed} done · ${failed} step${failed === 1 ? '' : 's'} failed` : `All ${list.steps.length} done`
  return [
    head,
    timer,
    total > 0 ? `${total} tool call${total === 1 ? '' : 's'}` : '',
    errors > 0 ? `${errors} error${errors === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const SPINNER = ['◐', '◓', '◑', '◒']

// Messages (by id) drawn while a checklist was open stay hidden after it closes.
// A module value: a render hook may not write state, and a reload only shows them again.
const muted = new Set<string>()

// Ids for calls that arrive without a tool_use_id.
let callNo = 0

// The goal a slash command's turn shows: its prompt starts no checklist, its turn does.
let pendingGoal: string | undefined

// The main loop's tool calls still running, oldest first, for the activity row.
const runningCalls = new Map<string, string>()

// Subagents mid-request, by id, each with how many of its requests are open.
const stepping = new Map<string, number>()

/** Puts the activity row in a new phase, keeping the subagent count. */
const setActivity = async ($: EngineInterface, act: Omit<Activity, 'since' | 'agents'>) => {
  const since = await $.clock.now()
  await update($, activity, () => ({ ...act, since, ...(stepping.size > 0 ? { agents: stepping.size } : {}) }))
}

// Redraws the band once a second while a checklist is open or the model is at
// work, for the timers and the working shimmer.
let isTicking = false
async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    while (isInProgress(await read($, checklist)) || (await read($, activity)) !== null) {
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
        'Report your plan and progress to the user as a checklist. Call it at the start of a task, when the plan changes, and once at the end. Send the whole list every time.',
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
                status: {
                  type: 'string',
                  enum: ['done', 'active', 'todo', 'failed'],
                  description: 'failed: only when the result of the step did not happen and you are leaving it, not for a tool call that errored and was retried.',
                },
                reason: { type: 'string', description: 'For a failed step only: what went wrong, a few plain words.' },
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
    if (!goal) return next(e)
    // A slash command's turn (if it starts one) shows the command as its goal.
    pendingGoal = goal.startsWith('/') ? goal : undefined
    if (pendingGoal) return next(e)
    const startedAt = await $.clock.now()
    await update($, checklist, () => ({ goal, steps: [], startedAt }))
    await update($, peek, () => null)
    await update($, openTally, () => [])
    await update($, unfolded, () => false)
    return next({ ...e, context: [...(e.context ?? []), REMINDER] })
  }).catch(($, e, next) => next(e))

  // Every turn shows something. A typed prompt already reset the band; a slash
  // command's turn, or one the session starts itself (a background task ended,
  // a wake-up), gets a fresh band here so it never reads as idle.
  on('turn.start', async ($, e, next) => {
    const goal = pendingGoal ?? (e.text.trim() ? undefined : 'Continuing')
    pendingGoal = undefined
    runningCalls.clear()
    if (goal) {
      const startedAt = await $.clock.now()
      await update($, checklist, () => ({ goal, steps: [], startedAt }))
      await update($, peek, () => null)
      await update($, openTally, () => [])
      await update($, unfolded, () => false)
    }
    await setActivity($, { phase: 'waiting' })
    void tick($).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // Follow each model request as it streams: thinking, writing, starting a tool
  // call. Only a change of phase is written, not every piece. A subagent's
  // requests count it as working instead.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    const agent = e.agentId
    if (agent !== undefined) {
      stepping.set(agent, (stepping.get(agent) ?? 0) + 1)
      const showAgents = () =>
        update($, activity, cur => (cur === null ? cur : { ...cur, agents: stepping.size })).catch(() => {})
      await showAgents()
      try {
        for await (const chunk of stream) yield chunk
        return await stream.result
      } finally {
        const open = (stepping.get(agent) ?? 1) - 1
        if (open > 0) stepping.set(agent, open)
        else stepping.delete(agent)
        await showAgents()
      }
    }
    await setActivity($, { phase: 'waiting' }).catch(() => {})
    void tick($).catch(() => {})
    let last: Phase = 'waiting'
    for await (const chunk of stream) {
      const phase = chunkPhase(chunk.kind)
      if (phase !== undefined && (phase !== last || chunk.kind === 'tool')) {
        last = phase
        const tool = chunk.kind === 'tool' ? { tool: toolLabel(chunk.name) } : {}
        await setActivity($, { phase, ...tool }).catch(() => {})
      }
      yield chunk
    }
    return await stream.result
  })

  // The permission dialog is about to show: the call is waiting on the person,
  // not running. Only observed; the decision is left to the dialog. The engine
  // says nothing when the person answers, so the row stays on it until the call
  // ends or another starts.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.agent_id === undefined) {
      const tool = toolLabel(e.tool_name)
      await setActivity($, { phase: 'approval', tool }).catch(() => {})
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      runningCalls.clear()
      await update($, activity, () => null).catch(() => {})
    }
    return next(e)
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const parsed = parseChecklist(e as unknown as Record<string, unknown>)
    if (typeof parsed === 'string') {
      return { result: `Checklist not updated: ${parsed}`, isError: true }
    }
    const now = await $.clock.now()
    const before = await read($, checklist)
    const startedAt = before?.startedAt ?? now
    const next: Checklist = { ...parsed, startedAt, ...(isInProgress(parsed) ? {} : { finishedAt: now }) }
    // Keep the tally and the calls so far; a concurrent count may land meanwhile, so read them inside the update.
    await update($, checklist, cur => ({ ...next, steps: carryCalls(cur, next.steps), ...(cur?.tally ? { tally: cur.tally } : {}) }))
    if (isInProgress(next)) void tick($).catch(() => {})
    return { result: 'Checklist updated.' }
  })

  // Tally every other tool call (built-in, MCP, subagents') since the prompt,
  // naming the one running until it finishes, and file it under the open step for a peek.
  on('tool.call', async ($, e, next) => {
    if (e.tool === TOOL_ID) return next(e)
    const call: Call = {
      id: e.tool_use_id ?? `call-${++callNo}`,
      tool: toolLabel(e.tool),
      detail: callDetail(e.tool, e as unknown as Record<string, unknown>),
    }
    await update($, checklist, cur => (cur === null ? cur : { ...addCall(cur, call), tally: countCall(cur.tally, e.tool) })).catch(() => {})
    // The main loop's call shows on the activity row while it runs; a subagent's does not.
    const isMain = e.agentId === undefined
    if (isMain) {
      runningCalls.set(call.id, call.tool)
      await setActivity($, { phase: 'running', tool: call.tool }).catch(() => {})
    }
    const startedAt = await $.clock.now()
    let end: Pick<Call, 'isError' | 'ms' | 'preview'> = { isError: true }
    try {
      const ran = await next(e)
      end = { isError: ran.deny !== undefined || ran.isError === true, preview: resultPreview(ran as never) }
      return ran
    } finally {
      const ms = (await $.clock.now().catch(() => startedAt)) - startedAt
      await update($, checklist, cur =>
        cur === null ? cur : { ...endCall(cur, call.id, { ...end, ms }), tally: finishCall(cur.tally, e.tool) },
      ).catch(() => {})
      // Back to the newest call still running, else waiting for the model to read the results.
      if (isMain && runningCalls.delete(call.id)) {
        const still = [...runningCalls.values()].at(-1)
        await setActivity($, still ? { phase: 'running', tool: still } : { phase: 'waiting' }).catch(() => {})
      }
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
    const act = e.props.isWorking ? await read($, activity) : null
    const saved = await read($, checklist)
    if (e.props.hasSurvey || (saved === null && act === null)) return below
    // Work with no checklist behind it still gets a band, for the activity row.
    const list: Checklist = saved ?? { goal: 'Working', steps: [] }

    const { Box, Text, Button } = $.ui.resolve(e)
    const peeked = await read($, peek)
    const opened = await read($, openTally)
    const groups = tallyGroups(list.tally)
    const now = await $.clock.now()
    const { done, total, percent, failed: failedSteps } = progress(list)
    const isFinished = total > 0 && done === total
    const timer = list.startedAt === undefined ? '' : elapsed((list.finishedAt ?? now) - list.startedAt)
    const tickNo = Math.floor(now / 1000)

    // Inside the frame: two border cells and two of padding.
    const inner = Math.max(30, e.props.bodyColumns - 4)
    const label = total === 0 ? (e.props.isWorking ? 'Planning…' : 'No plan yet') : isFinished ? (failedSteps > 0 ? `${failedSteps} step${failedSteps === 1 ? '' : 's'} failed` : `All ${total} done`) : `Step ${Math.min(done + 1, total)} of ${total}`
    const labelW = 16
    const pctText = `${percent}%`
    const barW = Math.max(8, inner - labelW - pctText.length - 1)
    const filled = total === 0 ? 0 : Math.round((done / total) * barW)

    // What the model is doing right now, while a turn is going: its own row, under the bar.
    const line = act === null ? null : activityLine(act, now)
    const phaseColor =
      act?.phase === 'thinking'
        ? VIOLET_TO
        : act?.phase === 'writing'
          ? PINK
          : act?.phase === 'approval'
            ? ORANGE
            : act?.phase === 'waiting'
              ? undefined
              : BLUE
    const activityRow = line ? (
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color={act?.phase === 'approval' ? ORANGE : VIOLET_TO}>{act?.phase === 'approval' ? '⏸ ' : `${SPINNER[tickNo % SPINNER.length]} `}</Text>
          <Text bold color={phaseColor} dimColor={phaseColor === undefined}>
            {line.verb}
          </Text>
        </Text>
        <Text dimColor>{line.took}</Text>
      </Box>
    ) : null

    // A finished checklist folds to one line; pressed, it opens out in full.
    const isOpen = await read($, unfolded)
    if (isFinished && !isOpen) {
      const summary = `${foldedLine(list, timer)} ▸`
      return (
        <Box flexDirection="column">
          <Box flexDirection="column" borderStyle="round" borderColor={FRAME} paddingX={1}>
            <Box key="folded" flexDirection="row">
              <Text color={failedSteps > 0 ? PINK : GREEN_TO}>{failedSteps > 0 ? '✗ ' : '✓ '}</Text>
              <Button key="unfold" plain label={summary} hover={{ bold: true }} onPress={() => update($, unfolded, () => true)} />
              <Text dimColor>{fit(`  ${list.goal}`, Math.max(0, inner - 2 - summary.length)).trimEnd()}</Text>
            </Box>
            {/* What failed stays in view while folded: each failed step and why. */}
            {list.steps
              .filter(s => s.status === 'failed')
              .slice(0, 3)
              .map((s, i) => (
                <Text key={`failed-${i}`} color={PINK}>
                  {`  ✗ ${fit(s.reason ? `${s.text}: ${s.reason}` : s.text, Math.max(0, inner - 4)).trimEnd()}`}
                </Text>
              ))}
            {activityRow}
          </Box>
          {below}
        </Box>
      )
    }

    const textW = Math.max(16, Math.min(44, Math.floor(inner * 0.4)))
    const miniW = 12
    const statusW = 9
    const countW = 5

    // Goal words shade orange to pink to blue, as in the reference.
    const words = list.goal.split(/(\s+)/)
    const goalW = inner - timer.length - 3
    let used = 0

    const cells = (count: number, color: (i: number) => string, char = '█') =>
      Array.from({ length: count }, (_, i) => <Text color={color(i)}>{char}</Text>)

    const mini = (step: Step, index: number) => {
      if (step.status === 'done') return cells(miniW, i => mix(GREEN_FROM, GREEN_TO, i / (miniW - 1)))
      if (step.status === 'failed') return cells(miniW, () => PINK, '░')
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
            {isFinished ? (
              // Opened out, the finished label folds it back to one line.
              <Box key="fold-label" flexDirection="row">
                <Text color={failedSteps > 0 ? PINK : GREEN_TO}>▾ </Text>
                <Button key="fold" plain label={fit(label, labelW - 2)} hover={{ bold: true }} onPress={() => update($, unfolded, () => false)} />
              </Box>
            ) : (
              <Text dimColor={total === 0}>{fit(label, labelW)}</Text>
            )}
            <Text>
              {cells(filled, i => mix(ORANGE, PINK, filled <= 1 ? 1 : i / (filled - 1)))}
              <Text color={TRACK}>{'█'.repeat(barW - filled)}</Text>
            </Text>
            <Text> </Text>
            <Text bold color={isFinished && failedSteps === 0 ? GREEN_TO : PINK}>
              {pctText}
            </Text>
          </Box>

          {activityRow}

          {list.tally && list.tally.total > 0 ? (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexDirection="row">
                  <Text dimColor>
                    <Text color={BLUE}>⚙ </Text>
                    {`${list.tally.total} tool call${list.tally.total === 1 ? '' : 's'}`}
                  </Text>
                  {groups.map(g => {
                    const isOpen = opened.includes(g.key)
                    const label = `${g.label}: ${g.n}`
                    return (
                      <Box key={`tally-${g.key}-head`} flexDirection="row">
                        <Text dimColor> · </Text>
                        {g.tools.length > 0 ? (
                          // A group that knows its tools is a button: press it to list them.
                          <Button
                            key={`tally-${g.key}`}
                            plain
                            label={`${isOpen ? '▾' : '▸'} ${label}`}
                            dimColor={!isOpen}
                            hover={{ bold: true }}
                            onPress={() => update($, openTally, v => (v.includes(g.key) ? v.filter(k => k !== g.key) : [...v, g.key]))}
                          />
                        ) : (
                          <Text dimColor>{label}</Text>
                        )}
                      </Box>
                    )
                  })}
                </Box>
              </Box>
              {groups
                .filter(g => opened.includes(g.key) && g.tools.length > 0)
                .map(g => (
                  <Box key={`tally-${g.key}-tools`} flexDirection="column" marginLeft={2}>
                    {g.tools.map(([tool, n]) => (
                      <Text key={`tally-${g.key}-${tool}`}>
                        <Text color={BLUE}>› </Text>
                        {fit(tool, Math.max(0, inner - 10)).trimEnd()}
                        <Text dimColor>{` ${n}`}</Text>
                      </Text>
                    ))}
                  </Box>
                ))}
            </Box>
          ) : null}

          {list.steps.map((step, i) => {
            const word = statusWord(list.steps, i)
            const isActive = step.status === 'active'
            const calls = step.calls ?? []
            const isFailed = step.status === 'failed'
            const isPeeked = peeked === i && calls.length > 0
            const { shown, hidden } = peekLines(calls)
            return (
              <Box key={`step-${i}`} flexDirection="column">
                <Box flexDirection="row">
                  {/* Pink ✗ only for a step Claude marked failed; a tool error alone keeps its bullet. */}
                  <Text color={isFailed ? PINK : step.status === 'done' ? GREEN_TO : isActive ? PINK : undefined} dimColor={step.status === 'todo'}>
                    {isFailed ? '✗ ' : step.status === 'done' ? '✓ ' : isActive ? '● ' : '○ '}
                  </Text>
                  {calls.length > 0 ? (
                    // A step with calls is a button: press it to peek at them.
                    <Button
                      key={`peek-${i}`}
                      plain
                      label={fit(step.text, textW)}
                      dimColor={!isActive}
                      hover={{ bold: true }}
                      onPress={() => update($, peek, v => (v === i ? null : i))}
                    />
                  ) : (
                    <Text bold={isActive} dimColor={!isActive}>
                      {fit(step.text, textW)}
                    </Text>
                  )}
                  <Text> </Text>
                  <Text>{mini(step, i)}</Text>
                  <Text>  </Text>
                  <Text bold={isActive} color={isActive || isFailed ? PINK : undefined} dimColor={!isActive && !isFailed}>
                    {fit(word, statusW)}
                  </Text>
                  <Text dimColor>
                    {fit(calls.length > 0 ? `${isPeeked ? '▾' : '▸'}${calls.length}` : '', countW)}
                  </Text>
                </Box>
                {/* Why it failed, in Claude's words, always in view under the step. */}
                {isFailed && step.reason ? (
                  <Text key={`reason-${i}`} color={PINK}>
                    {`    ↳ ${fit(step.reason, Math.max(0, inner - 6)).trimEnd()}`}
                  </Text>
                ) : null}
                {isPeeked ? (
                  <Box key={`calls-${i}`} flexDirection="column" marginLeft={4}>
                    {hidden > 0 ? <Text dimColor>{`… ${hidden} earlier`}</Text> : null}
                    {shown.map(c => {
                      const took = c.ms === undefined ? '…' : duration(c.ms)
                      return (
                        <Box key={c.id} flexDirection="column">
                          <Box flexDirection="row" justifyContent="space-between">
                            <Text>
                              <Text color={c.isError ? ORANGE : BLUE}>{c.isError ? '! ' : '› '}</Text>
                              <Text color={c.isError ? ORANGE : undefined}>{c.tool}</Text>
                              <Text dimColor>{fit(c.detail ? `  ${c.detail}` : '', Math.max(0, inner - 8 - c.tool.length - took.length)).trimEnd()}</Text>
                            </Text>
                            <Text dimColor>{took}</Text>
                          </Box>
                          {c.preview ? (
                            <Text color={c.isError ? ORANGE : undefined} dimColor={!c.isError}>
                              {`    ↳ ${fit(c.preview, Math.max(0, inner - 10)).trimEnd()}`}
                            </Text>
                          ) : null}
                        </Box>
                      )
                    })}
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Box>
        {below}
      </Box>
    )
  })
}
