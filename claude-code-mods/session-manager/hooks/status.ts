// The terminal row and the app's footer line, as text: pure helpers. Drawing them lives in register.tsx.
import type { Meter } from '../types'
import { GOLD, ORANGE, cacheColor, effortName, fillColor, limitText, meterBar, modelName } from './session'

/** The terminal row as plain text: plan | model | effort | context bar | cache | 5-hour window | weekly window. */
export const statusText = (m: Meter, model: string | null | undefined, effort: string | null | undefined, now: number, cache = '') => {
  const bar = meterBar(m.context ?? 0)
  const parts = [
    m.plan ?? '…',
    model ? modelName(model) : '…',
    `effort ${effort ? effortName(effort) : '…'}`,
    `ctx ${bar.filled}${bar.empty} ${m.context === null ? '…' : `${m.context}%`}`,
  ]
  if (cache) parts.push(cache)
  if (m.limit) parts.push(limitText('usage', m.limit, now))
  if (m.week) parts.push(limitText('weekly', m.week, now))
  return parts.join(' | ')
}

/** One piece of the app's footer line: a dim label and a colored value. */
export type Piece = { key: string; label: string; value: string; color: string }

/** The app's footer line: context, cache and the 5-hour window. The footer has no room for more. */
export const footerPieces = (m: Meter, cache: string): Piece[] => {
  const pieces: Piece[] = [{ key: 'ctx', label: 'ctx', value: m.context === null ? '…' : `${m.context}%`, color: fillColor(m.context ?? 0) }]
  if (cache) pieces.push({ key: 'cache', label: 'cache', value: cache.replace(/^cache /, ''), color: cacheColor(cache) })
  if (m.limit) pieces.push({ key: '5h', label: '5h', value: `${Math.round(m.limit.percent)}%`, color: fillColor(m.limit.percent) })
  return pieces
}

/** A usage window's percent: plain under half, gold to 75%, orange above. */
export const limitColor = (percent: number) => (percent >= 75 ? ORANGE : percent >= 50 ? GOLD : undefined)
