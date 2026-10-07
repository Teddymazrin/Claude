/** A context percentage a warning fires at; 0 for none. */
export type Level = number

declare module 'claude-code' {
  interface PluginState {
    'context-handoff': {
      /** The highest warning level shown this session. */
      warned: Level
    }
  }
}
