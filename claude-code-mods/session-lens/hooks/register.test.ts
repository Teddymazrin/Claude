import { expect, test } from 'claude-code/testing'

import { baseModel, cacheText, cacheTtlMs, meterBar, modelName, nextRequest, pickLimit, pickWeek, resetText, statusText, untilReset } from './register'

test('draws the context bar and the time to the usage reset', () => {
  expect(meterBar(1)).toEqual({ filled: '', empty: '░░░░░░░░' })
  expect(meterBar(50)).toEqual({ filled: '████', empty: '░░░░' })
  expect(meterBar(140).filled.length).toBe(8)
  const now = Date.parse('2026-10-06T12:00:00Z')
  expect(untilReset('2026-10-06T16:12:00Z', now)).toBe('4h 12m')
  expect(untilReset('2026-10-06T12:30:00Z', now)).toBe('30m')
  expect(untilReset('2026-10-09T15:00:00Z', now)).toBe('3d 3h')
  expect(untilReset(undefined, now)).toBe('')
})

test('shows the five-hour window first, the weekly one apart', () => {
  expect(pickLimit([])).toBe(null)
  const limits = [
    { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-09T15:00:00Z' },
    { kind: 'five_hour', percentUsed: 6, resetsAt: '2026-10-06T16:00:00Z' },
  ]
  expect(pickLimit(limits)).toEqual({ percent: 6, resetsAt: '2026-10-06T16:00:00Z' })
  expect(pickWeek(limits)).toEqual({ percent: 40, resetsAt: '2026-10-09T15:00:00Z' })
  expect(pickWeek([{ kind: 'five_hour', percentUsed: 6 }])).toBe(null)
  expect(pickLimit([{ kind: 'seven_day', percentUsed: 40 }])).toBe(null)
})

test('shows a reset as a countdown under a day, else the weekday', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  expect(resetText('2026-10-06T16:12:00Z', now)).toBe('4h12m')
  expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(resetText('2026-10-09T15:00:00Z', now))
  expect(resetText(undefined, now)).toBe('')
})

test('builds the status row', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const m = { plan: 'Subscription' as const, context: 1, limit: { percent: 6, resetsAt: '2026-10-06T16:12:00Z' }, week: null }
  expect(statusText(m, 'claude-opus-5-5', 'medium', now)).toBe(
    'Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | usage 6% · resets 4h12m',
  )
  const both = { ...m, week: { percent: 31.4, resetsAt: '2026-10-07T03:00:00Z' } }
  expect(statusText(both, 'claude-opus-5-5[1m]', 'medium', now)).toBe(
    'Subscription | Opus 5.5 1M | effort Medium | ctx ░░░░░░░░ 1% | usage 6% · resets 4h12m | weekly 31% · resets 15h',
  )
  expect(statusText({ plan: 'API', context: null, limit: null, week: null }, null, null, now)).toBe('API | … | effort … | ctx ░░░░░░░░ …')
  expect(statusText({ plan: 'API', context: 1, limit: null, week: null }, null, null, now, 'cache 4m')).toBe('API | … | effort … | ctx ░░░░░░░░ 1% | cache 4m')
})

test('counts down to the prompt cache going cold, and a new model starts cold', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const hour = cacheTtlMs('Subscription')
  expect(hour).toBe(3_600_000)
  expect(cacheTtlMs('API')).toBe(300_000)
  const last = { at: now - 18 * 60_000, model: 'claude-opus-5-5' }
  expect(cacheText(null, hour, now)).toBe('')
  expect(cacheText(last, hour, now)).toBe('cache 42m')
  expect(cacheText({ ...last, at: now - hour + 30_000 }, hour, now)).toBe('cache <1m')
  expect(cacheText({ ...last, at: now - hour }, hour, now)).toBe('cache cold')
  expect(cacheText(last, hour, now, 'claude-opus-5-5[1m]')).toBe('cache 42m')
  expect(cacheText(last, hour, now, 'claude-sonnet-5-5')).toBe('cache cold · new model')
  expect(baseModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
})

test('a cold cache on a big chat warns that the next message uses extra usage', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const row = (context: number, cache: string) => statusText({ plan: 'Subscription', context, limit: null, week: null }, 'claude-opus-5-5', 'medium', now, cache)
  expect(row(39, 'cache cold')).toBe('Subscription | Opus 5.5 | effort Medium | ctx ███░░░░░ 39% | cache cold')
  expect(row(40, 'cache cold')).toBe(
    'Subscription | Opus 5.5 | effort Medium | ctx ███░░░░░ 40% | cache cold ⚠ your next message re-reads the entire chat at full price and uses more of your usage · /handoff to start fresh',
  )
  expect(row(60, 'cache cold · new model')).toContain('cache cold · new model ⚠ your next message re-reads the entire chat at full price')
  expect(row(80, 'cache 42m')).toBe('Subscription | Opus 5.5 | effort Medium | ctx ██████░░ 80% | cache 42m')
})

test("the next request: Control Panel's pick, else what was sent, else the session's model", () => {
  expect(nextRequest(undefined, null)).toEqual({ model: null, effort: null })
  expect(nextRequest(undefined, null, 'claude-sonnet-5-5')).toEqual({ model: 'claude-sonnet-5-5', effort: null })
  expect(nextRequest(undefined, { model: 'claude-opus-5-5', effort: 'high' }, 'claude-sonnet-5-5')).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  expect(nextRequest({ model: 'claude-fable-5-1', effort: null }, { model: 'claude-opus-5-5', effort: 'high' })).toEqual({ model: 'claude-fable-5-1', effort: 'high' })
  expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
})
