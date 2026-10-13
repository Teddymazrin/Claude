import { expect, test } from 'claude-code/testing'

import { baseModel, cacheMinsLeft, cacheText, pickLimit, pickWeek, resetText } from './register'

const HOUR = 60 * 60_000
const FOOTER = { component: 'SessionMode', viewport: { columns: 100, rows: 40 }, props: { modes: [] } } as const

test('the cache counts down from the last reply and goes cold on a new model', () => {
  const last = { at: 0, model: 'claude-opus-5-5' }
  expect(cacheMinsLeft(null, HOUR, 0)).toBeNull()
  expect(cacheMinsLeft(last, HOUR, 18 * 60_000, 'claude-opus-5-5[1m]')).toBe(42)
  expect(cacheMinsLeft(last, HOUR, 0, 'claude-sonnet-5-5')).toBe(0)
  expect(cacheText(42, last, 18 * 60_000, HOUR)).toBe('cache 42m')
  expect(cacheText(0, last, HOUR - 30_000, HOUR)).toBe('cache <1m')
  expect(cacheText(0, last, 2 * HOUR, HOUR)).toBe('cache cold')
  expect(baseModel('claude-opus-5-5-20260101')).toBe('claude-opus-5-5')
})

test('usage windows and their resets', () => {
  const limits = [
    { kind: 'seven_day', percentUsed: 31, resetsAt: '2026-10-20T00:00:00Z' },
    { kind: 'five_hour', percentUsed: 6, resetsAt: '2026-10-12T04:12:00Z' },
  ]
  expect(pickLimit(limits)?.percent).toBe(6)
  expect(pickWeek(limits)?.percent).toBe(31)
  expect(resetText('2026-10-12T04:12:00Z', Date.parse('2026-10-12T00:00:00Z'))).toBe('4h12m')
  expect(resetText('2026-10-12T00:38:00Z', Date.parse('2026-10-12T00:00:00Z'))).toBe('38m')
  expect(resetText(undefined, 0)).toBe('')
})

test('the chip shows in the app, not in the terminal, and a click opens the resets', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const app = await $.ui.mount({ plugin: 'session-meter', surface: 'desktop', ...FOOTER } as never)
  expect(await app.find({ key: 'session-meter-toggle' })).toBeDefined()
  expect(await app.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  await app.press({ key: 'session-meter-toggle' })
  expect(await app.find({ key: 'session-meter-details' })).toBeDefined()

  const terminal = await $.ui.mount({ plugin: 'session-meter', surface: 'terminal', ...FOOTER } as never)
  expect(await terminal.find({ key: 'session-meter-toggle' })).toBeUndefined()
})
