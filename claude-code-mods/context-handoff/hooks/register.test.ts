import { expect, test } from 'claude-code/testing'

import { KEEP, LEVELS, copyPrompt, isOpen, kept, levelFor, sameRoot, warningText, writePrompt } from './register'

test('warns once at each level the context reaches', () => {
  expect(LEVELS).toEqual([70, 85])
  expect(levelFor(10)).toBe(0)
  expect(levelFor(69)).toBe(0)
  expect(levelFor(70)).toBe(70)
  expect(levelFor(84)).toBe(70)
  expect(levelFor(91)).toBe(85)
})

test('gets more urgent at the last level', () => {
  expect(warningText(72, 70)).toBe('Context 72% full · /handoff saves a handoff note before it fills')
  expect(warningText(88, 85)).toBe('Context 88% full · run /handoff now, then copy the prompt and /clear')
})

test('knows a project whichever way its folder is spelled', () => {
  expect(sameRoot('C:\\Users\\PC\\app', 'c:/users/pc/app/')).toBe(true)
  expect(sameRoot('C:\\Users\\PC\\app', 'C:\\Users\\PC\\other')).toBe(false)
})

test('keeps one note per project, newest first, at most KEEP', () => {
  const note = (root: string, at: number) => ({ root, text: `${root} ${at}`, at })
  let notes = [note('C:\\a', 1), note('C:\\b', 2)]
  notes = kept(notes, note('c:/a', 3))
  expect(notes.map(n => n.text)).toEqual(['c:/a 3', 'C:\\b 2'])
  for (let i = 0; i < KEEP + 5; i++) notes = kept(notes, note(`C:\\p${i}`, 10 + i))
  expect(notes.length).toBe(KEEP)
  expect(notes[0]?.root).toBe(`C:\\p${KEEP + 4}`)
})

test('opens the saved note only when asked to', () => {
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
