// The cold-cache box's wording: pure helpers. Drawing it lives in register.tsx.
import type { LastCall } from '../types'

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
