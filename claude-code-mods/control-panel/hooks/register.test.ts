import { expect, test } from 'claude-code/testing'

import { EFFORTS, MODELS, applyChoice, meterBar, pickLimit, statusText, untilReset, blurb, chipText, currentText, parentOf, spaced, titled, toggled } from './register'

test('finds the mods folder from a mod root on either separator', () => {
  const win = ['C:', 'mods', 'abc', 'control-panel'].join(String.fromCharCode(92))
  expect(parentOf(win)).toBe(win.slice(0, win.lastIndexOf(String.fromCharCode(92))))
  expect(parentOf('/home/me/mods/control-panel')).toBe('/home/me/mods')
})

test('toggles a mod in and out of the switched-off list', () => {
  expect(toggled([], 'task-checklist')).toEqual(['task-checklist'])
  expect(toggled(['task-checklist'], 'context-window')).toEqual(['context-window', 'task-checklist'])
  expect(toggled(['context-window', 'task-checklist'], 'context-window')).toEqual(['task-checklist'])
})

test('names the model and effort the next request uses', () => {
  expect(currentText({ model: null, effort: null }, null)).toBe('…')
  expect(currentText({ model: 'claude-opus-5-5', effort: 'high' }, null)).toBe('Opus 5.5 · High')
  expect(currentText({ model: null, effort: null }, { model: 'claude-sonnet-5-5', effort: 'xhigh' })).toBe(
    'Sonnet 5.5 · XHigh',
  )
  expect(chipText()).toBe('◆ Control Panel')
})

test('applies only the overrides that are set', () => {
  const req = { model: 'claude-sonnet-5-5', effort: 'medium' }
  expect(applyChoice(req, { model: null, effort: null })).toEqual(req)
  expect(applyChoice(req, { model: 'claude-opus-5-5', effort: 'max' })).toEqual({ model: 'claude-opus-5-5', effort: 'max' })
})

test('formats headings, names and descriptions', () => {
  expect(spaced('Mods')).toBe('M O D S')
  expect(titled('task-checklist')).toBe('Task checklist')
  expect(blurb('Live task checklist. Shows a checklist above the prompt (progress, what is left)')).toBe('Live task checklist')
  expect(blurb('Context Window: a purple chip in the footer, warnings at 50%')).toBe('Purple chip in the footer')
  expect(blurb('Turns every prompt into a live checklist and hides noise')).toBe('Turns every prompt into a…')
  expect(blurb('')).toBe('')
})

test('offers no Auto option for model or effort', () => {
  expect(MODELS.some(m => m.label === 'Auto')).toBe(false)
  expect(EFFORTS.some(f => f.label === 'Auto')).toBe(false)
})

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

test('shows the five-hour window first', () => {
  expect(pickLimit([])).toBe(null)
  expect(
    pickLimit([
      { kind: 'seven_day', percentUsed: 40 },
      { kind: 'five_hour', percentUsed: 6, resetsAt: '2026-10-06T16:00:00Z' },
    ]),
  ).toEqual({ percent: 6, resetsAt: '2026-10-06T16:00:00Z' })
})

test('builds the footer line', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const m = { plan: 'Subscription' as const, context: 1, limit: { percent: 6, resetsAt: '2026-10-06T16:12:00Z' } }
  expect(statusText(m, 'claude-opus-5-5', 'medium', now)).toBe(
    'Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | 6% 4h 12m',
  )
  expect(statusText({ plan: 'API', context: null, limit: null }, null, null, now)).toBe('API | … | effort … | ctx ░░░░░░░░ …')
})
