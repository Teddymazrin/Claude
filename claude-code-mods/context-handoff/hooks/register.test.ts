import { expect, test } from 'claude-code/testing'

import { LEVELS, copyPrompt, isOpen, levelFor, noteName, samePath, warningText, writePrompt } from './register'

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

test('names one note file per project folder', () => {
  expect(noteName('C:\\Users\\PC\\Desktop\\MODS TEST')).toBe('C-Users-PC-Desktop-MODS-TEST.md')
  expect(noteName('/home/me/app')).toBe('home-me-app.md')
  expect(noteName('/')).toBe('project.md')
})

test('knows the note whichever way its path is spelled', () => {
  const path = 'C:/Users/PC/.claude/handoffs/app.md'
  expect(samePath('C:\\Users\\PC\\.claude\\handoffs\\app.md', path)).toBe(true)
  expect(samePath('c:/users/pc/.claude/handoffs/APP.md', path)).toBe(true)
  expect(samePath('C:/Users/PC/.claude/handoffs/other.md', path)).toBe(false)
})

test('opens the saved note only when asked to', () => {
  expect(isOpen('open')).toBe(true)
  expect(isOpen(' View ')).toBe(true)
  expect(isOpen('')).toBe(false)
  expect(isOpen('please')).toBe(false)
})

test('asks for every section and keeps the reply short', () => {
  const text = writePrompt('/home/me/.claude/handoffs/app.md', '/home/me/app', 'today')
  for (const part of ['/home/me/.claude/handoffs/app.md', '# Handoff: /home/me/app', 'Written today', '## Goal', '## Done', '## In progress', '## Next steps', '## Key files', '## Decisions and gotchas', 'one short line']) {
    expect(text).toContain(part)
  }
  expect(copyPrompt('/x/app.md')).toContain('/x/app.md')
  expect(copyPrompt('/x/app.md')).toContain('wait for me to confirm')
})
