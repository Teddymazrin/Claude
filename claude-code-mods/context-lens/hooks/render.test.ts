import { expect, test } from 'claude-code/testing'

import { breakdown } from './fixture'

const props = { title: 'Context Lens', isFocused: true, bodyColumns: 89, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as never
const viewport = { columns: 213, rows: 34, isFullscreen: true } as never

test('draws the pane before any reading', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('fs.write', () => ({ value: undefined }))
  const m = await $.ui.mount({ plugin: 'context-lens', surface: 'terminal', component: 'Pane', props, requestId: 'context-lens', viewport })
  expect(JSON.stringify(await m.drawn())).toContain('No reading yet')
})

test('draws the pane with a reading', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 34000, percent: 17, breakdown }, rateLimits: [] } }) as never)
  await $.command.run({ command: 'context-lens', args: '' } as never)
  const m = await $.ui.mount({ plugin: 'context-lens', surface: 'terminal', component: 'Pane', props, requestId: 'context-lens', viewport })
  const drawn = JSON.stringify(await m.drawn())
  expect(drawn).toContain('Messages')
  expect(drawn).toContain('Show all 8')
  expect(drawn).toContain('2 left out of the listing')
  expect(drawn).not.toContain('skill-0')
  await m.press({ key: 'toggle-Skills' } as never)
  expect(JSON.stringify(await m.drawn())).toContain('skill-0')
})
