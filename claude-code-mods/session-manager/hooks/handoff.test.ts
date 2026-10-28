import { expect, test } from 'claude-code/testing'

import { LEVELS, copyPrompt, isOpen, levelFor, offerText, writePrompt } from './handoff'

test('offers once at each level the context reaches', () => {
  expect(LEVELS).toEqual([50, 65, 80])
  expect(levelFor(10)).toBe(0)
  expect(levelFor(49)).toBe(0)
  expect(levelFor(50)).toBe(50)
  expect(levelFor(64)).toBe(50)
  expect(levelFor(65)).toBe(65)
  expect(levelFor(91)).toBe(80)
})

test('says why, more urgently at each level', () => {
  expect(offerText(52)).toBe('This chat is 52% full · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?')
  expect(offerText(67)).toBe('This chat is 67% full · Every message now costs more usage, and Claude may start missing details. Start fresh at your next break.')
  expect(offerText(83)).toBe('This chat is 83% full · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now.')
  expect(offerText(3)).toBe('This chat is 3% full · Long chats use up more of your usage and Claude gets less sharp. Start fresh with a summary?')
})

test('opens the note again only when asked to', () => {
  expect(isOpen('open')).toBe(true)
  expect(isOpen(' View ')).toBe(true)
  expect(isOpen('')).toBe(false)
  expect(isOpen('please')).toBe(false)
})

test('asks for every section through the tool, never a file', () => {
  const text = writePrompt('C:\\work\\app', 'today')
  for (const part of ['handoff_note tool', "Don't write it to a file", '# Handoff: C:\\work\\app', 'Written today', '## Goal', '## Done', '## In progress', '## Next steps', '## Key files', '## Decisions and gotchas', 'one short line']) {
    expect(text).toContain(part)
  }
})

test('the copied prompt carries the whole note', () => {
  const prompt = copyPrompt('# Handoff\n## Next steps\n1. Ship it')
  expect(prompt.startsWith("Here's a handoff note from my last session.")).toBe(true)
  expect(prompt).toContain('wait for me to confirm')
  expect(prompt.endsWith('# Handoff\n## Next steps\n1. Ship it')).toBe(true)
})
