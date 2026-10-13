import { expect, mock, test } from 'claude-code/testing'

import { COPY_LABEL, RESTART_LABEL } from './register'

const NOTE = '# Handoff: C:\\work\\app\nWritten today\n## Next steps\n1. Ship it'
const PANE = {
  plugin: 'context-handoff',
  component: 'Pane',
  props: { title: 'Context Handoff', isFocused: true, bodyColumns: 56 },
  requestId: 'context-handoff',
  viewport: { columns: 60, rows: 40 },
} as const

test('the note Claude sends shows in the pane, and Copy prompt copies it whole', async ($, on) => {
  const copied: string[] = []
  const stored: unknown[] = []
  // Stands for the engine: the project root, the store (to prove nothing is saved), the clock and the clipboard.
  on('store.set', ($, e) => {
    stored.push(e)
    return { value: undefined } as never
  })
  on('session.root', () => ({ value: 'C:\\work\\app' }) as never)
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  const sent = await $.tool.call({ tool: 'mcp__context-handoff__handoff_note', note: NOTE } as never)
  expect(String((sent as { result?: unknown }).result)).toContain('Saved')

  // Session-only: nothing lands in the cross-session store.
  expect(stored).toEqual([])

  for (const surface of ['terminal', 'desktop'] as const) {
    copied.length = 0
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    expect(await ui.find({ type: 'Text', text: 'C:\\work\\app' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '1. Ship it' })).toBeTruthy()
    expect(await ui.find({ key: 'copy-note' })).toBeFalsy()
    await ui.press({ key: 'copy-prompt' })
    expect(copied[0]).toContain("Here's a handoff note from my last session.")
    expect(copied[0]?.endsWith(NOTE)).toBe(true)
    await ui.unmount()
  }
})

test('an empty note is refused and the pane stays empty', async ($, on) => {
  mock.store(on)
  on('session.root', () => ({ value: 'C:\\work\\app' }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  const sent = await $.tool.call({ tool: 'mcp__context-handoff__handoff_note', note: '  ' } as never)
  expect(String((sent as { result?: unknown }).result)).toContain('not saved')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /No note yet/ })).toBeTruthy()
  await ui.unmount()
})

test('both ways on show, and Clear does nothing until confirmed', async ($, on) => {
  mock.store(on)
  const ran: string[] = []
  on('session.root', () => ({ value: 'C:\work\app' }) as never)
  on('clock.now', () => ({ value: 1_000 }))
  on('command.run', ($, e) => {
    ran.push((e as { command: string }).command)
    return { value: { text: '' } } as never
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({ tool: 'mcp__context-handoff__handoff_note', note: NOTE } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    expect(await ui.find({ key: 'start-fresh' })).toBeTruthy()
    expect(await ui.find({ key: 'copy-prompt' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', label: COPY_LABEL })).toBeTruthy()
    expect(await ui.find({ type: 'Button', label: RESTART_LABEL })).toBeTruthy()
    // No one answers the confirm here, so the chat is left alone.
    await ui.press({ key: 'start-fresh' })
    expect(ran).toEqual([])
    await ui.unmount()
  }
})
