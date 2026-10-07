import { expect, test } from 'claude-code/testing'

import { baseName, percentText, safeColor, stack, toSnapshot, tokensText } from './register'
import { breakdown } from './fixture'



test('formats token counts and shares', () => {
  expect(tokensText(842)).toBe('842')
  expect(tokensText(12400)).toBe('12.4k')
  expect(tokensText(1_200_000)).toBe('1.2M')
  expect(percentText(1, 1000)).toBe('<1%')
  expect(percentText(500, 1000)).toBe('50%')
  expect(percentText(0, 0)).toBe('0%')
})

test('shortens paths on either separator', () => {
  expect(baseName('C:\\Users\\me\\.claude\\CLAUDE.md')).toBe('.claude/CLAUDE.md')
  expect(baseName('/repo/CLAUDE.md')).toBe('repo/CLAUDE.md')
})

test('trims the breakdown: biggest memory first, MCP grouped by loaded server', () => {
  const s = toSnapshot(breakdown, 'summary', 1)
  expect(s.memory.map(m => m.label)).toEqual(['repo/CLAUDE.md', '.claude/CLAUDE.md'])
  expect(s.mcp).toEqual([{ label: 'a', note: 'MCP', tokens: 500 }])
  expect(s.compactAt).toBe(184000)
  expect(s.skills).toEqual([])
})

test('stacks used rows into the bar and leaves the rest free', () => {
  const s = toSnapshot(breakdown, 'summary', 1)
  const bar = stack(s.rows, s.max, 50)
  expect(bar.cells.map(c => c.count)).toEqual([1, 8, 4])
  expect(bar.free).toBe(37)
})

test('keeps drawable colours and swaps the rest for the palette', () => {
  expect(safeColor('promptBorder', 0)).toBe('promptBorder')
  expect(safeColor('#AABBCC', 0)).toBe('#AABBCC')
  expect(safeColor('cyan_FOR_SUBAGENTS_ONLY', 0)).toBe('#e06c3c')
  expect(safeColor('', 1)).toBe('#d9a441')
})
