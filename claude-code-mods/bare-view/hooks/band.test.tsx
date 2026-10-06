import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  viewport: { columns: 160, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 156, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the band names each tool in the tally', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  // Stands for the engine: answers the tools and draws an empty band beneath.
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({
    tool: 'mcp__bare-view__checklist',
    goal: 'Check the tally',
    steps: [{ text: 'Run tools', status: 'active' }, { text: 'Finish', status: 'todo' }],
  } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'x' } as never)
  await $.tool.call({ tool: 'mcp__plugin_microsoft-docs_microsoft-learn__microsoft_docs_search', query: 'rbac' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND } as never)
    const row = await ui.find({ type: 'Text', text: /3 tool calls/ })
    expect(row).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Built-in 2: Bash 1, Read 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /MCP 1: microsoft-learn 1/ })).toBeDefined()
    await ui.unmount()
  }
})
