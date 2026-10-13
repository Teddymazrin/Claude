import { expect, test } from 'claude-code/testing'

import { baseModel, cacheMinsLeft, cacheText, meterPieces, pickLimit, pickWeek, resetText } from './register'

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
  // A switch to another model inside the hour is cold too, not '<1m'.
  expect(cacheText(0, last, 0, HOUR, true)).toBe('cache cold')
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

test('the footer line: context, cache, 5-hour with its reset, weekly', () => {
  const now = Date.parse('2026-10-12T00:00:00Z')
  const m = {
    plan: 'Subscription' as const,
    context: 12,
    limit: { percent: 1, resetsAt: '2026-10-12T04:42:00Z' },
    week: { percent: 34, resetsAt: '2026-10-16T00:00:00Z' },
  }
  const line = meterPieces(m, { at: now - 18 * 60_000, model: 'claude-opus-5-5' }, now, 'claude-opus-5-5')
    .map(p => `${p.label} ${p.value}${p.note ? ` (${p.note})` : ''}`)
    .join(' · ')
  expect(line).toBe('ctx 12% · cache 42m · 5h 1% (4h42m) · week 34%')
  expect(meterPieces({ plan: null, context: null, limit: null, week: null }, null, now).map(p => p.value)).toEqual(['…'])
})

test('a cold cache warns that the next message re-reads the chat at full price, however small the chat', () => {
  const now = Date.parse('2026-10-12T00:00:00Z')
  const cold = { at: now - 2 * HOUR, model: 'claude-opus-5-5' }
  const cache = (context: number) =>
    meterPieces({ plan: 'Subscription', context, limit: null, week: null }, cold, now, 'claude-opus-5-5').find(p => p.key === 'cache')?.value
  expect(cache(6)).toBe('cold ⚠ your next message re-reads the entire chat at full price and uses more of your usage · /handoff to start fresh')
  const warm = meterPieces({ plan: 'Subscription', context: 80, limit: null, week: null }, { at: now - 18 * 60_000, model: 'claude-opus-5-5' }, now)
  expect(warm.find(p => p.key === 'cache')?.value).toBe('42m')
})

test('the line shows in the app as plain text, not in the terminal', async ($, on) => {
  on('clock.now', () => ({ value: 5_000 }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const app = await $.ui.mount({ plugin: 'session-meter', surface: 'desktop', ...FOOTER } as never)
  expect(await app.find({ key: 'session-meter' })).toBeDefined()
  expect(await app.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  expect(await app.find({ type: 'Button' })).toBeUndefined()

  const terminal = await $.ui.mount({ plugin: 'session-meter', surface: 'terminal', ...FOOTER } as never)
  expect(await terminal.find({ key: 'session-meter' })).toBeUndefined()
})
