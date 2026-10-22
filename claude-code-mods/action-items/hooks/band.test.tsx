import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 96, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const

test('the box shows decisions apart from actions; a click sends the answer', async ($, on) => {
  let sent = ''
  on('clock.now', () => ({ value: 5_000 }))
  on('prompt.submit', ($, e) => {
    sent = e.text
    return { text: e.text }
  })
  // Stands for the engine's own band beneath the plugin.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({
    tool: 'mcp__action-items__action_items',
    title: 'Deploy',
    decisions: [{ question: 'Which region?', options: ['eastus', 'westeurope'] }],
    actions: [{ text: 'Sign in to Azure', why: 'Lets the deploy reach your subscription', detail: 'A browser window opens. Pick your work account.', command: 'az login' }],
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /CLAUDE NEEDS YOU/ })).toBeDefined()
    // Opens on Decide; the Do tab shows the actions.
    expect(await ui.find({ key: 'tab-decide' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Which region\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /az login/ })).toBeUndefined()
    await ui.press({ key: 'tab-do' })
    expect(await ui.find({ type: 'Text', text: /az login/ })).toBeDefined()
    // Why and how-to wait behind info until it is pressed, and fold away again.
    expect(await ui.find({ type: 'Text', text: /Lets the deploy reach your subscription/ })).toBeUndefined()
    await ui.press({ key: 'info-5000-1' })
    expect(await ui.find({ type: 'Text', text: /Pick your work account/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Lets the deploy reach your subscription/ })).toBeDefined()
    await ui.press({ key: 'info-5000-1' })
    expect(await ui.find({ type: 'Text', text: /Lets the deploy reach your subscription/ })).toBeUndefined()
    await ui.press({ key: 'tab-decide' })
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'pick-5000-0-1' })
  expect(sent).toBe('Deploy:\n- Which region? → westeurope')
  // With nothing left to decide, the box moves to Do by itself.
  expect(await ui.find({ type: 'Text', text: /az login/ })).toBeDefined()
  // Ticking the last action closes the box.
  await ui.press({ key: 'tick-5000-1' })
  expect(await ui.find({ type: 'Text', text: /CLAUDE NEEDS YOU/ })).toBeUndefined()
  await ui.unmount()
})

