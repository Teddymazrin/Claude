export type StepStatus = 'done' | 'active' | 'todo'
export type Step = { text: string; status: StepStatus }
export type Checklist = { goal: string; steps: Step[]; startedAt?: number; finishedAt?: number }

declare module 'claude-code' {
  interface PluginState {
    'bare-view': {
      checklist: Checklist | null
      showTools: boolean
    }
  }
}
