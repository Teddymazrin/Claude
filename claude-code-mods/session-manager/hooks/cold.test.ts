import { expect, test } from 'claude-code/testing'

import { AUTO_LEAD_MS, AWAY_TITLE, shouldAutoNote } from './cold'
import { autoPrompt, isAway } from './handoff'

const HOUR = 60 * 60_000
const last = { at: 0, model: 'claude-opus-5-5' }
const base = { last, ttlMs: HOUR, now: HOUR - 4 * 60_000, context: 40, nextModel: 'claude-opus-5-5[1m]', isBusy: false, noteAt: null }

test('writes the note from the cache once, a few minutes before it goes cold', () => {
  expect(shouldAutoNote(base)).toBe(true)
  // Too early, and too late to finish.
  expect(shouldAutoNote({ ...base, now: HOUR - AUTO_LEAD_MS - 60_000 })).toBe(false)
  expect(shouldAutoNote({ ...base, now: HOUR - 10_000 })).toBe(false)
  expect(shouldAutoNote({ ...base, now: HOUR + 1 })).toBe(false)
  // Already written since the last reply.
  expect(shouldAutoNote({ ...base, noteAt: 5 })).toBe(false)
})

test('skips small chats, running turns, a switched model and the API 5-minute cache', () => {
  expect(shouldAutoNote({ ...base, context: 10 })).toBe(false)
  expect(shouldAutoNote({ ...base, isBusy: true })).toBe(false)
  expect(shouldAutoNote({ ...base, nextModel: 'claude-sonnet-5-5' })).toBe(false)
  expect(shouldAutoNote({ ...base, ttlMs: 5 * 60_000, now: 2 * 60_000 })).toBe(false)
  expect(shouldAutoNote({ ...base, last: null })).toBe(false)
})

test('the away prompt asks for the note itself, since no tools run', () => {
  const p = autoPrompt('C:\work\app', 'today')
  expect(p).toContain('# Handoff: C:\work\app')
  expect(p).toContain('No tools are available')
  expect(p).not.toContain('handoff_note tool')
})

test('the away box says the cache ran out', () => {
  expect(AWAY_TITLE).toBe('Cache ran out while you were away · here is your handoff note')
})

test('/handoff away previews the away box', () => {
  expect(isAway('away')).toBe(true)
  expect(isAway(' away cold ')).toBe(true)
  expect(isAway('ask 50')).toBe(false)
  expect(isAway('')).toBe(false)
})
