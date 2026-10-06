export type StepStatus = 'done' | 'active' | 'todo'
export type Step = { text: string; status: StepStatus }
/** Tool calls made since the prompt: all of them, and the MCP ones by server. */
export type Tally = { total: number; mcp: Record<string, number> }
export type Checklist = { goal: string; steps: Step[]; startedAt?: number; finishedAt?: number; tally?: Tally }

declare module 'claude-code' {
  interface PluginState {
    'bare-view': {
      checklist: Checklist | null
      showTools: boolean
    }
  }
}
