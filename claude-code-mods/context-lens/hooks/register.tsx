import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown } from 'claude-code'

import type { Detail, Item, Row, Snapshot } from '../types'

const PANE = 'context-lens'
const TITLE = 'Context Lens'
const TOP = 5
const KEEP = 200
// Control Panel's button that opens this pane, and how long after its press to open.
const CONTROL_PANEL = 'control-panel'
const OPEN_BUTTON = 'quick-btn-context-lens'
const OPEN_DELAY_MS = 150

// Set at a Control Panel press, cleared when that button's queued command arrives.
let pressed = false

// The same palette as Control Panel, so the two read as one set.
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const GREEN = '#1f9d63'
const SLATE = '#2a2f3a'
const BLACK = '#0c0c0e'
const INK = '#e8e6e3'
const MUTED = '#7d8190'

const THEME_KEYS = new Set(['text', 'inactive', 'subtle', 'suggestion', 'remember', 'success', 'error', 'warning', 'merged', 'claude', 'permission', 'planMode', 'autoAccept', 'promptBorder', 'bashBorder', 'ide'])
const FALLBACK = ['#e06c3c', '#d9a441', '#a8729a', '#1f9d63', '#4f8fd6', '#c9675a', '#7aa874', '#b58bd1', '#5bb3b0', '#8a8f99']

/** A colour the terminal can draw: a theme key or hex as given, else one from the palette by place. */
export const safeColor = (color: string, i: number) =>
  THEME_KEYS.has(color) || /^#[0-9a-f]{6}$/i.test(color) ? color : (FALLBACK[i % FALLBACK.length] ?? GOLD)

const snapshot = atom({ plugin: 'context-lens', key: 'snapshot' } as const, null)
const busy = atom({ plugin: 'context-lens', key: 'busy' } as const, false)
const expanded = atom({ plugin: 'context-lens', key: 'expanded' } as const, [])

export const spaced = (text: string) => text.toUpperCase().split('').join(' ')

