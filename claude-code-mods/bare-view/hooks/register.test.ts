import { expect, test } from 'claude-code/testing'

import { PEEK_MAX, addCall, bar, callDetail, carryCalls, countCall, elapsed, failCall, peekLines, finishCall, fit, isInProgress, mcpServer, mix, parseChecklist, progress, REMINDER, statusWord, tallyLine, toolLabel } from './register'

test('tallies every tool by name, MCP ones by server, and the one running', () => {
  expect(mcpServer('Bash')).toBeUndefined()
  expect(mcpServer('mcp__claude_ai_Gmail__search')).toBe('Gmail')
  expect(mcpServer('mcp__plugin_microsoft-docs_microsoft-learn__microsoft_docs_search')).toBe('microsoft-learn')
  expect(toolLabel('Bash')).toBe('Bash')
  expect(toolLabel('mcp__plugin_microsoft-docs_microsoft-learn__microsoft_docs_search')).toBe('microsoft-learn › microsoft_docs_search')
  let t = countCall(undefined, 'Bash')
  t = countCall(t, 'Read')
  t = countCall(t, 'Bash')
  t = countCall(t, 'mcp__claude_ai_Gmail__search')
  t = countCall(t, 'mcp__claude_ai_Gmail__read')
  t = countCall(t, 'mcp__ide__getDiagnostics')
  expect(t).toEqual({ total: 6, mcp: { Gmail: 2, ide: 1 }, builtIn: { Bash: 2, Read: 1 }, running: 'ide › getDiagnostics' })
  expect(tallyLine(t)).toBe('6 tool calls · Built-in 3: Bash 2, Read 1 · MCP 3: Gmail 2, ide 1')
  // The running tool clears when it finishes, but not when an earlier call finishes after a newer one started.
  expect(finishCall(t, 'Bash')?.running).toBe('ide › getDiagnostics')
  expect(finishCall(t, 'mcp__ide__getDiagnostics')?.running).toBeUndefined()
  expect(tallyLine({ total: 2, mcp: {}, builtIn: { ToolSearch: 1, Bash: 1 } })).toBe('2 tool calls · Built-in 2: Bash 1, ToolSearch 1')
  expect(tallyLine({ total: 2, mcp: { Gmail: 2 } })).toBe('2 tool calls · MCP 2: Gmail 2')
  // A tally saved before tools were named still reads.
  expect(tallyLine({ total: 3, mcp: { 'microsoft-learn': 1 } })).toBe('3 tool calls · 2 built-in · MCP 1: microsoft-learn 1')
})

test('parses and scores a checklist', () => {
  const list = parseChecklist({
    goal: 'Write the script',
    steps: [
      { text: 'Look up syntax', status: 'done' },
      { text: 'Write the file', status: 'active' },
      { text: 'Check it parses', status: 'bogus' },
    ],
  })
  expect(typeof list).toBe('object')
  if (typeof list === 'string') return
  expect(list.steps[2]?.status).toBe('todo')
  expect(progress(list)).toEqual({ done: 1, total: 3, percent: 33 })
  expect(bar(1, 3, 6)).toBe('██░░░░')
  expect(bar(0, 0, 4)).toBe('░░░░')
})

test('rejects a checklist without a goal or steps', () => {
  expect(parseChecklist({ steps: [] })).toContain('goal')
  expect(parseChecklist({ goal: 'x' })).toContain('steps')
  expect(parseChecklist({ goal: 'x', steps: [{ status: 'done' }] })).toContain('text')
})

test('the tool call updates the checklist and answers the model', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 1_000 }))

  const ran = await $.tool.call({
    tool: 'mcp__bare-view__checklist',
    goal: 'Build the mod',
    steps: [
      { text: 'Read the API', status: 'done' },
      { text: 'Write the hooks', status: 'active' },
    ],
  } as never)

  expect(ran.deny).toBeUndefined()
  expect(ran.result).toBe('Checklist updated.')
  expect(statuses.filter(t => t !== undefined)).toEqual([])
})

test('the per-prompt reminder names the tool and how to load it', () => {
  expect(REMINDER).toContain('mcp__bare-view__checklist')
  expect(REMINDER).toContain('select:mcp__bare-view__checklist')
})

