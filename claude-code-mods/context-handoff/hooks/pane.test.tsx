import { expect, test } from 'claude-code/testing'

const NOTE = '# Handoff: C:\\work\\app\nWritten today\n## Next steps\n1. Ship it'
const PATH = 'C:/Users/me/.claude/handoffs/C-work-app.md'
const PANE = {
  plugin: 'context-handoff',
  component: 'Pane',
  props: { title: 'Context Handoff', isFocused: true, bodyColumns: 56 },
  requestId: 'context-handoff',
  viewport: { columns: 60, rows: 40 },
} as const

test('saving the note shows it, and each Copy button copies its own text', async ($, on) => {
  const copied: string[] = []
  // Stands for the engine: the home folder, the project root, the note on disk, the tools and the clipboard.
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined }) as never)
  on('session.root', () => ({ value: 'C:\\work\\app' }) as never)
  on('fs.read', () => ({ value: NOTE }) as never)
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({ tool: 'Write', file_path: 'C:\\Users\\me\\.claude\\handoffs\\C-work-app.md', content: NOTE } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    copied.length = 0
    const ui = await $.ui.mount({ ...PANE, surface } as never)
    expect(await ui.find({ type: 'Text', text: PATH })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '1. Ship it' })).toBeTruthy()
    await ui.press({ key: 'copy-prompt' })
    await ui.press({ key: 'copy-note' })
    expect(copied[0]).toContain(`Read the handoff note at ${PATH}`)
    expect(copied[1]).toBe(NOTE)
    await ui.unmount()
  }
})

test('a write to any other file opens nothing', async ($, on) => {
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\me' : undefined }) as never)
  on('session.root', () => ({ value: 'C:\\work\\app' }) as never)
  on('fs.read', () => ({ value: NOTE }) as never)
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({ tool: 'Write', file_path: 'C:\\work\\app\\README.md', content: 'x' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /No note yet/ })).toBeTruthy()
  expect(await ui.find({ key: 'copy-prompt' })).toBeFalsy()
  await ui.unmount()
})
