import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  viewport: { columns: 160, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 156, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('each tally group expands to list its tools', async ($, on) => {
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
    expect(await ui.find({ type: 'Text', text: /3 tool calls/ })).toBeTruthy()
    // Collapsed, each group is just its count.
    expect(await ui.find({ key: 'tally-builtIn' })).toBeTruthy()
    expect(await ui.find({ key: 'tally-mcp' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /microsoft_docs_search/ })).toBeFalsy()
    await ui.press({ key: 'tally-mcp' })
    expect(await ui.find({ type: 'Text', text: /microsoft-learn › microsoft_docs_search/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /› Bash 1/ })).toBeFalsy()
    await ui.press({ key: 'tally-builtIn' })
    expect(await ui.find({ type: 'Text', text: /› Bash 1/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /› Read 1/ })).toBeTruthy()
    // Pressed again, they fold back up.
    await ui.press({ key: 'tally-mcp' })
    await ui.press({ key: 'tally-builtIn' })
    expect(await ui.find({ type: 'Text', text: /microsoft_docs_search/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /› Bash 1/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('pressing a step peeks at its tool calls, and again hides them', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', ($, e) => (e.tool === 'Read' ? { result: 'nope', isError: true } : { result: 'ok' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({
    tool: 'mcp__bare-view__checklist',
    goal: 'Peek test',
    steps: [{ text: 'Look around', status: 'active' }, { text: 'Finish', status: 'todo' }],
  } as never)
  await $.tool.call({ tool: 'Bash', command: 'git status', tool_use_id: 't1' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/repo/missing.md', tool_use_id: 't2' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: /git status/ })).toBeFalsy()
    await ui.press({ key: 'peek-0' })
    expect(await ui.find({ type: 'Text', text: /git status/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /missing\.md/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '✗ ' })).toBeTruthy()
    // What each call returned, and how long it took, show under it.
    expect(await ui.find({ type: 'Text', text: /↳ nope/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '0ms' })).toBeTruthy()
    await ui.press({ key: 'peek-0' })
    expect(await ui.find({ type: 'Text', text: /git status/ })).toBeFalsy()
    expect(await ui.find({ key: 'peek-1' })).toBeFalsy()
    await ui.unmount()
  }
})

test('the activity row names the running tool, not its command, even with no checklist, and only while working', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const seen: boolean[] = []
  // Stands for the engine: looks at the band while the tool is still running.
  on('tool.call', async () => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND } as never)
      seen.push(Boolean(await ui.find({ type: 'Text', text: 'Running Bash' })))
      seen.push(Boolean(await ui.find({ type: 'Text', text: /npm test/ })))
      await ui.unmount()
    }
    return { result: 'ok' }
  })

  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'a1' } as never)
  expect(seen).toEqual([true, false, true, false])

  for (const surface of ['terminal', 'desktop'] as const) {
    // The call is over: the model is reading what it returned.
    const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND } as never)
    expect(await ui.find({ type: 'Text', text: 'Waiting for the model' })).toBeTruthy()
    await ui.unmount()
    // Between turns there is nothing to show.
    const idle = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND, props: { ...BAND.props, isWorking: false } } as never)
    expect(await idle.find({ type: 'Text', text: 'Waiting for the model' })).toBeFalsy()
    await idle.unmount()
  }
})

test('a call waiting at the permission dialog reads as waiting for you, not running', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  // No settings hook decides: the dialog would show.
  on('classic.PermissionRequest', () => ({}))
  const seen: boolean[] = []
  // Stands for the engine: raises the dialog's hook mid-call, then looks at the band.
  on('tool.call', async () => {
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm publish' } })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND } as never)
      seen.push(Boolean(await ui.find({ type: 'Text', text: 'Waiting for you to approve Bash' })))
      seen.push(Boolean(await ui.find({ type: 'Text', text: /npm publish/ })))
      seen.push(Boolean(await ui.find({ type: 'Text', text: 'Running Bash' })))
      await ui.unmount()
    }
    return { result: 'ok' }
  })

  await $.tool.call({ tool: 'Bash', command: 'npm publish', tool_use_id: 'p1' } as never)
  expect(seen).toEqual([true, false, false, true, false, false])
})

test('a finished checklist folds to one line, and opens out and folds back on a press', async ($, on) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', ($, e) => (e.tool === 'Read' ? { result: 'nope', isError: true } : { result: 'ok' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.tool.call({
    tool: 'mcp__bare-view__checklist',
    goal: 'Fold test',
    steps: [{ text: 'Look around', status: 'active' }, { text: 'Finish', status: 'todo' }],
  } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'f1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'gone.md', tool_use_id: 'f2' } as never)
  await $.tool.call({
    tool: 'mcp__bare-view__checklist',
    goal: 'Fold test',
    steps: [{ text: 'Look around', status: 'done' }, { text: 'Finish', status: 'done' }],
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'bare-view', surface, ...BAND, props: { ...BAND.props, isWorking: false } } as never)
    expect(await ui.find({ key: 'unfold' })).toBeTruthy()
    expect(await ui.find({ key: 'peek-0' })).toBeFalsy()
    await ui.press({ key: 'unfold' })
    expect(await ui.find({ key: 'peek-0' })).toBeTruthy()
    expect(await ui.find({ key: 'fold' })).toBeTruthy()
    await ui.press({ key: 'fold' })
    expect(await ui.find({ key: 'peek-0' })).toBeFalsy()
    expect(await ui.find({ key: 'unfold' })).toBeTruthy()
    await ui.unmount()
  }
})