test('a caution shows before its step, outside info', async ($, on) => {
  on('clock.now', () => ({ value: 50_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({
    tool: 'mcp__action-items__action_items',
    title: 'Purge',
    actions: [{ text: 'Purge the vault', why: 'Frees the name', caution: 'Do not purge the vault unless you are sure. You cannot undo this step.', command: 'az keyvault purge' }],
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: 'CAUTION: ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /You cannot undo this step/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a typed reply keeps unanswered questions until Claude clears them', async ($, on) => {
  on('clock.now', () => ({ value: 7_000 }))
  let context: readonly string[] = []
  on('prompt.submit', ($, e) => {
    context = e.context ?? []
    return { text: e.text }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Q', decisions: [{ question: 'Name?' }, { question: 'Color?', options: ['red'] }] } as never)
  await $.prompt.submit({ text: 'what does the [-] do?', wait: false, origin: { kind: 'composer' } })
  // Unrelated chat leaves both waiting, and Claude is told which are open.
  expect(context.join('\n')).toContain('1. Name?')
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /Name\?/ })).toBeDefined()
  await ui.unmount()
  // Claude saw question 1 answered in chat and clears it; 2 stays.
  const ran = await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Q', answered: [1] } as never)
  expect(String(ran.result)).toContain('1 to decide')
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Q', answered: [2] } as never)
  const after = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await after.find({ type: 'Text', text: /CLAUDE NEEDS YOU/ })).toBeUndefined()
  await after.unmount()
})

test('info is closed by default; a box too short folds the other actions to one row', async ($, on) => {
  on('clock.now', () => ({ value: 9_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const actions = Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i + 1}`, why: `Why ${i + 1}`, detail: `How to do step ${i + 1}`, command: `run-${i + 1}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Long', actions } as never)
  const tall = { ...BAND, props: { ...BAND.props, maxRows: 60, scroll: { offset: 0, bodyRows: 60 } } }
  const short = { ...BAND, props: { ...BAND.props, maxRows: 12, scroll: { offset: 0, bodyRows: 12 } } }
  for (const surface of SURFACES) {
    // Room for all of it: every task and command, but no why or how-to until info is opened.
    const full = await $.ui.mount({ plugin: 'action-items', surface, ...tall } as never)
    expect(await full.find({ type: 'Text', text: /run-6/ })).toBeDefined()
    expect(await full.find({ type: 'Text', text: /Why 6/ })).toBeUndefined()
    expect(await full.find({ type: 'Text', text: /How to do step 6/ })).toBeUndefined()
    await full.press({ key: 'info-9000-5' })
    expect(await full.find({ type: 'Text', text: /Why 6/ })).toBeDefined()
    expect(await full.find({ type: 'Text', text: /How to do step 6/ })).toBeDefined()
    expect(await full.find({ type: 'Text', text: /Why 5/ })).toBeUndefined()
    await full.press({ key: 'info-9000-5' })
    await full.unmount()
    // 12 rows: the next action keeps its command; the rest fold to one row with theirs and Copy.
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...short } as never)
    expect(await ui.find({ key: 'open-9000-5' })).toBeDefined()
    expect(await ui.find({ key: 'copy-9000-5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^run-6$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Why/ })).toBeUndefined()
    await ui.unmount()
  }
  // Ticking step 1 folds it into "1 done".
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...short } as never)
  await ui.press({ key: 'tick-9000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeUndefined()
  await ui.unmount()
})

test('one question at a time: the first waiting one opens, its context behind info', async ($, on) => {
  on('clock.now', () => ({ value: 11_000 }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({
    tool: 'mcp__action-items__action_items',
    title: 'Many',
    decisions: [
      { question: 'First?', detail: 'about first', options: ['a', 'b'] },
      { question: 'Second?', detail: 'about second', options: ['c', 'd'] },
    ],
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /about first/ })).toBeUndefined()
    await ui.press({ key: 'dinfo-11000-0' })
    expect(await ui.find({ type: 'Text', text: /about first/ })).toBeDefined()
    await ui.press({ key: 'dinfo-11000-0' })
    expect(await ui.find({ type: 'Text', text: /Second\?/ })).toBeDefined()
    // Waiting its turn, the second shows neither its info button nor its options.
    expect(await ui.find({ key: 'dinfo-11000-1' })).toBeUndefined()
    expect(await ui.find({ key: 'pick-11000-1-0' })).toBeUndefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'pick-11000-0-1' })
  expect(await ui.find({ type: 'Text', text: /1 answered/ })).toBeDefined()
  expect(await ui.find({ key: 'dinfo-11000-1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /about second/ })).toBeUndefined()
  await ui.unmount()
})

test('opening info on one action leaves the others closed', async ($, on) => {
  on('clock.now', () => ({ value: 13_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const actions = [1, 2, 3].map(n => ({ text: `Task ${n}`, why: `Reason ${n}`, detail: `Howto ${n}`, command: `cmd-${n}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Mid', actions } as never)
  const mid = { ...BAND, props: { ...BAND.props, maxRows: 16, scroll: { offset: 0, bodyRows: 16 } } }
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...mid } as never)
    for (const n of [1, 2, 3]) expect(await ui.find({ type: 'Text', text: new RegExp(`cmd-${n}`) })).toBeDefined()
    await ui.press({ key: 'info-13000-1' })
    expect(await ui.find({ type: 'Text', text: /Reason 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Howto 2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Reason 1/ })).toBeUndefined()
    await ui.press({ key: 'info-13000-1' })
    await ui.unmount()
  }
})

test('new asks go on top; unfinished ones from before stay under Earlier until ticked or dropped', async ($, on) => {
  let now = 20_000
  on('clock.now', () => ({ value: now }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Older', actions: [{ text: 'Old step', why: 'w' }, { text: 'Other old step', why: 'w' }] } as never)
  now = 21_000
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Newer', actions: [{ text: 'Run the new step', why: 'w' }] } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: 'Newer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Run the new step/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '── Earlier ──' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Old step/ })).toBeDefined()
    // No arrows, no stacked sets.
    expect(await ui.find({ key: 'nav-older' })).toBeUndefined()
    expect(await ui.find({ key: 'tick-21000-0' })).toBeDefined()
    // The new ask has no ✕; a carried one does.
    expect(await ui.find({ key: 'drop-21000-0' })).toBeUndefined()
    expect(await ui.find({ key: 'drop-21000-1' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'drop-21000-1' })
  expect(await ui.find({ type: 'Text', text: /^Old step$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Other old step/ })).toBeDefined()
  // Ticking the rest closes the box.
  await ui.press({ key: 'tick-21000-0' })
  await ui.press({ key: 'tick-21000-1' })
  expect(await ui.find({ type: 'Text', text: /CLAUDE NEEDS YOU/ })).toBeUndefined()
  await ui.unmount()
})

test('in a short box, clicking a folded action opens it in full', async ($, on) => {
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const actions = Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i + 1}`, why: `Why ${i + 1}`, detail: `How to do step ${i + 1}`, command: `run-${i + 1}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Long', actions } as never)
  const short = { ...BAND, props: { ...BAND.props, maxRows: 12, scroll: { offset: 0, bodyRows: 12 } } }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...short } as never)
  expect(await ui.find({ key: 'close-60000-0' })).toBeDefined()
  await ui.press({ key: 'open-60000-3' })
  expect(await ui.find({ key: 'close-60000-3' })).toBeDefined()
  // The one open before folds back.
  expect(await ui.find({ key: 'open-60000-0' })).toBeDefined()
  // Its title folds it again.
  await ui.press({ key: 'close-60000-3' })
  expect(await ui.find({ key: 'open-60000-3' })).toBeDefined()
  // A ticked one can be listed again and unticked.
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'tick-60000-0' })).toBeUndefined()
  await ui.press({ key: 'toggle-done' })
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
})

test('Clear empties the box', async ($, on) => {
  let now = 1_000
  on('clock.now', () => ({ value: now }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Old one', actions: [{ text: 'Do old', why: 'Test' }] } as never)
  now = 2_000
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'New one', actions: [{ text: 'Do new', why: 'Test' }] } as never)
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ key: 'clear-all' })).toBeUndefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ type: 'Text', text: /CLAUDE NEEDS YOU/ })).toBeUndefined()
  await ui.unmount()
  expect(await $.command.run({ command: 'action-items' } as never)).toEqual({ text: 'Nothing open: Claude needs nothing from you right now.' })
})

test('/action-items clear and hide work from the prompt, mid-turn too', async ($, on) => {
  let now = 1_000
  on('clock.now', () => ({ value: now }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'First', actions: [{ text: 'Do First', why: 'Test' }] } as never)
  expect(await $.command.run({ command: 'action-items', args: 'hide' } as never)).toEqual({ text: 'Box hidden. /action-items brings it back.' })
  expect(await $.command.run({ command: 'action-items', args: '' } as never)).toEqual({ text: 'Showing First (1 to do) above the prompt.' })
  expect(await $.command.run({ command: 'action-items', args: 'clear' } as never)).toEqual({ text: 'Box emptied.' })
  expect(await $.command.run({ command: 'action-items', args: 'clear all' } as never)).toEqual({ text: 'Box emptied.' })
})

test('while Claude works the box folds to one line; /action-items opens it until the next prompt', async ($, on) => {
  on('clock.now', () => ({ value: 9_000 }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Ship', decisions: [{ question: 'Merge now?', options: ['Yes', 'Wait'] }] } as never)
  const WORKING = { ...BAND, props: { ...BAND.props, isWorking: true } }
  let ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...WORKING } as never)
  expect(await ui.find({ type: 'Text', text: /Ship · 1 to decide/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Merge now\?/ })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ command: 'action-items' } as never)
  ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...WORKING } as never)
  expect(await ui.find({ type: 'Text', text: /Merge now\?/ })).toBeDefined()
  await ui.unmount()
  // A new prompt folds it again; once the turn ends it is whole.
  await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
  ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...WORKING } as never)
  expect(await ui.find({ type: 'Text', text: /Merge now\?/ })).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /Merge now\?/ })).toBeDefined()
  await ui.unmount()
})
