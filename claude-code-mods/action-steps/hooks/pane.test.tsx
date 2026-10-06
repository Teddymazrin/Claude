import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'action-steps',
  viewport: { columns: 304, rows: 60, isFullscreen: true },
  props: { title: 'Action Steps', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
} as const

const BAND = {
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 96, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const SURFACES = ['terminal', 'desktop'] as const

test('the pane draws numbered steps and ticks one off', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  await $.tool.call({
    tool: 'mcp__action-steps__action_steps',
    title: 'Demo task',
    steps: [{ text: 'First thing', command: 'Get-Thing' }, { text: 'Second thing' }],
  } as never)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'action-steps', surface, ...PANE } as never)
    expect(await ui.find({ type: 'Text', text: /First thing/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Get-Thing/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'action-steps', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'tick-5000-0' })
  expect(await ui.find({ type: 'Text', text: /Get-Thing/ })).toBeUndefined()
  await ui.unmount()
})

test('the empty pane and the box above the prompt draw', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  // Stands for the engine's own band beneath the plugin.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  for (const surface of SURFACES) {
    const empty = await $.ui.mount({ plugin: 'action-steps', surface, ...PANE } as never)
    expect(await empty.find({ type: 'Text', text: /Nothing to do yet/ })).toBeDefined()
    await empty.unmount()
  }
  // No surface places panes in a test, so the steps land in the box above the prompt.
  await $.tool.call({ tool: 'mcp__action-steps__action_steps', title: 'Band task', steps: [{ text: 'Do the thing' }] } as never)
  for (const surface of SURFACES) {
    const band = await $.ui.mount({ plugin: 'action-steps', surface, ...BAND } as never)
    expect(await band.find({ type: 'Text', text: /Do the thing/ })).toBeDefined()
    await band.unmount()
  }
})
