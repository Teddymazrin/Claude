/** Something Claude needs you to decide or answer. `answer` is set once you have. */
export type Decision = {
  kind: 'decide'
  text: string
  /** One line of context: why it matters, what each choice means. */
  detail?: string
  options: string[]
  /** What you picked; `typing` while you write your own answer in the prompt box. */
  answer?: string
  isTyping?: boolean
  /** True once Claude has the answer, so it is not passed along again. */
  isDelivered?: boolean
  /** Carried over from an earlier call because it was still waiting; shown under "Earlier". */
  isEarlier?: boolean
}
/** Something you do yourself: run a command, sign in, check a setting. */
export type Action = {
  kind: 'do'
  text: string
  command?: string
  /** Saved by 8.1 and earlier: kept on old steps, no longer shown. */
  check?: string
  why?: string
  detail?: string
  warning?: string
  caution?: string
  isDone: boolean
  /** Carried over from an earlier call because it was not done; shown under "Earlier". */
  isEarlier?: boolean
}
export type Item = Decision | Action
/** One task's asks: what Claude needs from the person after it. */
export type StepSet = {
  id: string
  title: string
  /** Saved by 8.1 and earlier, no longer shown. */
  intro?: string
  items: Item[]
  at: number
  /** True once the decisions' answers went back to Claude. */
  isSent?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'action-items': {
      sets: StepSet[]
      /** The set shown in the box above the prompt; null hides it. */
      band: string | null
      /** The tab the person picked; null opens Decide while a question waits, Do after. */
      tab: 'decide' | 'do' | null
      /** Whether ticked actions folded into "✓ N done" are listed again. */
      showDone: boolean
      /** Whether asks carried over from before are listed, or folded into one "N earlier" line. */
      showEarlier: boolean
      /** The question whose info is open, as "<set id>:<index>"; null when none. */
      infoFor: string | null
      /** Whether that info shows in the side pane (true) or a small box under the question. */
      infoInPane: boolean
      /** True once a system prompt this session carries the instructions, so prompts skip the reminder. */
      composed: boolean
      /** True once /action-items opened the box mid-turn; while Claude works it folds to one line otherwise. */
      expanded: boolean
    }
  }
}
