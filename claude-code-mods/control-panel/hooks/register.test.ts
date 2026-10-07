import { expect, test } from 'claude-code/testing'

import { EFFORTS, MODELS, QUICK, SETTINGS, isSetting, settingRows, visibleQuick, applyChoice, debouncer, installedKey, installedRoots, isInstalled, withPluginEnabled, meterBar, baseModel, cacheText, cacheTtlMs, pickLimit, pickWeek, resetText, statusText, untilReset, blurb, chipText, currentText, parentOf, spaced, titled, toggled } from './register'

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
  const m = { plan: 'Subscription' as const, context: 1, limit: { percent: 6, resetsAt: '2026-10-06T16:12:00Z' }, week: null }
  expect(statusText(m, 'claude-opus-5-5', 'medium', now)).toBe(
    'Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | usage 6% · resets 4h12m',
  )
  const both = { ...m, week: { percent: 31.4, resetsAt: '2026-10-07T03:00:00Z' } }
  expect(statusText(both, 'claude-opus-5-5', 'medium', now)).toBe(
    'Subscription | Opus 5.5 | effort Medium | ctx ░░░░░░░░ 1% | usage 6% · resets 4h12m | weekly 31% · resets 15h',
  )
  expect(statusText({ plan: 'API', context: null, limit: null, week: null }, null, null, now)).toBe('API | … | effort … | ctx ░░░░░░░░ …')
})

test('reads installed plugin folders and tells them from dev folders', () => {
  const json = JSON.stringify({
    version: 2,
    plugins: { 'a@m': [{ installPath: 'C:\\Users\\me\\.claude\\plugins\\cache\\m\\a\\1.0.0' }], 'b@m': [{}] },
  })
  expect(installedRoots(json)).toEqual(['C:\\Users\\me\\.claude\\plugins\\cache\\m\\a\\1.0.0'])
  expect(installedRoots('not json')).toEqual([])
  expect(isInstalled('C:\\Users\\me\\.claude\\plugins\\cache\\m\\a\\1.0.0')).toBe(true)
  expect(isInstalled('/home/me/.claude/dev-mods/abc/a')).toBe(false)
})

test('finds the key an installed plugin is enabled under', () => {
  const json = JSON.stringify({ plugins: { 'bare-view@mods': [{}], 'bare@other': [{}] } })
  expect(installedKey(json, 'bare-view')).toBe('bare-view@mods')
  expect(installedKey(json, 'bare')).toBe('bare@other')
  expect(installedKey(json, 'missing')).toBeUndefined()
  expect(installedKey('not json', 'bare-view')).toBeUndefined()
})

test('switches a plugin in enabledPlugins and keeps the rest of settings', () => {
  const settings = JSON.stringify({ model: 'x', enabledPlugins: { 'a@m': true, 'b@m': true } })
  expect(JSON.parse(withPluginEnabled(settings, 'a@m', false)!)).toEqual({ model: 'x', enabledPlugins: { 'a@m': false, 'b@m': true } })
  expect(JSON.parse(withPluginEnabled('{}', 'a@m', true)!)).toEqual({ enabledPlugins: { 'a@m': true } })
  expect(withPluginEnabled('not json', 'a@m', false)).toBeUndefined()
  expect(withPluginEnabled('[]', 'a@m', false)).toBeUndefined()
})

test('runs one reload after a burst of switches, with the last one', () => {
  const timers: Array<{ fn: () => void; isCancelled: boolean }> = []
  const after = (_ms: number, fn: () => void) => {
    const timer = { fn, isCancelled: false }
    timers.push(timer)
    return { cancel: () => { timer.isCancelled = true } }
  }
  const fired: string[] = []
  const schedule = debouncer(1500)
  schedule(after, () => fired.push('off'))
  schedule(after, () => fired.push('on'))
  for (const timer of timers) if (!timer.isCancelled) timer.fn()
  expect(fired).toEqual(['on'])
  schedule(after, () => fired.push('again'))
  timers[timers.length - 1]?.fn()
  expect(fired).toEqual(['on', 'again'])
})

test('quick commands are plain buttons and only /clear asks first', () => {
  for (const q of QUICK) expect('hotkey' in q).toBe(false)
  expect(QUICK.map(q => q.command)).toEqual(['context-lens', 'reload-plugins', 'clear'])
  expect(QUICK.filter(q => q.confirm).map(q => q.command)).toEqual(['clear'])
})

test('reads the weekly window apart from the five-hour one', () => {
  const limits = [
    { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-09T15:00:00Z' },
    { kind: 'five_hour', percentUsed: 6 },
  ]
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

test('counts down to the prompt cache going cold', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const hour = cacheTtlMs('Subscription')
  expect(hour).toBe(3_600_000)
  expect(cacheTtlMs('API')).toBe(300_000)
  expect(cacheText(null, hour, now)).toBe('')
  expect(cacheText(now - 18 * 60_000, hour, now)).toBe('cache 42m')
  expect(cacheText(now - hour + 30_000, hour, now)).toBe('cache <1m')
  expect(cacheText(now - hour, hour, now)).toBe('cache cold')
  const m = { plan: 'API' as const, context: 1, limit: null, week: null }
  expect(statusText(m, null, null, now, 'cache 4m')).toBe('API | … | effort … | ctx ░░░░░░░░ 1% | cache 4m')
})

test('a different model starts with a cold cache', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')
  const hour = cacheTtlMs('Subscription')
  const last = { at: now - 18 * 60_000, model: 'claude-opus-5-5' }
  expect(baseModel('claude-opus-5-5[1m]')).toBe('claude-opus-5-5')
  expect(baseModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
  expect(cacheText(last, hour, now, 'claude-opus-5-5')).toBe('cache 42m')
  expect(cacheText(last, hour, now, 'claude-opus-5-5[1m]')).toBe('cache 42m')
  expect(cacheText(last, hour, now, 'claude-sonnet-5-5')).toBe('cache cold · new model')
  expect(cacheText(last, hour, now)).toBe('cache 42m')
  expect(cacheText(now - 18 * 60_000, hour, now, 'claude-sonnet-5-5')).toBe('cache 42m')
})

test('shows Context Lens only while its command is loaded', () => {
  expect(visibleQuick([]).map(q => q.command)).toEqual(['reload-plugins', 'clear'])
  expect(visibleQuick(['context-lens']).map(q => q.command)).toEqual(['context-lens', 'reload-plugins', 'clear'])
  expect(visibleQuick(['context-lens:context-lens']).map(q => q.command)).toEqual(['context-lens', 'reload-plugins', 'clear'])
})

test('every action says what it does', () => {
  for (const q of QUICK) {
    expect(q.blurb.length).toBeGreaterThan(10)
    expect(['Run', 'Open']).toContain(q.verb)
  }
})

test('settings list only Bare View and Guard Rails, in order, with short lines', () => {
  const list = [{ name: 'guard-rails' }, { name: 'action-steps' }, { name: 'bare-view' }, { name: 'context-lens' }]
  expect(settingRows(list).map(row => row.mod.name)).toEqual(['bare-view', 'guard-rails'])
  expect(settingRows([{ name: 'action-steps' }])).toEqual([])
  expect(isSetting('context-handoff')).toBe(false)
  for (const s of SETTINGS) expect(s.line.length).toBeLessThanOrEqual(36)
})
