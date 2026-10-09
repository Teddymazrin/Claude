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
    actions: [{ text: 'Sign in to Azure', why: 'Lets the deploy reach your subscription', detail: 'A browser window opens; pick your work account', command: 'az login' }],
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
    expect(await ui.find({ type: 'Text', text: /pick your work account/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Lets the deploy reach your subscription/ })).toBeDefined()
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

test('a list too tall for the box folds: only the next open action keeps its detail', async ($, on) => {
  on('clock.now', () => ({ value: 9_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const actions = Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i + 1}`, why: `Why ${i + 1}`, detail: `How to do step ${i + 1}`, command: `run-${i + 1}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Long', actions } as never)
  const tall = { ...BAND, props: { ...BAND.props, maxRows: 60, scroll: { offset: 0, bodyRows: 60 } } }
  for (const surface of SURFACES) {
    // Room for all of it: every detail shows.
    const full = await $.ui.mount({ plugin: 'action-items', surface, ...tall } as never)
    expect(await full.find({ type: 'Text', text: /How to do step 6/ })).toBeDefined()
    await full.unmount()
    // 20 rows: compact. Step 1's detail and command show, the rest are one line.
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /How to do step 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /run-1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /How to do step 2/ })).toBeUndefined()
    // Folded, its title is a button that opens it.
    expect(await ui.find({ key: 'open-9000-5' })).toBeDefined()
    // Folded to one row, an action still says why.
    expect(await ui.find({ type: 'Text', text: /· Why 6/ })).toBeDefined()
    // Its command hidden, a folded action still has Copy.
    expect(await ui.find({ key: 'copy-9000-5' })).toBeDefined()
    // ...and shows the command itself on the row.
    expect(await ui.find({ type: 'Text', text: /^run-6$/ })).toBeDefined()
    await ui.unmount()
  }
  // Ticking step 1 folds it and hands the detail to step 2.
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'tick-9000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /How to do step 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeUndefined()
  await ui.unmount()
})

test('one question at a time: the first waiting one opens, the rest are one line', async ($, on) => {
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
    expect(await ui.find({ type: 'Text', text: /about first/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Second\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /about second/ })).toBeUndefined()
    expect(await ui.find({ key: 'pick-11000-1-0' })).toBeUndefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'pick-11000-0-1' })
  expect(await ui.find({ type: 'Text', text: /1 answered/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /about second/ })).toBeDefined()
  await ui.unmount()
})

test('a medium box keeps every why line, dropping only the how-to lines', async ($, on) => {
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
    for (const n of [1, 2, 3]) {
      expect(await ui.find({ type: 'Text', text: new RegExp(`Reason ${n}`) })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: new RegExp(`cmd-${n}`) })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Howto 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Howto 2/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('when the shown set is done, the box moves to the next one still waiting', async ($, on) => {
  let now = 20_000
  on('clock.now', () => ({ value: now }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Older', decisions: [{ question: 'Still waiting?' }] } as never)
  now = 21_000
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Newer', decisions: [{ question: 'Pick?', options: ['a'] }] } as never)
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /Pick\?/ })).toBeDefined()
  await ui.press({ key: 'pick-21000-0-0' })
  expect(await ui.find({ type: 'Text', text: /Still waiting\?/ })).toBeDefined()
  await ui.unmount()
})

test('a set with a question waiting comes before one with only actions left', async ($, on) => {
  let now = 30_000
  on('clock.now', () => ({ value: now }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Question', decisions: [{ question: 'Real question?' }] } as never)
  now = 31_000
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Leftover', actions: [{ text: 'Old chore', why: 'w' }] } as never)
  now = 32_000
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Done now', decisions: [{ question: 'Pick?', options: ['a'] }] } as never)
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'pick-32000-0-0' })
  expect(await ui.find({ type: 'Text', text: /Real question\?/ })).toBeDefined()
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
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: /How to do step 4/ })).toBeUndefined()
  await ui.press({ key: 'open-60000-3' })
  expect(await ui.find({ type: 'Text', text: /How to do step 4/ })).toBeDefined()
  // The one open before folds back.
  expect(await ui.find({ type: 'Text', text: /How to do step 1/ })).toBeUndefined()
  // Its title folds it again.
  await ui.press({ key: 'close-60000-3' })
  expect(await ui.find({ type: 'Text', text: /How to do step 4/ })).toBeUndefined()
  // A ticked one can be listed again and unticked.
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'tick-60000-0' })).toBeUndefined()
  await ui.press({ key: 'toggle-done' })
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
})
