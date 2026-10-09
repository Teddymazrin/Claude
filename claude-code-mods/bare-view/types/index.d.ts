/** `failed`: Claude marked the step's result as not achieved; a tool call's error alone never makes one. */
export type StepStatus = 'done' | 'active' | 'todo' | 'failed'
/** One tool call made while a step was open: the tool, what it did, whether it failed, how long it took and the first line it returned. */
export type Call = { id: string; tool: string; detail: string; isError?: boolean; ms?: number; preview?: string }
/** `reason`, on a failed step: what went wrong, in Claude's words, shown under it. */
export type Step = { text: string; status: StepStatus; reason?: string; calls?: Call[] }
/**
 * Tool calls made since the prompt: all of them, the built-in ones by tool name,
 * the MCP ones by server, and the one running right now.
 */
export type Tally = { total: number; mcp: Record<string, number>; builtIn?: Record<string, number>; running?: string }
/** A group of the tally row that expands to list its tools. */
export type TallyKey = 'builtIn' | 'mcp'
/** `early` holds calls made before the plan arrived; they join its first step. */
export type Checklist = { goal: string; steps: Step[]; startedAt?: number; finishedAt?: number; tally?: Tally; early?: Call[] }
/** What the model is doing right now: waiting on a reply, thinking, writing, starting a tool call, a tool running, or a tool waiting on the person's approval. */
export type Phase = 'waiting' | 'thinking' | 'writing' | 'calling' | 'running' | 'approval'
/** The activity row: the main loop's phase since `since`, the tool it is about, and how many subagents are mid-request. */
export type Activity = { phase: Phase; since: number; tool?: string; agents?: number }

declare module 'claude-code' {
  interface PluginState {
    'bare-view': {
      checklist: Checklist | null
      showTools: boolean
      /** The step whose tool calls are shown under it; null for none. */
      peek: number | null
      /** The tally groups expanded to list their tools. */
      openTally: TallyKey[]
      /** What the model is doing this moment; null between turns. */
      activity: Activity | null
      /** True when a finished checklist is opened out in full; finished, it folds to one line. */
      unfolded: boolean
      /** True once a system prompt this session carries the instructions, so prompts skip the reminder. */
      composed: boolean
    }
  }
}
