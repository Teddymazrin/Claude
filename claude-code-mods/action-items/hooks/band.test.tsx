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
    intro: 'These steps deploy the app to your subscription.',
    actions: [{ text: 'Sign in to Azure', check: 'Make sure that the browser shows your work account.', command: 'az login' }],
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /^⚑ / })).toBeDefined()
    // Opens on Decide; the Do tab shows the actions.
    expect(await ui.find({ key: 'tab-decide' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Which region\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /az login/ })).toBeUndefined()
    await ui.press({ key: 'tab-do' })
    expect(await ui.find({ type: 'Text', text: /az login/ })).toBeDefined()
    // Just the step and its command: an older caller's intro and check don't show.
    expect(await ui.find({ type: 'Text', text: 'These steps deploy the app to your subscription.' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Make sure that the browser shows your work account/ })).toBeUndefined()
    expect(await ui.find({ key: 'copy-5000-1' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: /^⚑ / })).toBeUndefined()
  await ui.unmount()
})

test('no CAUTION notice shows, even when an older caller sends one', async ($, on) => {
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
    expect(await ui.find({ type: 'Text', text: 'CAUTION: ' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /You cannot undo this step/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /az keyvault purge/ })).toBeDefined()
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
  expect(await after.find({ type: 'Text', text: /^⚑ / })).toBeUndefined()
  await after.unmount()
})

test('every command shows whole, in a tall box and a short one', async ($, on) => {
  on('clock.now', () => ({ value: 9_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const long = 'git -C C:/Users/PC/AppData/Local/Temp/ghmove/claude-repo push --force origin fresh-main:main'
  const actions = Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i + 1}`, command: i === 5 ? long : `run-${i + 1}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Long', actions } as never)
  const tall = { ...BAND, props: { ...BAND.props, maxRows: 60, scroll: { offset: 0, bodyRows: 60 } } }
  const short = { ...BAND, props: { ...BAND.props, maxRows: 12, scroll: { offset: 0, bodyRows: 12 } } }
  for (const surface of SURFACES) {
    for (const size of [tall, short]) {
      const ui = await $.ui.mount({ plugin: 'action-items', surface, ...size } as never)
      expect(await ui.find({ type: 'Text', text: long })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^run-1$/ })).toBeDefined()
      expect(await ui.find({ key: 'copy-9000-5' })).toBeDefined()
      expect(await ui.find({ key: 'open-9000-5' })).toBeUndefined()
      await ui.unmount()
    }
  }
  // Ticking step 1 folds it into "1 done".
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...short } as never)
  await ui.press({ key: 'tick-9000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeUndefined()
  await ui.unmount()
})

