// The cold-cache box's wording: pure helpers. Drawing it lives in register.tsx.
import type { LastCall } from '../types'
import { baseModel } from './session'

/** The cold-cache box's line after its title. */
export const COLD_WHY = ' · Your next message re-reads the entire chat at full price and uses more of your usage.'

/**
 * After a model switch the new model has no cache, while the old model's is still warm. In plain words, with no
 * mention of handoffs: someone who just switched models may not know about them.
 */
export const coldSwitchWhy = (newModel: string, oldModel: string) =>
  ` · ${newModel} hasn't read this chat yet, so your next message sends all of it again at full price and uses more of your usage. ${oldModel} still has it saved.`

/** The cold-cache box's bold title: `Cache cold`, or `Cache cold · new model` after a switch. */
export const coldTitle = (cache: string) => cache.replace(/^cache cold/, 'Cache cold')

/** Which cold spell this is: the last reply and the model the next request goes to. A new reply or another switch is a new one. */
export const coldKey = (last: LastCall, model: string | null | undefined) => `${last.at}|${model ?? ''}`

/** How long before the cache goes cold the note is written while you are away. */
export const AUTO_LEAD_MS = 5 * 60_000
/** Under this, the write is left alone: too close to the edge to finish in time. */
export const AUTO_MIN_LEFT_MS = 30_000
/** Below this much context the chat is cheap to re-read, so no note is written. */
export const AUTO_MIN_CONTEXT = 20

/**
 * Whether to write the handoff note now, from the cache, while you are away: the cache is warm for the model the
 * next message goes to and goes cold within AUTO_LEAD_MS, the chat is big enough to matter, nothing is running,
 * and no note was written since the last reply. A cache too short to be away from (the API's 5 minutes) never does.
 */
export const shouldAutoNote = (a: {
  last: LastCall | null
  ttlMs: number
  now: number
  context: number | null
  nextModel: string | null | undefined
  isBusy: boolean
  noteAt: number | null
}) => {
  const { last, ttlMs, now, context, nextModel, isBusy, noteAt } = a
  if (!last || isBusy || ttlMs <= 2 * AUTO_LEAD_MS) return false
  if ((context ?? 0) < AUTO_MIN_CONTEXT) return false
  if (noteAt !== null && noteAt >= last.at) return false
  if (nextModel && baseModel(nextModel) !== baseModel(last.model)) return false
  const left = last.at + ttlMs - now
  return left <= AUTO_LEAD_MS && left > AUTO_MIN_LEFT_MS
}


/** The away box's title: it shows only once the cache has run out. */
export const AWAY_TITLE = 'Cache ran out while you were away · here is your handoff note'

/** The away box's line under the title. */
export const awayWhy = (when: string) =>
  `Written at ${when}, before the cache expired. Copy prompt and paste it in a new chat to skip re-reading this one at full price.`
