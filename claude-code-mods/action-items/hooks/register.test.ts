import { expect, test } from 'claude-code/testing'

import type { StepSet } from '../types'
import { withEarlier, addSet, markAllDone, boxNote, dropItem, flatten, staleKeys, storeKey, answerText, applyTyped, clearSet, markAnswered, countText, doLevel, doRows, isDecided, isOpen, parseSet, pick, REMINDER, withReminder, startTyping, toggleAction, openActions, ranAction, replyAsk, tickDone, tickRan } from './register'

const parsed = (input: Record<string, unknown>) => {
  const set = parseSet(input, '1', 1_000)
  if (typeof set === 'string') throw new Error(set)
  return set
}

test('parses decisions and actions, decisions first', () => {
  const set = parsed({
    title: 'Deploy',
    intro: 'These steps deploy the app. You must have Owner access.',
    actions: [{ text: 'Sign in to Azure', command: 'Connect-AzAccount' }, { text: 'Run the deploy script', check: ' Make sure that the output shows 3 rows. ', command: '  ' }],
    decisions: [{ question: 'Which region?', detail: 'Closest to users', options: ['eastus', ' ', 'westeurope'] }],
  })
  expect(set.items[0]).toEqual({ kind: 'decide', text: 'Which region?', detail: 'Closest to users', options: ['eastus', 'westeurope'] })
  expect(set.items[1]).toEqual({ kind: 'do', text: 'Sign in to Azure', command: 'Connect-AzAccount', isDone: false })
  // Only the step and its command are kept: an intro and checks from older callers are dropped.
  expect(set.items[2]).toEqual({ kind: 'do', text: 'Run the deploy script', isDone: false })
  expect(set.intro).toBeUndefined()
})

