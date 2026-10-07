import { expect, test } from 'claude-code/testing'

import { LEVELS, levelFor, noteName, resumePrompt, warningText, writePrompt } from './register'

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
  expect(warningText(88, 85)).toBe('Context 88% full · run /handoff now, then /clear and /handoff-resume')
})

test('names one note file per project folder', () => {
  expect(noteName('C:\\Users\\PC\\Desktop\\MODS TEST')).toBe('C-Users-PC-Desktop-MODS-TEST.md')
  expect(noteName('/home/me/app')).toBe('home-me-app.md')
  expect(noteName('/')).toBe('project.md')
})

test('asks for every section and the path in the prompts', () => {
  const text = writePrompt('/home/me/.claude/handoffs/app.md', '/home/me/app', 'today')
  for (const part of ['/home/me/.claude/handoffs/app.md', '# Handoff: /home/me/app', 'Written today', '## Goal', '## Done', '## In progress', '## Next steps', '## Key files', '## Decisions and gotchas']) {
    expect(text).toContain(part)
  }
  expect(resumePrompt('/x/app.md')).toContain('/x/app.md')
  expect(resumePrompt('/x/app.md')).toContain('wait for me to confirm')
})
