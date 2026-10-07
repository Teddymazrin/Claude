export type Mod = { name: string; description: string; root: string }
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Choice = { model: string | null; effort: Effort | null }
export type Seen = { model: string; effort: string | null }
export type Plan = 'Subscription' | 'API'
export type LastCall = { at: number; model: string }
export type Limit = { percent: number; resetsAt?: string }
export type Meter = { plan: Plan | null; context: number | null; limit: Limit | null; week: Limit | null }

declare module 'claude-code' {
  interface PluginState {
    'control-panel': {
      mods: Mod[]
      disabled: string[]
      booted: boolean
      choice: Choice
      seen: Seen | null
      meter: Meter
      lastCall: LastCall | number | null
    }
  }
}
