/** A context percentage a warning fires at; 0 for none. */
export type Level = number

/** A handoff note: the project it is for, its text, and when it was written. */
export type Note = { root: string; text: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'context-handoff': {
      /** The highest warning level shown this session. */
      warned: Level
      /** The note the pane shows; null before one is written or opened. */
      note: Note | null
      /** True while the note shows in the box above the prompt (the side pane had no room). */
      band: boolean
    }
  }
}
