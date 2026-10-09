import { expect, test } from 'claude-code/testing'

import type { StepSet } from '../types'
import { addSet, answerText, applyTyped, clearSet, markAnswered, countText, findQuestions, findActions, doLevel, doRows, isDecided, isOpen, parseSet, pick, REMINDER, withReminder, startTyping, toggleAction } from './register'

const parsed = (input: Record<string, unknown>) => {
  const set = parseSet(input, '1', 1_000)
  if (typeof set === 'string') throw new Error(set)
  return set
}

test('parses decisions and actions, decisions first', () => {
  const set = parsed({
    title: 'Deploy',
    actions: [{ text: 'Sign in to Azure', why: 'So the script can reach Azure', command: 'Connect-AzAccount' }, { text: 'Check the output', why: 'Confirms it worked', detail: ' Shows 3 rows ', command: '  ' }],
    decisions: [{ question: 'Which region?', detail: 'Closest to users', options: ['eastus', ' ', 'westeurope'] }],
  })
  expect(set.items[0]).toEqual({ kind: 'decide', text: 'Which region?', detail: 'Closest to users', options: ['eastus', 'westeurope'] })
  expect(set.items[1]).toEqual({ kind: 'do', text: 'Sign in to Azure', why: 'So the script can reach Azure', command: 'Connect-AzAccount', isDone: false })
  expect(set.items[2]).toEqual({ kind: 'do', text: 'Check the output', why: 'Confirms it worked', detail: 'Shows 3 rows', isDone: false })
})

test('takes the older `steps` as actions; rejects empty or broken sets', () => {
  expect(parsed({ title: 't', steps: [{ text: 'a' }] }).items[0]?.kind).toBe('do')
  expect(parseSet({ actions: [{ text: 'a' }] }, '1', 0)).toContain('title')
  expect(parseSet({ title: 't' }, '1', 0)).toContain('at least one')
  expect(parseSet({ title: 't', actions: [{ command: 'x' }] }, '1', 0)).toContain('text')
  // A new action has to say what it is for.
  expect(parseSet({ title: 't', actions: [{ text: 'Look over the code' }] }, '1', 0)).toContain('needs a `why`')
  expect(parseSet({ title: 't', decisions: [{ options: ['a'] }] }, '1', 0)).toContain('question')
})

test('a set stays open until every decision is answered and every action done', () => {
  let list: StepSet[] = [parsed({ title: 'T', decisions: [{ question: 'A or B?', options: ['A', 'B'] }], actions: [{ text: 'Run it', why: 'Applies it' }] })]
  expect(countText(list[0]!)).toBe('1 to decide · 1 to do')
  list = pick(list, '1', 0, 'B')
  expect(isDecided(list[0]!)).toBe(true)
  expect(answerText(list[0]!)).toBe('T:\n- A or B? → B')
  list = toggleAction(list, '1', 1)
  expect(isOpen(list[0]!)).toBe(false)
  expect(countText(list[0]!)).toBe('All done')
})

test('a typed answer is left out of the clicked answers', () => {
  let list: StepSet[] = [parsed({ title: 'T', decisions: [{ question: 'Q1?', options: ['x'] }, { question: 'Q2?' }] })]
  list = pick(list, '1', 0, 'x')
  expect(isDecided(list[0]!)).toBe(false)
  list = startTyping(list, '1', 1)
  expect(isDecided(list[0]!)).toBe(true)
  expect(answerText(list[0]!)).toBe('T:\n- Q1? → x')
})

test('keeps the newest first and replaces a same-titled set', () => {
  const mk = (id: string, title: string): StepSet => ({ id, title, at: 0, items: [{ kind: 'do', text: 'a', isDone: false }] })
  let list = addSet([], mk('1', 'A'))
  list = addSet(list, mk('2', 'B'))
  list = addSet(list, mk('3', 'A'))
  expect(list.map(s => s.id)).toEqual(['3', '2'])
})

test('finds the questions a reply ends on, and only then', () => {
  expect(findQuestions('Done.\n\nWhich one do you want to start with?')).toEqual(['Which one do you want to start with?'])
  expect(findQuestions('I built it. Should I ship v1.2? Or wait for tests?')).toEqual(['Should I ship v1.2?', 'Or wait for tests?'])
  expect(findQuestions('Two things:\n- **Keep** the old API?\n- Rename `foo`?')).toEqual(['Keep the old API?', 'Rename foo?'])
  expect(findQuestions('Is it ok? I went ahead anyway.')).toEqual([])
  expect(findQuestions('All done.\n\n```\nwhy?\n```')).toEqual([])
  expect(findQuestions('')).toEqual([])
})

