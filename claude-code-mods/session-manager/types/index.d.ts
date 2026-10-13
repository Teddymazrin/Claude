export type Plan = 'Subscription' | 'API'
/** The model and effort the last main-thread request went out with. */
export type Seen = { model: string; effort: string | null }
/** When the main thread's last reply landed, and which model gave it: the prompt cache's clock starts there. */
export type LastCall = { at: number; model: string }
export type Limit = { percent: number; resetsAt?: string }
export type Meter = { plan: Plan | null; context: number | null; limit: Limit | null; week: Limit | null }
/** A context percentage a handoff offer fires at; 0 for none. */
export type Level = number
/** A handoff note: the project it is for, its text, and when it was written. */
export type Note = { root: string; text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'session-manager': {
      seen: Seen | null
      meter: Meter
      lastCall: LastCall | null
      /** The cold spell (`coldKey`) the cold-cache box was closed for; null until one is closed. */
      coldDismissed: string | null
      /** The highest handoff level shown this session. */
      warned: Level
      /** The note the pane shows; null before one is written or opened. */
      note: Note | null
      /** True while the note shows in the box above the prompt (the side pane had no room). */
      band: boolean
      /** The context percentage the handoff offer shows above the prompt at; null while it is not showing. */
      offer: number | null
    }
  }
}