/** `842`, `12.4k`, `1.2M`. */
export const tokensText = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`

export const percentText = (part: number, whole: number) => {
  if (whole <= 0) return '0%'
  const p = (part / whole) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

/** The tail of a path, both slash kinds. */
export const baseName = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : (parts[0] ?? path)
}

const ranked = (items: Item[]) => [...items].sort((a, b) => b.tokens - a.tokens).slice(0, KEEP)

/** The rows a list shows: its biggest few, or all of them once opened. */
export const shown = (items: Item[], isOpen: boolean) => (isOpen ? items : items.slice(0, TOP))

/** The engine's breakdown, trimmed to what the pane draws. */
export function toSnapshot(b: SessionContextBreakdown, detail: Detail, at: number): Snapshot {
  const servers = new Map<string, number>()
  for (const tool of b.mcpTools) {
    if (tool.isLoaded) servers.set(tool.serverName, (servers.get(tool.serverName) ?? 0) + tool.tokens)
  }

  return {
    at,
    detail,
    model: b.model,
    total: b.totalTokens,
    max: b.rawMaxTokens,
    percent: b.percentage,
    compactAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
    rows: b.categories.map((c, i): Row => ({ name: c.name, tokens: c.tokens, color: safeColor(c.color, i), kind: c.kind })),
    memory: ranked(b.memoryFiles.map(f => ({ label: baseName(f.path), note: f.type, tokens: f.tokens }))),
    mcp: ranked([...servers].map(([name, tokens]) => ({ label: name, note: 'MCP', tokens }))),
    skills: ranked((b.skills?.skillFrontmatter ?? []).map(s => ({ label: s.name, note: s.pluginName ?? s.source, tokens: s.tokens }))),
    agents: ranked(b.agents.map(a => ({ label: a.agentType, note: a.source, tokens: a.tokens }))),
    skillCount: b.skills ? { total: b.skills.totalSkills, listed: b.skills.includedSkills } : null,
  }
}

/** One stacked bar: each used row's share of `width` cells, the rest free. */
export function stack(rows: Row[], max: number, width: number) {
  const cells: { color: string; count: number }[] = []
  let left = width
  for (const row of rows.filter(r => r.kind === 'used' || r.kind === 'buffer')) {
    const count = Math.min(left, Math.round((row.tokens / Math.max(1, max)) * width))
    if (count > 0) cells.push({ color: row.color, count })
    left -= count
  }

  return { cells, free: Math.max(0, left) }
}

async function measure($: EngineInterface, detail: Detail) {
  await update($, busy, () => true)
  try {
    const usage = await $.session.usage({ breakdown: detail })
    const b = usage.context.breakdown
    if (b) {
      const at = await $.clock.now()
      await update($, snapshot, () => toSnapshot(b, detail, at))
    }
  } finally {
    await update($, busy, () => false)
  }
}

async function openPane($: EngineInterface) {
  // Opening an id that is already a tab only retitles it; closing it first lets the open raise it.
  const mine = (await $.ui.panes().catch(() => [])).find(pane => pane.id === PANE)
  if (mine && !mine.isShown) await $.ui.close({ id: PANE }).catch(() => {})
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })
  void measure($, 'summary').catch(err => $.ui.toast(`${TITLE}: could not measure · ${String(err)}`))

  return opened
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Immediate: /context-lens typed mid-turn opens now instead of after the turn.
    await $.command.register({ name: 'context-lens', description: 'Show where your context is going', immediate: true })

    return next(e)
  })

  on('command.run', { command: 'context-lens' }, async ($, e) => {
    // Control Panel's button already opened it at the press; this is that button's queued run arriving late.
    if (pressed && e.origin.kind === 'plugin' && e.origin.name === CONTROL_PANEL) {
      pressed = false
      return { text: `${TITLE} opened.` }
    }
    const opened = await openPane($)

    return { text: opened.isPlaced ? `${TITLE} opened.` : `${TITLE} is waiting: ${opened.reason}` }
  })

  // Control Panel's Context Lens button runs /context-lens, which waits for the turn to end.
  // Opening here, at the press, works while the model is busy too.
  on('ui.press', { plugin: CONTROL_PANEL, element: OPEN_BUTTON }, async ($, e, next) => {
    pressed = true
    const result = next(e)
    // After Control Panel has stepped its own pane aside, so this one comes to the front.
    $.clock.after(OPEN_DELAY_MS, () => {
      void openPane($).catch(() => {})
    })
    return result
  }).catch(($, e, next) => next(e))

  // After each turn: a free local estimate, only while the pane is up.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const isUp = (await $.ui.panes().catch(() => [])).some(pane => pane.id === PANE)
      if (isUp) void measure($, 'summary').catch(() => {})
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const isBusy = await read($, busy)
    const columns = e.props.bodyColumns || (e.viewport?.columns ?? 80)
    const barWidth = Math.max(10, Math.min(60, columns - 4))

    const header = (
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text bold color={GOLD}>
          <Text color={ORANGE}>◆ </Text>
          {TITLE}
        </Text>
        <Text color={MUTED}>{s ? s.model : ''}</Text>
      </Box>
    )

    if (!s) {
      return (
        <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined} backgroundColor={BLACK} paddingX={1}>
          {header}
          <Text color={MUTED}>{isBusy ? 'Measuring…' : 'No reading yet.'}</Text>
        </Box>
      )
    }

    const used = s.rows.filter(r => r.kind === 'used').sort((a, b) => b.tokens - a.tokens)
    const free = s.rows.find(r => r.kind === 'free')
    const buffer = s.rows.find(r => r.kind === 'buffer')
    const deferred = s.rows.filter(r => r.kind === 'deferred')
    const bar = stack(used.concat(buffer ? [buffer] : []), s.max, barWidth)
    const pctColor = s.percent >= 75 ? ORANGE : s.percent >= 50 ? GOLD : GREEN

    const row = (r: Row, isDim = false) => (
      <Box key={`row-${r.name}`} flexDirection="row">
        <Text color={r.color}>■ </Text>
        <Box width={24} flexShrink={0}>
          <Text color={isDim ? MUTED : INK} wrap="truncate-end">{r.name}</Text>
        </Box>
        <Box width={8} flexShrink={0} justifyContent="flex-end">
          <Text color={isDim ? MUTED : INK}>{tokensText(r.tokens)}</Text>
        </Box>
        <Box width={6} flexShrink={0} justifyContent="flex-end">
          <Text color={MUTED}>{percentText(r.tokens, s.max)}</Text>
        </Box>
      </Box>
    )

    const open = await read($, expanded)
    const items = (label: string, list: Item[], note?: string) => {
      if (list.length === 0) return null
      const isOpen = open.includes(label)
      const sum = list.reduce((n, item) => n + item.tokens, 0)
      return [
        <Box key={`head-${label}`} marginTop={1} flexDirection="row">
          <Text color={MUTED}>{label}</Text>
          <Text color={MUTED}>{`  ${list.length} · ${tokensText(sum)}${note ? ` · ${note}` : ''}`}</Text>
        </Box>,
        ...shown(list, isOpen).map(item => (
          <Box key={`${label}-${item.label}-${item.note}`} flexDirection="row">
            <Box flexGrow={1} flexShrink={1}>
              <Text color={INK} wrap="truncate-end">{item.label}</Text>
            </Box>
            <Box width={16} flexShrink={0}>
              <Text color={MUTED} wrap="truncate-end">{` ${item.note}`}</Text>
            </Box>
            <Box width={8} flexShrink={0} justifyContent="flex-end">
              <Text color={INK}>{tokensText(item.tokens)}</Text>
            </Box>
          </Box>
        )),
        list.length > TOP ? (
          <Box key={`more-${label}`} hover={{ backgroundColor: SLATE }}>
            <Button
              key={`toggle-${label}`}
              plain
              label={isOpen ? '▾ Show fewer' : `▸ Show all ${list.length}`}
              hover={{ bold: true }}
              onPress={() => update($, expanded, now => (now.includes(label) ? now.filter(one => one !== label) : [...now, label]))}
            >
              <Text color={MUTED}>{isOpen ? '▾ Show fewer' : `▸ Show all ${list.length}`}</Text>
            </Button>
          </Box>
        ) : null,
      ]
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns} minHeight={e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined} backgroundColor={BLACK} paddingX={1}>
        {header}

        <Box flexDirection="row">
          <Text bold color={pctColor}>{`${s.percent}%`}</Text>
          <Text color={MUTED}>{`  ${tokensText(s.total)} of ${tokensText(s.max)}`}</Text>
          {s.compactAt !== null && <Text color={MUTED}>{` · compacts at ${tokensText(s.compactAt)}`}</Text>}
        </Box>
        <Box flexDirection="row" marginBottom={1}>
          {bar.cells.map((c, i) => (
            <Text key={`cell-${i}`} color={c.color}>{'█'.repeat(c.count)}</Text>
          ))}
          <Text color={SLATE}>{'░'.repeat(bar.free)}</Text>
        </Box>

        {used.map(r => row(r))}
        {buffer && row(buffer, true)}
        {free && row(free, true)}
        {deferred.map(r => row(r, true))}

        {items('Memory files', s.memory)}
        {items('MCP servers', s.mcp)}
        {items('Skills', s.skills, s.skillCount && s.skillCount.listed < s.skillCount.total ? `${s.skillCount.total - s.skillCount.listed} left out of the listing` : undefined)}
        {items('Agents', s.agents)}

        <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <Text color={MUTED}>
            {isBusy ? 'Measuring…' : s.detail === 'full' ? 'Counted exactly' : 'Estimated'}
          </Text>
          <Box key="count-exactly-box" backgroundColor={SLATE} paddingX={1}>
            <Button
              key="count-exactly"
              plain
              label="Count exactly"
              hotkey="c"
              hover={{ bold: true }}
              onPress={() => measure($, 'full').catch(() => {})}
            >
              <Text color={INK}>Count exactly</Text>
            </Button>
          </Box>
        </Box>
      </Box>
    )
  })
}
