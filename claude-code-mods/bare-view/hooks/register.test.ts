import { expect, test } from 'claude-code/testing'

import { bar, countCall, elapsed, fit, isInProgress, mcpServer, mix, parseChecklist, progress, REMINDER, statusWord, tallyLine } from './register'

test('tallies tool calls and groups MCP ones by server', () => {
  expect(mcpServer('Bash')).toBeUndefined()
  expect(mcpServer('mcp__claude_ai_Gmail__search')).toBe('Gmail')
  expect(mcpServer('mcp__plugin_microsoft-docs_microsoft-learn__microsoft_docs_search')).toBe('microsoft-learn')
  let t = countCall(undefined, 'Bash')
  t = countCall(t, 'mcp__claude_ai_Gmail__search')
  t = countCall(t, 'mcp__claude_ai_Gmail__read')
  t = countCall(t, 'mcp__ide__getDiagnostics')
  expect(t).toEqual({ total: 4, mcp: { Gmail: 2, ide: 1 } })
  expect(tallyLine(t)).toBe('4 tool calls · 1 built-in · 3 MCP (Gmail 2, ide 1)')
  expect(tallyLine({ total: 3, mcp: { 'microsoft-learn': 1 } })).toBe('3 tool calls · 2 built-in · 1 MCP (microsoft-learn 1)')
  expect(tallyLine({ total: 2, mcp: { Gmail: 2 } })).toBe('2 tool calls · 2 MCP (Gmail 2)')
  expect(tallyLine({ total: 1, mcp: {} })).toBe('1 tool call')
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
