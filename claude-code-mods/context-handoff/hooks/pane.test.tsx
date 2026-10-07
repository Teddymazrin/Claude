import { expect, mock, test } from 'claude-code/testing'

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
  // Stands for the engine: the project root, the store, the clock and the clipboard.
  mock.store(on)
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
