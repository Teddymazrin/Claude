export type Detail = 'summary' | 'full'
export type Row = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' | 'deferred' }
export type Item = { label: string; note: string; tokens: number }
export type Snapshot = {
  at: number
  detail: Detail
  model: string
  total: number
  max: number
  percent: number
  compactAt: number | null
  rows: Row[]
  memory: Item[]
  mcp: Item[]
  skills: Item[]
  agents: Item[]
  skillCount: { total: number; listed: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-lens': { snapshot: Snapshot | null; busy: boolean; expanded: string[] }
  }
}
