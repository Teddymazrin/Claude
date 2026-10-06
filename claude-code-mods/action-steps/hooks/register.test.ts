import { expect, test } from 'claude-code/testing'

import { addSet, ago, doneCount, parseSet, REMINDER, toggleStep } from './register'

test('parses a set of next steps', () => {
  const set = parseSet(
    {
      title: 'Reader role script',
      steps: [{ text: 'Sign in to Azure', command: 'Connect-AzAccount' }, { text: 'Check the output', command: '  ' }],
    },
    '1',
    1_000,
  )
  expect(typeof set).toBe('object')
  if (typeof set === 'string') return
  expect(set.steps[0]).toEqual({ text: 'Sign in to Azure', command: 'Connect-AzAccount', isDone: false })
  expect(set.steps[1]?.command).toBeUndefined()
})

test('rejects a set without a title or steps', () => {
  expect(parseSet({ steps: [{ text: 'a' }] }, '1', 0)).toContain('title')
  expect(parseSet({ title: 't', steps: [] }, '1', 0)).toContain('steps')
  expect(parseSet({ title: 't', steps: [{ command: 'x' }] }, '1', 0)).toContain('text')
})

test('keeps the newest first, replaces a same-titled set, ticks steps', () => {
  const mk = (id: string, title: string) => ({ id, title, at: 0, steps: [{ text: 'a', isDone: false }, { text: 'b', isDone: false }] })
  let list = addSet([], mk('1', 'A'))
  list = addSet(list, mk('2', 'B'))
  list = addSet(list, mk('3', 'A'))
  expect(list.map(s => s.id)).toEqual(['3', '2'])
  list = toggleStep(list, '3', 1)
  expect(doneCount(list[0]!)).toBe(1)
  expect(doneCount(list[1]!)).toBe(0)
})

test('the tool call saves the steps and answers the model', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  const ran = await $.tool.call({
    tool: 'mcp__action-steps__action_steps',
    title: 'Contributor script',
    steps: [{ text: 'Run it', command: '.\\Assign-ContributorAllSubscriptions.ps1 -WhatIf' }],
  } as never)
  expect(ran.deny).toBeUndefined()
  // No surface places panes here, so the steps fall back to the box above the prompt.
  expect(String(ran.result)).toContain('Action Steps box above the prompt')
})

test('reminder names the tool and how to load it; ages read short', () => {
  expect(REMINDER).toContain('select:mcp__action-steps__action_steps')
  expect(ago(30_000)).toBe('just now')
  expect(ago(5 * 60_000)).toBe('5m ago')
  expect(ago(3 * 3_600_000)).toBe('3h ago')
})
