import { expect, mock, test } from 'claude-code/testing'

const ABOVE = {
  plugin: 'session-manager',
  component: 'AbovePrompt',
  viewport: { columns: 84, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 80, scroll: { bodyRows: 29 } },
} as const
const MIN = 60_000
const NOTE = '# Handoff: C:\app\n## Goal\nShip the fix'

test('away for an hour: the note is written from the cache once, and the box says so with the note in it', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const forks: string[] = []
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.root', () => ({ value: 'C:\app' }) as never)
  on('session.usage', () => ({ value: { context: { percent: 40 }, rateLimits: [{ kind: 'five_hour', percentUsed: 5 }] } }) as never)
  on('model.fork', ($, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: NOTE, usage: { input_tokens: 10, output_tokens: 50, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 0 } } } as never
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }) as never)
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: 'C:\app', surface: 'terminal', isInteractive: true })
  await $.session.measure({ context: { percent: 40 }, rateLimits: [{ kind: 'five_hour', percentUsed: 5 }], changed: [] } as never)
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', usage: { model: 'claude-opus-5-5' } } as never)

  // Not yet: 50 minutes in, the cache still has 10 left.
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(0)
  // 56 minutes in: written once, and not again.
  await clock.advance(6 * MIN)
  expect(forks.length).toBe(1)
  expect(forks[0]).toContain('No tools are available')
  // The whole note opens in the Handoff pane too.
  expect(opened).toContain('session-manager-handoff')
  await clock.advance(MIN)
  expect(forks.length).toBe(1)

  // Still warm: nothing to warn about, so no box; the note waits in the pane.
  const ui = await $.ui.mount({ ...ABOVE, surface: 'terminal' } as never)
  expect(await ui.find({ key: 'away-note' })).toBeFalsy()
  await ui.unmount()

  // Reading the cache kept it warm for another hour; past that, the box says it ran out.
  await clock.advance(61 * MIN)
  const later = await $.ui.mount({ ...ABOVE, surface: 'terminal' } as never)
  expect(await later.find({ type: 'Text', text: 'Cache ran out while you were away · here is your handoff note' })).toBeTruthy()
  // Just the message and the ways on: the note itself is in the pane.
  expect(await later.find({ type: 'Text', text: 'Ship the fix' })).toBeFalsy()
  for (const key of ['away-copy', 'away-open', 'away-keep']) expect(await later.find({ key })).toBeTruthy()
  // Keep going closes it.
  await later.press({ key: 'away-keep' })
  expect(await later.find({ key: 'away-note' })).toBeFalsy()
  await later.unmount()
})
