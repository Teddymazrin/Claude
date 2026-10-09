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
}
/** Something you do yourself: run a command, sign in, check a setting. */
export type Action = {
  kind: 'do'
  text: string
  /** What it gets done or what you are checking for. */
  why?: string
  /** How to do it and what you should see when it worked. */
  detail?: string
  command?: string
  isDone: boolean
}
export type Item = Decision | Action
/** One task's asks: what Claude needs from the person after it. */
export type StepSet = {
  id: string
  title: string
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
      /** The asks whose info (why, how-to, context) is opened, as "a:<set id>:<index>" or "d:<set id>:<index>". */
      info: string[]
    }
  }
}
