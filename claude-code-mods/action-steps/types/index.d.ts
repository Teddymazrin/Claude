export type NextStep = { text: string; command?: string; isDone: boolean }
/** One task's follow-up: what the person does after it. */
export type StepSet = { id: string; title: string; steps: NextStep[]; at: number }

declare module 'claude-code' {
  interface PluginState {
    'action-steps': {
      sets: StepSet[]
      /** The set shown expanded; null shows the newest. */
      expanded: string | null
      /** The set shown above the prompt when the side pane cannot open; null hides it. */
      band: string | null
    }
  }
}