test('takes the older `steps` as actions; rejects empty or broken sets', () => {
  expect(parsed({ title: 't', steps: [{ text: 'a' }] }).items[0]?.kind).toBe('do')
  expect(parseSet({ actions: [{ text: 'a' }] }, '1', 0)).toContain('title')
  expect(parseSet({ title: 't' }, '1', 0)).toContain('at least one')
  expect(parseSet({ title: 't', actions: [{ command: 'x' }] }, '1', 0)).toContain('text')
  // Plain words are fine: no style rules reject a step.
  expect(typeof parseSet({ title: 't', actions: [{ text: "Check it's done; then restart" }] }, '1', 0)).toBe('object')
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

test('the Do tab counts each step and its whole command, and drops blank lines to fit', () => {
  const as = parsed({ title: 'T', actions: [1, 2, 3].map(n => ({ text: `A${n}`, command: 'c' })) }).items as never[]
  // Chrome 5; each action 2 rows; 2 blank lines between.
  expect(doRows(as, 100, 0)).toBe(13)
  expect(doRows(as, 100, 1)).toBe(11)
  // A long command wraps instead of being cut: 100 columns leave 92 for it.
  const long = parsed({ title: 'T', actions: [{ text: 'A', command: 'x'.repeat(200) }] }).items as never[]
  expect(doRows(long, 100, 0)).toBe(5 + 1 + 3)
  expect(doLevel(as, 100, 13)).toBe(0)
  expect(doLevel(as, 100, 12)).toBe(1)
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

test('caution and warning from older callers are dropped', () => {
  const set = parsed({ title: 'T', actions: [{ text: 'Erase the vault', caution: 'You cannot undo this step.', warning: 'x' }] })
  expect(set.items[0]).toEqual({ kind: 'do', text: 'Erase the vault', isDone: false })
})

test('a command run as an action gives it ticks that action, and only that one', () => {
  const set = parsed({
    title: 'Install',
    actions: [
      { text: 'In a terminal, update the bare-view mod.', command: 'claude plugin update bare-view@teddymazrin-mods' },
      { text: 'In an open session, run /reload-plugins.', command: '/reload-plugins' },
      { text: 'Restart Claude Code.' },
      { text: 'List the files.', command: 'ls' },
    ],
  })
  const [update, reload, restart, ls] = set.items as [never, never, never, never]
  // Claude's shell call can wrap the command.
  expect(ranAction(update, 'claude plugin update bare-view@teddymazrin-mods 2>&1; claude plugin list')).toBe(true)
  expect(ranAction(update, 'claude plugin update guard-rails@teddymazrin-mods')).toBe(false)
  expect(ranAction(reload, '/reload-plugins ')).toBe(true)
  expect(ranAction(reload, '/compact')).toBe(false)
  // No command, nothing to match; a short command must match whole.
  expect(ranAction(restart, 'claude')).toBe(false)
  expect(ranAction(ls, 'ls')).toBe(true)
  expect(ranAction(ls, 'ls -la; rm x')).toBe(false)
  const { list, ticked } = tickRan([set], '/reload-plugins')
  expect(ticked).toEqual(['In an open session, run /reload-plugins.'])
  expect(openActions(list[0]!).length).toBe(3)
})

test('the box note lists open actions by number, and done ticks them by that number', () => {
  let set = parsed({ title: 'Install', decisions: [{ question: 'Push?' }], actions: [{ text: 'Update the mod.' }, { text: 'Restart Claude Code.' }] })
  set = tickDone(set, [1])
  expect(boxNote([set])).toContain('Open actions in "Install": 2. Restart Claude Code.')
  expect(boxNote([set])).not.toContain('1. Update the mod.')
  expect(boxNote([set])).toContain('`done`')
  expect(countText(tickDone(set, [2]))).toBe('1 to decide')
})

test('done in a call ticks actions without new asks', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__action-items__action_items', ...input } as never)
  await call({ title: 'Install', actions: [{ text: 'Update the mod.' }, { text: 'Restart Claude Code.' }] })
  const ran = await call({ title: 'Install', done: [2] })
  expect(String(ran.result)).toContain('1 to do')
})

test('a reply that ends asking something is found; one that points at the box or asks nothing is not', () => {
  expect(replyAsk('Fixed the order bug.\n\nDo you want me to make that fix?')).toBe('Do you want me to make that fix?')
  expect(replyAsk('It has 2 settings. To set them, run this at the prompt:\n```\n/plugin configure x\n```\nWant me to do steps 1 and 2.')).toBe('Want me to do steps 1 and 2.')
  expect(replyAsk('All 30 tests pass.\n\nThe go-ahead question is in the Action Items box.')).toBeUndefined()
  expect(replyAsk('✅ **Pushed to main.**\n\nChanges made:\n- New format')).toBeUndefined()
  // A question inside code or a quote is not one for the user.
  expect(replyAsk('Done.\n```\nread -p "Continue?"\n```')).toBeUndefined()
})

test('the safety net sends Claude back once when it asked without the box', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('turn.start', (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('classic.Stop', () => ({}))
  await $.turn.start({ text: 'fix it', turnId: 't1' } as never)
  const asked = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'I found it.\n\nWant me to fix it?' } as never)
  expect(asked.block).toContain('Want me to fix it?')
  // Only once a turn, and never while a Stop hook already sent it back.
  expect((await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Want me to fix it?' } as never)).block).toBeUndefined()
  await $.turn.start({ text: 'again', turnId: 't2' } as never)
  expect((await $.classic.Stop({ stop_hook_active: true, last_assistant_message: 'Want me to fix it?' } as never)).block).toBeUndefined()
  // A turn that used the box is left alone.
  await $.turn.start({ text: 'again', turnId: 't3' } as never)
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Fix', decisions: [{ question: 'Fix it?' }] } as never)
  expect((await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Want me to fix it?' } as never)).block).toBeUndefined()
})

test('marking everything done ticks actions and closes questions without sending an answer', () => {
  const set = parsed({ title: 'T', decisions: [{ question: 'Q?' }], actions: [{ text: 'Run it', why: 'w' }] })
  const [done] = markAllDone([set])
  expect(isOpen(done!)).toBe(false)
  expect(done!.isSent).toBe(true)
})

test('earlier asks fold behind one line only while something new shows', () => {
  const fresh = { it: { kind: 'do', text: 'new', isDone: false } as const }
  const old = { it: { kind: 'do', text: 'old', isDone: false, isEarlier: true } as const }
  expect(withEarlier([fresh, old], false)).toEqual({ items: [fresh], line: { count: 1, isOpen: false } })
  expect(withEarlier([fresh, old], true)).toEqual({ items: [fresh, old], line: { count: 1, isOpen: true } })
  // Nothing new: the earlier ones show as they are, with no line.
  expect(withEarlier([old], false)).toEqual({ items: [old], line: undefined })
})