test('one question at a time; its context opens only on info, outside the question list', async ($, on) => {
  on('clock.now', () => ({ value: 11_000 }))
  // Stands for a surface with no room for a pane.
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: false as const, reason: 'no-surface' as const } }
  })
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
    // Nothing opens by itself; the recommended choice says so.
    expect(await ui.find({ type: 'Text', text: /about first/ })).toBeUndefined()
    expect(await ui.find({ key: 'pick-11000-0-0', label: 'a (recommended)' } as never)).toBeDefined()
    // info asks for the side pane; with none placed here, it shows in a small box under the question.
    await ui.press({ key: 'dinfo-11000-0' })
    expect(opened.at(-1)).toBe('action-items-info')
    expect(await ui.find({ key: 'dbox-11000-0' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /about first/ })).toBeDefined()
    // Pressed again, it closes.
    await ui.press({ key: 'dinfo-11000-0' })
    expect(await ui.find({ key: 'dbox-11000-0' })).toBeUndefined()
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
    expect(await ui.find({ type: 'Text', text: '⚑ Newer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Run the new step/ })).toBeDefined()
    // Carried steps fold behind one line while something new shows.
    expect(await ui.find({ key: 'earlier-do-toggle' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Old step/ })).toBeUndefined()
    // No arrows, no stacked sets, no ✕ beside Mark as done.
    expect(await ui.find({ key: 'nav-older' })).toBeUndefined()
    expect(await ui.find({ key: 'band-close' })).toBeUndefined()
    expect(await ui.find({ key: 'tick-21000-0' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  // Opened, they list under an Earlier line; the new ask has no ✕, a carried one does.
  await ui.press({ key: 'earlier-do-toggle' })
  expect(await ui.find({ type: 'Text', text: /Old step/ })).toBeDefined()
  expect(await ui.find({ key: 'drop-21000-0' })).toBeUndefined()
  expect(await ui.find({ key: 'drop-21000-1' })).toBeDefined()
  await ui.press({ key: 'drop-21000-1' })
  expect(await ui.find({ type: 'Text', text: /^Old step$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Other old step/ })).toBeDefined()
  // Ticking the rest closes the box.
  await ui.press({ key: 'tick-21000-0' })
  await ui.press({ key: 'tick-21000-1' })
  expect(await ui.find({ type: 'Text', text: /^⚑ / })).toBeUndefined()
  await ui.unmount()
})

test('in a short box, a ticked action folds away and can be listed again to untick', async ($, on) => {
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const actions = Array.from({ length: 6 }, (_, i) => ({ text: `Step ${i + 1}`, command: `run-${i + 1}` }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Long', actions } as never)
  const short = { ...BAND, props: { ...BAND.props, maxRows: 12, scroll: { offset: 0, bodyRows: 12 } } }
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...short } as never)
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'tick-60000-0' })).toBeUndefined()
  await ui.press({ key: 'toggle-done' })
  await ui.press({ key: 'tick-60000-0' })
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
})

test('Mark as done ticks everything off and closes the box', async ($, on) => {
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
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  await ui.press({ key: 'done-all' })
  expect(await ui.find({ type: 'Text', text: /^⚑ / })).toBeUndefined()
  await ui.unmount()
  expect(await $.command.run({ command: 'action-items' } as never)).toEqual({ text: 'Nothing open: Claude needs nothing from you right now.' })
})

test('/action-items done and hide work from the prompt, mid-turn too', async ($, on) => {
  let now = 1_000
  on('clock.now', () => ({ value: now }))
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'First', actions: [{ text: 'Do First', why: 'Test' }] } as never)
  expect(await $.command.run({ command: 'action-items', args: 'hide' } as never)).toEqual({ text: 'Box hidden. /action-items brings it back.' })
  expect(await $.command.run({ command: 'action-items', args: '' } as never)).toEqual({ text: 'Showing First (1 to do) above the prompt.' })
  expect(await $.command.run({ command: 'action-items', args: 'done' } as never)).toEqual({ text: 'Marked everything as done.' })
  expect(await $.command.run({ command: 'action-items', args: '' } as never)).toEqual({ text: 'Nothing open: Claude needs nothing from you right now.' })
  // The older name still works.
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Second', decisions: [{ question: 'Go?' }] } as never)
  expect(await $.command.run({ command: 'action-items', args: 'clear' } as never)).toEqual({ text: 'Marked everything as done.' })
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
  expect(await ui.find({ type: 'Text', text: '⚑ Ship' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 to decide/ })).toBeDefined()
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

test('actions only: no tabs, and Copy all copies every open command', async ($, on) => {
  on('clock.now', () => ({ value: 70_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Two', actions: [{ text: 'One', command: 'run-1' }, { text: 'Two', command: 'run-2' }] } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-items', surface, ...BAND } as never)
    expect(await ui.find({ key: 'tab-do' })).toBeUndefined()
    expect(await ui.find({ key: 'tab-decide' })).toBeUndefined()
    expect(await ui.find({ key: 'copy-all' })).toBeDefined()
    await ui.unmount()
  }
  // One command left: Copy all goes, since the step's own Copy does the same.
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  await ui.press({ key: 'tick-70000-0' })
  expect(await ui.find({ key: 'copy-all' })).toBeUndefined()
  await ui.unmount()
})

test('remove drops an out-of-date action without ticking it', async ($, on) => {
  on('clock.now', () => ({ value: 80_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Test', actions: [{ text: 'Test 1.0.0' }, { text: 'Test 1.0.1' }] } as never)
  const ran = await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Test', remove: [1] } as never)
  expect(String(ran.result)).toContain('1 to do')
  const ui = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Text', text: 'Test 1.0.0' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Test 1.0.1' })).toBeDefined()
  expect(await ui.find({ key: 'toggle-done' })).toBeUndefined()
  await ui.unmount()
  // Removing the last one empties the box.
  await $.tool.call({ tool: 'mcp__action-items__action_items', title: 'Test', remove: [1] } as never)
  const after = await $.ui.mount({ plugin: 'action-items', surface: 'terminal', ...BAND } as never)
  expect(await after.find({ type: 'Text', text: /^⚑ / })).toBeUndefined()
  await after.unmount()
})
