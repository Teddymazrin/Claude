import { expect, test } from 'claude-code/testing'

import type { StepSet } from '../types'
import { addSet, markAllDone, boxNote, dropItem, flatten, steProblems, steWords, commandPreview, staleKeys, storeKey, answerText, applyTyped, clearSet, markAnswered, countText, doLevel, doRows, isDecided, isOpen, parseSet, pick, REMINDER, withReminder, startTyping, toggleAction } from './register'

const parsed = (input: Record<string, unknown>) => {
  const set = parseSet(input, '1', 1_000)
  if (typeof set === 'string') throw new Error(set)
  return set
}

test('parses decisions and actions, decisions first', () => {
  const set = parsed({
    title: 'Deploy',
    actions: [{ text: 'Sign in to Azure', why: 'So the script can reach Azure', command: 'Connect-AzAccount' }, { text: 'Make sure that the output is correct', why: 'Shows that it worked', detail: ' Shows 3 rows ', command: '  ' }],
    decisions: [{ question: 'Which region?', detail: 'Closest to users', options: ['eastus', ' ', 'westeurope'] }],
  })
  expect(set.items[0]).toEqual({ kind: 'decide', text: 'Which region?', detail: 'Closest to users', options: ['eastus', 'westeurope'] })
  expect(set.items[1]).toEqual({ kind: 'do', text: 'Sign in to Azure', why: 'So the script can reach Azure', command: 'Connect-AzAccount', isDone: false })
  expect(set.items[2]).toEqual({ kind: 'do', text: 'Make sure that the output is correct', why: 'Shows that it worked', detail: 'Shows 3 rows', isDone: false })
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

test('one list: new asks on top, unfinished ones carried under Earlier, finished ones dropped', () => {
  let list: StepSet[] = [parsed({ title: 'Old', decisions: [{ question: 'Region?' }, { question: 'Name?' }], actions: [{ text: 'Sign in', why: 'w' }, { text: 'Old step', why: 'w' }, { text: 'Done step', why: 'w' }] })]
  list = toggleAction(list, '1', 4)
  list = pick(list, '1', 1, 'Lens')
  const next = parseSet({ title: 'New', actions: [{ text: 'Sign in', why: 'w' }, { text: 'Run the new script', why: 'w2' }] }, '2', 2_000)
  if (typeof next === 'string') throw new Error(next)
  list = addSet(list, next)
  expect(list.length).toBe(1)
  expect(list[0]!.title).toBe('New')
  // Decisions first; in each kind, the new asks before what is carried over.
  expect(list[0]!.items.map(i => `${i.text}${i.isEarlier ? ' (earlier)' : ''}`)).toEqual(['Region? (earlier)', 'Sign in', 'Run the new script', 'Old step (earlier)'])
  expect(countText(list[0]!)).toBe('1 to decide · 3 to do')
  // A carried ask can be dropped on its own.
  const dropped = dropItem(list, '2', 3)
  expect(dropped[0]!.items.map(i => i.text)).toEqual(['Region?', 'Sign in', 'Run the new script'])
})

test('a box saved with stacked sets loads as one list', () => {
  const a = parsed({ title: 'A', actions: [{ text: 'x', why: 'w' }] })
  const b: StepSet = { ...parsed({ title: 'B', actions: [{ text: 'y', why: 'w' }] }), id: '2' }
  const one = flatten([b, a])
  expect(one.length).toBe(1)
  expect(one[0]!.title).toBe('B')
  expect(one[0]!.items.map(i => i.text)).toEqual(['y', 'x'])
  expect(boxNote(one)).toContain('"B" (2 to do)')
  expect(boxNote([])).toBeUndefined()
})

test('a later call clears answered questions and adds new asks in one go', async ($, on) => {
  let now = 1_000
  on('clock.now', () => ({ value: now }))
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__action-items__action_items', ...input } as never)
  await call({ title: 'Setup', decisions: [{ question: 'Which env?' }], actions: [{ text: 'Sign in', why: 'w' }] })
  now = 2_000
  const ran = await call({ title: 'Setup', answered: [1], actions: [{ text: 'Run the script', why: 'w2', command: './go.sh' }] })
  expect(String(ran.result)).toContain('2 to do')
  expect(String(ran.result)).toContain('1 unfinished from before')
  expect(String(ran.result)).not.toContain('to decide')
  now = 3_000
  await call({ title: 'Q', decisions: [{ question: 'A?' }] })
  expect(String((await call({ title: 'Q', answered: [1] })).result)).toContain('Cleared')
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

test('each conversation keeps its own box; the oldest past 20 and the old shared key are dropped', () => {
  expect(storeKey('abc')).toBe('sets:abc')
  const keys = ['sets', ...Array.from({ length: 22 }, (_, i) => `sets:s${i}`)]
  expect(staleKeys(keys)).toEqual(['sets', 'sets:s0', 'sets:s1'])
  expect(staleKeys(['sets:a', 'sets:b'])).toEqual([])
})

test('a folded command shows its first line that runs, not a comment', () => {
  expect(commandPreview('# All tests\npwsh -File t.ps1\n\n# More\npwsh x')).toBe('pwsh -File t.ps1')
  expect(commandPreview('az login')).toBe('az login')
  expect(commandPreview('# only a comment')).toBe('# only a comment')
})

test('new actions are held to Simplified Technical English, with every problem in one message', () => {
  const bad = parseSet({ title: 'T', actions: [{ text: "Check it's done; then you should restart", why: 'It has been broken', command: 'x; y' }] }, '1', 0)
  expect(bad).toContain('not in Simplified Technical English')
  expect(bad).toContain('a semicolon')
  expect(bad).toContain('a contraction')
  expect(bad).toContain('"should"')
  expect(bad).toContain('make sure that')
  expect(bad).toContain('`why` has the present perfect')
  // Code, quotes and the command are left alone; a clean action passes.
  expect(steProblems('Run `az login; az account show` and select "Don\'t ask again"', 20)).toEqual([])
  expect(steProblems('May 5 is the date.', 25)).toEqual([])
  expect(steWords('Run `a b c` in the "Admin center" (the portal)')).toBe(6)
  expect(steProblems(Array.from({ length: 21 }, () => 'word').join(' '), 20)).toEqual(['a sentence over 20 words'])
  // Two short sentences are fine; the limit is per sentence.
  expect(steProblems(`${Array.from({ length: 15 }, () => 'word').join(' ')}. ${Array.from({ length: 15 }, () => 'word').join(' ')}.`, 20)).toEqual([])
  // The older `steps` form is not checked.
  expect(typeof parseSet({ title: 'T', steps: [{ text: "Check it's done" }] }, '1', 0)).toBe('object')
})

test('caution and warning are kept on the action', () => {
  const set = parsed({ title: 'T', actions: [{ text: 'Erase the vault', why: 'Frees the space', caution: 'Do not erase the vault unless you are sure. You cannot undo this step.' }] })
  expect(set.items[0]).toMatchObject({ caution: 'Do not erase the vault unless you are sure. You cannot undo this step.' })
})

test('marking everything done ticks actions and closes questions without sending an answer', () => {
  const set = parsed({ title: 'T', decisions: [{ question: 'Q?' }], actions: [{ text: 'Run it', why: 'w' }] })
  const [done] = markAllDone([set])
  expect(isOpen(done!)).toBe(false)
  expect(done!.isSent).toBe(true)
})
