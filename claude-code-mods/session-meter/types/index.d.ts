export type Plan = 'Subscription' | 'API'
export type LastCall = { at: number; model: string }
export type Limit = { percent: number; resetsAt?: string }
export type Meter = { plan: Plan | null; context: number | null; limit: Limit | null; week: Limit | null }

declare module 'claude-code' {
  interface PluginState {
    'session-meter': {
      meter: Meter
      lastCall: LastCall | null
      /** The cold spell (`coldKey`) the cold-cache box was closed for; null until one is closed. */
      coldDismissed: string | null
    }
  }
}
