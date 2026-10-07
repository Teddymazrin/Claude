import type { SessionContextBreakdown } from 'claude-code'

export const breakdown = {
  categories: [
    { name: 'System prompt', tokens: 4000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 30000, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 150000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 16000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 34000,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  autocompactSource: 'auto',
  percentage: 17,
  gridRows: [],
  model: 'Opus 5.5',
  memoryFiles: [
    { path: 'C:\\Users\\me\\.claude\\CLAUDE.md', type: 'User', tokens: 900 },
    { path: '/repo/CLAUDE.md', type: 'Project', tokens: 2100 },
  ],
  mcpTools: [
    { name: 'mcp__a__x', serverName: 'a', tokens: 300, isLoaded: true },
    { name: 'mcp__a__y', serverName: 'a', tokens: 200, isLoaded: true },
    { name: 'mcp__b__z', serverName: 'b', tokens: 999, isLoaded: false },
  ],
  agents: [],
  isAutoCompactEnabled: true,
  autoCompactThreshold: 184000,
  apiUsage: null,
} as unknown as SessionContextBreakdown