test('reads each step as Done, Working, Next or Up next', () => {
  const steps = [
    { text: 'a', status: 'done' as const },
    { text: 'b', status: 'active' as const },
    { text: 'c', status: 'todo' as const },
    { text: 'd', status: 'todo' as const },
  ]
  expect(steps.map((_, i) => statusWord(steps, i))).toEqual(['Done', 'Working', 'Next', 'Up next'])
})

test('a checklist is in progress until every step is done', () => {
  expect(isInProgress(null)).toBe(false)
  expect(isInProgress({ goal: 'g', steps: [] })).toBe(false)
  expect(isInProgress({ goal: 'g', steps: [{ text: 'a', status: 'active' }] })).toBe(true)
  expect(isInProgress({ goal: 'g', steps: [{ text: 'a', status: 'done' }] })).toBe(false)
})

test('formats the timer, fits text and blends colours', () => {
  expect(elapsed(9_400)).toBe('9s')
  expect(elapsed(75_000)).toBe('1m 15s')
  expect(fit('Publish it', 12)).toBe('Publish it  ')
  expect(fit('Check how the page gets live weather', 10)).toBe('Check how…')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(mix('#ff9a4d', '#ff4f8b', 0)).toBe('#ff9a4d')
})

test('describes a call by its command, file or query', () => {
  expect(callDetail('Bash', { command: 'git   status\n--short' })).toBe('git status --short')
  expect(callDetail('Read', { file_path: '/repo/README.md' })).toBe('/repo/README.md')
  expect(callDetail('WebSearch', { query: 'rbac roles' })).toBe('rbac roles')
  expect(callDetail('mcp__x__find', { tool: 'mcp__x__find', name: 'teddy' })).toBe('teddy')
  expect(callDetail('Bash', { command: 'x'.repeat(100) }).length).toBe(70)
})

test('files each call under the step that is open', () => {
  const call = (id: string) => ({ id, tool: 'Bash', detail: id })
  let list = addCall({ goal: 'g', steps: [] }, call('early'))
  expect(list.early?.map(c => c.id)).toEqual(['early'])
  list = { ...list, steps: carryCalls(list, [{ text: 'A', status: 'active' }, { text: 'B', status: 'todo' }]) }
  expect(list.steps[0]?.calls?.map(c => c.id)).toEqual(['early'])
  list = addCall(list, call('a1'))
  list = { ...list, steps: [{ ...list.steps[0]!, status: 'done' }, { ...list.steps[1]!, status: 'active' }] }
  list = addCall(list, call('b1'))
  expect(list.steps[0]?.calls?.map(c => c.id)).toEqual(['early', 'a1'])
  expect(list.steps[1]?.calls?.map(c => c.id)).toEqual(['b1'])
  list = failCall(list, 'b1')
  expect(list.steps[1]?.calls?.[0]?.isError).toBe(true)
})

test('a new plan keeps calls by step text, then by place', () => {
  const calls = [{ id: '1', tool: 'Read', detail: 'x' }]
  const before = { goal: 'g', steps: [{ text: 'Read files', status: 'done' as const, calls }, { text: 'Edit', status: 'active' as const }] }
  const moved = carryCalls(before, [{ text: 'Plan', status: 'done' }, { text: 'Read files', status: 'done' }, { text: 'Edit', status: 'active' }])
  expect(moved[1]?.calls).toEqual(calls)
  expect(moved[0]?.calls).toBeUndefined()
  const reworded = carryCalls(before, [{ text: 'Read the files', status: 'done' }, { text: 'Edit', status: 'active' }])
  expect(reworded[0]?.calls).toEqual(calls)
})

test('a peek lists the newest calls and counts the rest', () => {
  const calls = Array.from({ length: PEEK_MAX + 3 }, (_, i) => ({ id: String(i), tool: 'Bash', detail: String(i) }))
  const { shown, hidden } = peekLines(calls)
  expect(shown.length).toBe(PEEK_MAX)
  expect(hidden).toBe(3)
  expect(shown[0]?.id).toBe('3')
})
