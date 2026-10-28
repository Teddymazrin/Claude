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
  /** STE's check on the result, one sentence starting "Make sure that". */
  check?: string
  /** From 7.2 and earlier: the reason and the how-to, no longer shown. */
  why?: string
  detail?: string
  command?: string
  /** STE safety notices, shown before the step: risk to people, and risk to data, a service or access. */
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
  /** What the steps do and what you need first, said once (STE procedure intro). */
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
      /** The action opened in full in a short box, as "<set id>:<index>"; null opens the next one. */
      focus: string | null
      /** Whether ticked actions folded into "✓ N done" are listed again. */
      showDone: boolean
      /** Info opened by hand ("a:<set id>:<index>", "d:..."), or closed by hand ("x:a:...") where it opens by itself. */
      info: string[]
      /** True once a system prompt this session carries the instructions, so prompts skip the reminder. */
      composed: boolean
      /** True once /action-items opened the box mid-turn; while Claude works it folds to one line otherwise. */
      expanded: boolean
    }
  }
}
