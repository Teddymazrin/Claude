import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'control-panel',
  component: 'Pane',
  props: { title: 'Control Panel', isFocused: true, bodyColumns: 46 },
  requestId: 'control-panel',
  viewport: { columns: 50, rows: 60 },
} as const

test('an effort pick runs /effort, so the engine itself switches, and nothing is saved as an override', async ($, on) => {
  const clock = mock.clock(on)
  const saved: unknown[] = []
  on('store.get', () => ({ value: undefined }) as never)
  on('store.set', ($, e) => {
    saved.push(e)
    return { value: undefined } as never
  })
  const ran: string[] = []
  on('session.surfaces', () => ({ value: ['terminal'] }) as never)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('command.run', ($, e) => {
    ran.push(`/${e.command} ${e.args ?? ''}`.trim())
    return { text: '' } as never
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  await ui.press({ key: 'effort-x-btn' })
  await clock.advance(1_000)
  expect(ran).toContain('/effort xhigh')
  expect(saved).toEqual([expect.objectContaining({ key: 'choice', value: { model: null, effort: null } })])
  await ui.unmount()
})
