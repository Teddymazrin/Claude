export type StepStatus = 'done' | 'active' | 'todo'
/** One tool call made while a step was open: the tool, what it did, whether it failed, how long it took and the first line it returned. */
export type Call = { id: string; tool: string; detail: string; isError?: boolean; ms?: number; preview?: string }
export type Step = { text: string; status: StepStatus; calls?: Call[] }
/**
 * Tool calls made since the prompt: all of them, the built-in ones by tool name,
 * the MCP ones by server, and the one running right now.
 */
export type Tally = { total: number; mcp: Record<string, number>; builtIn?: Record<string, number>; running?: string }
/** A group of the tally row that expands to list its tools. */
export type TallyKey = 'builtIn' | 'mcp'
/** `early` holds calls made before the plan arrived; they join its first step. */
export type Checklist = { goal: string; steps: Step[]; startedAt?: number; finishedAt?: number; tally?: Tally; early?: Call[] }

declare module 'claude-code' {
  interface PluginState {
    'bare-view': {
      checklist: Checklist | null
      showTools: boolean
      /** The step whose tool calls are shown under it; null for none. */
      peek: number | null
      /** The tally groups expanded to list their tools. */
      openTally: TallyKey[]
    }
  }
}