test('takes the steps a reply leaves the user from its shape, not its words', () => {
  const texts = (s: string) => findActions(s).map(a => [a.text, a.command])
  // Numbered steps, whatever the verb; a shell block straight under an item is its command.
  expect(texts('1. Go to Settings\n2. Drag **Apps** to the top\n3. Restart:\n\n```powershell\nRestart-Computer\n```')).toEqual([
    ['Go to Settings', undefined],
    ['Drag Apps to the top', undefined],
    ['Restart:', 'Restart-Computer'],
  ])
  // A shell block after prose stands as its own action.
  expect(texts('1. Right-click **Open-Google.ps1**.\n\nIf it closes, run this once:\n\n```powershell\nSet-ExecutionPolicy RemoteSigned\n```')).toEqual([
    ['Right-click Open-Google.ps1.', undefined],
    ['Run this command', 'Set-ExecutionPolicy RemoteSigned'],
  ])
  // Reports, labelled points, code to read and inline names are not steps.
  expect(findActions('1. Read the config\n2. Fixed the bug')).toEqual([])
  expect(findActions('1. **Validate:** ran on each mod\n2. **Tests:** all pass')).toEqual([])
  expect(findActions('Here it is:\n\n```ts\nconst x = 1\n```')).toEqual([])
  // Questions (the question check has them), bold-titled options, statements and unlabelled data.
  expect(findActions('Two things:\n\n1. Which region?\n2. Keep the old name?')).toEqual([])
  expect(findActions('1. **Shape check (free).** Reads the shape.\n2. **Haiku check.** Small cost.')).toEqual([])
  expect(findActions('1. The engine loads the module\n2. Each hook runs in order')).toEqual([])
  expect(findActions('Config:\n\n```\n{ "a": 1 }\n```')).toEqual([])
  // An unlabelled block that reads as a command still counts.
  expect(texts('Then:\n\n```\naz login\n```')).toEqual([['Run this command', 'az login']])
  expect(findActions('The fix is in `register.tsx:689`.')).toEqual([])
  expect(findActions('')).toEqual([])
})

test('the tool call saves the set and answers the model', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  const ran = await $.tool.call({
    tool: 'mcp__action-items__action_items',
    title: 'Contributor script',
    decisions: [{ question: 'All subscriptions?', options: ['Yes', 'No'] }],
    actions: [{ text: 'Run it', why: 'Assigns the role', command: '.\\Assign-ContributorAllSubscriptions.ps1 -WhatIf' }],
  } as never)
  expect(ran.deny).toBeUndefined()
  expect(String(ran.result)).toContain('1 to decide · 1 to do')
  expect(String(ran.result)).toContain('come back to you')
})

test('reminder names the tool and how to load it', () => {
  expect(REMINDER).toContain('select:mcp__action-items__action_items')
  expect(REMINDER).toContain('decisions or actions')
})

test('why and how-to count only when opened; the Do tab then shrinks by its commands', () => {
  const as = parsed({ title: 'T', actions: [1, 2, 3].map(n => ({ text: `A${n}`, why: 'w', detail: 'd', command: 'c' })) }).items as never[]
  const closed = () => false
  // Every info opened: chrome 5; each action 4 rows; 2 blank lines between.
  expect(doRows(as, 100, 0)).toBe(19)
  // Info closed: each action is its task and command, 2 rows.
  expect(doRows(as, 100, 0, closed)).toBe(13)
  expect(doRows(as, 100, 1, closed)).toBe(11)
  // The command on the next one only: 5 + 2 + 1 + 1.
  expect(doRows(as, 100, 3, closed)).toBe(9)
  expect(doLevel(as, 100, 13, closed)).toBe(0)
  expect(doLevel(as, 100, 12, closed)).toBe(1)
  expect(doLevel(as, 100, 8, closed)).toBe(3)
})

test('a typed Other… answer counts; a blank one reopens the question', () => {
  let list: StepSet[] = [parsed({ title: 'T', decisions: [{ question: 'Q1?', options: ['x'] }, { question: 'Q2?' }] })]
  list = pick(list, '1', 0, 'x')
  list = startTyping(list, '1', 1)
  const blank = applyTyped(list[0]!, 'T:\n- Q1? → x\n- Q2? → ')
  expect(blank.isSent).toBeUndefined()
  expect(isOpen(blank)).toBe(true)
  const typed = applyTyped(list[0]!, 'T:\n- Q1? → x\n- Q2? → call it Lens')
  expect(typed.isSent).toBe(true)
  expect(answerText(typed)).toBe('T:\n- Q1? → x\n- Q2? → call it Lens')
})

test('answered clears questions by their number in the box', () => {
  const set = parsed({ title: 'T', decisions: [{ question: 'A?' }, { question: 'B?' }], actions: [{ text: 'Do', why: 'w' }] })
  const one = markAnswered(set, [2])
  expect(countText(one)).toBe('1 to decide · 1 to do')
  expect(markAnswered(one, [1]).isSent).toBe(true)
})

test('clearSet drops one set by id, open or not', () => {
  const a: StepSet = { id: 'a', title: 'A', items: [{ kind: 'do', text: 'x', isDone: false }], at: 1 }
  const b: StepSet = { id: 'b', title: 'B', items: [{ kind: 'do', text: 'y', isDone: true }], at: 2 }
  expect(clearSet([b, a], 'a')).toEqual([b])
  expect(clearSet([b, a], 'b')).toEqual([a])
  expect(clearSet([a], 'missing')).toEqual([a])
})

test('the reminder goes along only until a system prompt carries the instructions', () => {
  expect(withReminder(['x'], false)).toEqual(['x', REMINDER])
  expect(withReminder(['x'], true)).toEqual(['x'])
  expect(withReminder([], true)).toEqual([])
})
