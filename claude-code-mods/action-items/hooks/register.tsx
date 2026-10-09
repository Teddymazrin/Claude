import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Action, Decision, Item, StepSet } from '../types'

const PLUGIN = 'action-items'
const COMMAND = 'action-items'
const TOOL = 'action_items'
const TOOL_ID = `mcp__${PLUGIN}__${TOOL}`
const KEEP = 8
const MAX_CAUGHT = 4

const sets = atom({ plugin: 'action-items', key: 'sets' } as const, [])
const band = atom({ plugin: 'action-items', key: 'band' } as const, null)
const tab = atom({ plugin: 'action-items', key: 'tab' } as const, null)
// The action opened in full ("<set id>:<index>") when the box is too short to open them all.
const openAction = atom({ plugin: 'action-items', key: 'focus' } as const, null)
// Whether ticked actions folded into "✓ N done" are listed again, to untick one.
const showDone = atom({ plugin: 'action-items', key: 'showDone' } as const, false)

// One accent, Claude's orange, on neutral greys: orange frame and header, near-white text,
// charcoal buttons that turn orange on hover.
const C = {
  frame: '#d97757',
  title: '#d97757',
  decide: '#ececea',
  do: '#ececea',
  done: '#8e8e93',
  code: '#1c1c1e',
  chip: '#2c2c2e',
  btn: '#2c2c2e',
  btnHover: '#c4623f',
}

const INSTRUCTIONS = `# Action Items box
The user keeps an Action Items box above the prompt for everything you need from them. It shows decisions (questions they answer) apart from actions (things they do themselves), so they never have to dig through your reply to find what you are waiting on.
- Whenever you end a turn needing something from the user, call \`${TOOL_ID}\` before your final answer. That covers:
  - \`decisions\`: any question you want answered, a choice between approaches, information only they have, a go-ahead. Give 2-4 short \`options\` when the answer is one of a few choices; they click one and it comes back to you as their reply. Leave \`options\` out for an open question. Add a \`detail\` line when the choice needs context (what each option means, what you'd recommend).
  - \`actions\`: what they must do themselves: run a script, fill in a parameter, sign in, check a portal setting, restart something. Only what actually needs them; never filler like "look over the code" or "test the button" with nothing specific to find. Write each so they could do it without reading your reply:
    - \`text\`: the action, imperative and specific: where and what ("Run the setup script in PowerShell", not "Check it works").
    - \`why\` (required): one line on what it gets done or what they are checking for, in their terms ("Gives the new app Reader access on every subscription"). If you can't say why, leave the action out.
    - \`detail\`: one line on how, and what they should see when it worked ("Prints 3 subscriptions, each marked Assigned").
    - \`command\`: the exact command where there is one (real paths, placeholders in <angle brackets>).
- One call per turn with a short \`title\` (the task), all decisions and actions together.
- When the user answers a waiting question by typing instead of clicking, you're told which are still open: call the tool with that \`title\` and \`answered\` (the questions' numbers) to clear them.
- Then keep your final answer short: say what you did and that what you need is in the box. Don't repeat the options or the steps.
- A question asked with AskUserQuestion mid-task does not need to go in the box too.
- Skip it only when you need nothing from the user.`

export const REMINDER = `[Action Items] Anything you need from the user (decisions or actions) goes in the box via ${TOOL_ID} (ToolSearch "select:${TOOL_ID}" if not loaded).`

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const parseSet = (input: Record<string, unknown>, id: string, at: number): StepSet | string => {
  const title = str(input.title)
  if (!title) return '`title` must be a non-empty string.'
  const items: Item[] = []
  for (const raw of Array.isArray(input.decisions) ? input.decisions : []) {
    const d = raw as { question?: unknown; options?: unknown }
    const text = str(d?.question)
    if (!text) return 'Each decision needs a `question`.'
    const options = Array.isArray(d.options) ? d.options.map(str).filter(Boolean).slice(0, 6) : []
    const detail = str((d as { detail?: unknown }).detail)
    items.push({ kind: 'decide', text, ...(detail ? { detail } : {}), options })
  }
  // `steps` is the older name for actions.
  const actions = Array.isArray(input.actions) ? input.actions : Array.isArray(input.steps) ? input.steps : []
  for (const raw of actions) {
    const s = raw as { text?: unknown; why?: unknown; detail?: unknown; command?: unknown }
    const text = str(s?.text)
    if (!text) return 'Each action needs a `text`.'
    const why = str(s.why)
    // The older `steps` had no why; new actions must say what they are for.
    if (!why && Array.isArray(input.actions)) return `Action "${text}" needs a \`why\`: what it gets done or what the user checks for. If there is no clear why, leave it out.`
    const detail = str(s.detail)
    const command = str(s.command)
    items.push({ kind: 'do', text, ...(why ? { why } : {}), ...(detail ? { detail } : {}), ...(command ? { command } : {}), isDone: false })
  }
  if (items.length === 0) return 'Give at least one entry in `decisions` or `actions`.'
  return { id, title, items, at }
}

export const decisions = (set: StepSet) => set.items.filter((i): i is Decision => i.kind === 'decide')
export const actions = (set: StepSet) => set.items.filter((i): i is Action => i.kind === 'do')

/** A decision still waiting on the person: not picked, and its set's answers not yet sent. */
const isPending = (set: StepSet, d: Decision) => !set.isSent && (d.answer === undefined || d.isTyping === true)
export const pendingDecisions = (set: StepSet) => decisions(set).filter(d => isPending(set, d))
export const openActions = (set: StepSet) => actions(set).filter(a => !a.isDone)
export const isOpen = (set: StepSet) => pendingDecisions(set).length > 0 || openActions(set).length > 0
/** Every decision has a clicked or typed answer and nothing has been sent yet. */
export const isDecided = (set: StepSet) =>
  !set.isSent && decisions(set).length > 0 && decisions(set).every(d => d.answer !== undefined || d.isTyping === true)

/** The newest first, `KEEP` at most; a set with the same title replaces the older one. */
export const addSet = (list: readonly StepSet[], set: StepSet) =>
  [set, ...list.filter(s => s.title !== set.title)].slice(0, KEEP)

const editItem = (list: readonly StepSet[], id: string, index: number, fn: (item: Item) => Item) =>
  list.map(s => (s.id !== id ? s : { ...s, items: s.items.map((it, i) => (i === index ? fn(it) : it)) }))

export const toggleAction = (list: readonly StepSet[], id: string, index: number) =>
  editItem(list, id, index, it => (it.kind === 'do' ? { ...it, isDone: !it.isDone } : it))

export const pick = (list: readonly StepSet[], id: string, index: number, answer: string) =>
  editItem(list, id, index, it => (it.kind === 'decide' ? { ...it, answer, isTyping: false } : it))

export const startTyping = (list: readonly StepSet[], id: string, index: number) =>
  editItem(list, id, index, it => (it.kind === 'decide' ? { ...it, answer: undefined, isTyping: true } : it))

export const markSent = (list: readonly StepSet[], id: string) => list.map(s => (s.id === id ? { ...s, isSent: true } : s))

/** Drops a set the person no longer cares about, done or not, so the box never falls back to it. */
export const clearSet = (list: readonly StepSet[], id: string) => list.filter(s => s.id !== id)

/** Marks the set sent once no decision waits any more. */
const closeIfDone = (set: StepSet): StepSet =>
  decisions(set).every(d => d.answer !== undefined && !d.isTyping) ? { ...set, isSent: true } : set

/**
 * A typed reply, read for the questions the person was typing an answer to ("- Q → answer"):
 * a written answer counts; a blank or missing one puts the question back to waiting.
 */
export const applyTyped = (set: StepSet, text: string): StepSet => {
  const lines = text.split('\n')
  const items = set.items.map(it => {
    if (it.kind !== 'decide' || !it.isTyping) return it
    const line = lines.find(l => l.replace(/^\s*-\s*/, '').startsWith(`${it.text} →`))
    const answer = line ? line.slice(line.indexOf('→') + 1).trim() : ''
    return answer ? { ...it, answer, isTyping: false, isDelivered: true } : { ...it, answer: undefined, isTyping: false }
  })
  return closeIfDone({ ...set, items })
}

/** Decisions Claude saw answered in chat, by their number in the box (1 = the first question). */
export const markAnswered = (set: StepSet, numbers: readonly number[]): StepSet => {
  let n = 0
  const items = set.items.map(it => {
    if (it.kind !== 'decide') return it
    n += 1
    return numbers.includes(n) && it.answer === undefined ? { ...it, answer: '(answered in chat)', isTyping: false } : it
  })
  return closeIfDone({ ...set, items })
}

/** What Claude reads beside a typed reply while questions wait: the open ones, numbered as in the box. */
export const openNote = (set: StepSet) => {
  const open = decisions(set)
    .map((d, i) => ({ d, n: i + 1 }))
    .filter(x => isPending(set, x.d))
    .map(x => `${x.n}. ${x.d.text}`)
  return `The Action Items box ("${set.title}") still has open questions:\n${open.join('\n')}\nIf this message answers any of them, call ${TOOL_ID} with \`title\` "${set.title}" and \`answered\` listing their numbers, so the box clears them. Leave the rest open; don't ask them again in your reply.`
}

/** The clicked answers as the person's reply; a typed one is left for them to finish. */
export const answerText = (set: StepSet) =>
  [`${set.title}:`, ...decisions(set).filter(d => !d.isTyping && d.answer !== undefined).map(d => `- ${d.text} → ${d.answer}`)].join('\n')

export const countText = (set: StepSet) => {
  const decide = pendingDecisions(set).length
  const doing = openActions(set).length
  const parts = [decide > 0 ? `${decide} to decide` : '', doing > 0 ? `${doing} to do` : ''].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'All done'
}

/**
 * How far the Do tab shrinks to fit, least first: 0 draws it whole; 1 drops the blank lines and folds
 * ticked actions into one line; 2 keeps the how-to line on the next open action only; 3, the last
 * resort, keeps the why and the command on the next open action only.
 */
export type DoLevel = 0 | 1 | 2 | 3
const DO_CHROME = 5 // border, header, tabs and the gap under them

/** Rows the Do tab takes at `level`, text wrapped at `columns`. */
export const doRows = (list: readonly Action[], columns: number, level: DoLevel) => {
  const width = Math.max(20, columns - 8)
  const lines = (t: string) => Math.max(1, Math.ceil(t.length / width))
  const open = list.filter(a => !a.isDone)
  const shown = level === 0 ? list : open
  const next = open[0]
  let rows = DO_CHROME + (level > 0 && open.length < list.length ? 1 : 0)
  shown.forEach((a, i) => {
    rows += (level === 0 && i > 0 ? 1 : 0) + lines(a.text)
    if (a.isDone) return
    const isNext = a === next
    if (a.why && (level < 3 || isNext)) rows += lines(`Why: ${a.why}`)
    if (a.detail && (level < 2 || isNext)) rows += lines(a.detail)
    if (a.command && (level < 3 || isNext)) rows += lines(a.command)
  })
  return rows
}

/** The least shrinking that fits `maxRows`; the last level when none does. */
export const doLevel = (list: readonly Action[], columns: number, maxRows: number): DoLevel =>
  // Past the blank lines, straight to one open action and the rest one row each: a half-open middle
  // step left rows that neither showed everything nor folded to a line.
  ([0, 1] as const).find(l => doRows(list, columns, l) <= maxRows) ?? 3

// One sentence: a stop or question mark not followed by a space stays inside it ("v1.2", "e.g.x").
const SENTENCE = /(?:[^.!?]|[.!?](?=\S))+[.!?]*/g
const unmark = (s: string) =>
  s.replace(/^\s*(?:[-*+>]|\d+[.)])\s+/, '').replace(/\*\*|__|`/g, '').trim()

/** The questions a reply ends on: the last paragraph's, when it ends asking something. */
export const findQuestions = (answer: string): string[] => {
  const paras = answer
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
  const last = paras[paras.length - 1] ?? ''
  const parts = last
    .split('\n')
    .map(unmark)
    .flatMap(l => (l.match(SENTENCE) ?? []).map(s => s.trim()))
    .filter(Boolean)
  if (!parts[parts.length - 1]?.endsWith('?')) return []
  return parts
    .filter(s => s.endsWith('?'))
    .slice(-MAX_CAUGHT)
    .map(s => (s.length > 160 ? `${s.slice(0, 157)}...` : s))
}

// Every change goes to the session's state (redraws the box) and the store (kept across sessions).
async function save($: EngineInterface, fn: (list: StepSet[]) => StepSet[]) {
  const next = await update($, sets, list => fn(list))
  await $.store.set('sets', next).catch(() => {})
  return next
}

async function show($: EngineInterface, set: StepSet) {
  await save($, list => addSet(list, set))
  await update($, band, () => set.id)
  await update($, tab, () => null)
}

/** The set to show next: the newest with a question waiting, else the newest with something to do. */
export const nextSet = (list: readonly StepSet[]) => list.find(s => pendingDecisions(s).length > 0) ?? list.find(isOpen)

/** The tab the box opens on: Decide while a question waits, Do after. */
export const autoTab = (set: StepSet): 'decide' | 'do' => (pendingDecisions(set).length > 0 || actions(set).length === 0 ? 'decide' : 'do')

// Once every decision has an answer: clicked ones go straight back to Claude as the person's reply;
// with one typed, the clicked ones join the draft in the prompt box for the person to finish and send.
async function settle($: EngineInterface, id: string) {
  const set = (await read($, sets)).find(s => s.id === id)
  if (!set || !isDecided(set)) return
  // Nothing left to click: let the box move on to Do.
  await update($, tab, () => null)
  if (!decisions(set).some(d => d.isTyping)) {
    await save($, l => markSent(l, id))
    await $.prompt.submit({ text: answerText(set), asUser: true })
    return
  }
  // One is being typed: the set stays open until the reply is sent and read (applyTyped).
  const box = await $.prompt.read()
  await $.prompt.fill({ text: `${answerText(set)}\n${box.text}`, mode: 'replace' })
  $.ui.toast('Finish your answer in the prompt box, then send it')
}

async function typeOwn($: EngineInterface, set: StepSet, index: number, question: string) {
  await save($, l => startTyping(l, set.id, index))
  const box = await $.prompt.read()
  const line = `- ${question} → `
  await $.prompt.fill({ text: box.text.trim() ? `\n${line}` : line, mode: box.text.trim() ? 'append' : 'replace' })
  await settle($, set.id)
}

type Surface = Parameters<EngineInterface['ui']['resolve']>[0]

function chip($: EngineInterface, e: Surface, key: string, label: string, onPress: (press: { surface: Surface['surface'] }) => unknown) {
  const { Box, Button } = $.ui.resolve(e)
  return (
    <Box key={`${key}-box`} flexShrink={0} marginRight={1} backgroundColor={C.btn} paddingX={1} hover={{ backgroundColor: C.btnHover }}>
      <Button key={key} plain label={label} hover={{ bold: true }} onPress={onPress} />
    </Box>
  )
}

// "1  Which region?" with its options as buttons beneath; once answered, the pick in green.
function decisionLine($: EngineInterface, e: Surface, set: StepSet, d: Decision, index: number, n: number, isSpaced: boolean, isFull = true) {
  const { Box, Text } = $.ui.resolve(e)
  const key = `${set.id}-${index}`
  const pending = isPending(set, d)
  return (
    <Box key={`d-${key}`} flexDirection="column" marginTop={isSpaced && n > 1 ? 1 : 0}>
      <Box flexDirection="row">
        <Box width={4} flexShrink={0}>
          <Text color={pending ? C.decide : C.done}>{pending && !d.isTyping ? `${n}` : '✓'}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text bold={pending && isFull} dimColor={!pending || !isFull}>{d.text}</Text>
        </Box>
      </Box>
      {isFull && pending && d.detail && (
        <Box marginLeft={4}>
          <Text dimColor>{d.detail}</Text>
        </Box>
      )}
      {isFull && pending && !d.isTyping && (
        <Box flexDirection="row" flexWrap="wrap" marginLeft={4}>
          {d.options.map((o, oi) =>
            chip($, e, `pick-${key}-${oi}`, o, async () => {
              await save($, l => pick(l, set.id, index, o))
              await settle($, set.id)
            }),
          )}
          {chip($, e, `own-${key}`, d.options.length > 0 ? 'Other…' : 'Answer…', () => typeOwn($, set, index, d.text))}
        </Box>
      )}
      {d.isTyping && pending && (
        <Box marginLeft={4}>
          <Text dimColor>Typing your answer in the prompt box</Text>
        </Box>
      )}
      {!pending && d.answer !== undefined && (
        <Box marginLeft={4}>
          <Text color={C.done}>{`→ ${d.answer}`}</Text>
        </Box>
      )}
    </Box>
  )
}

// "3  Sign in to Azure", the number ticking it off; why, how and the command, if any, beneath with Copy.
type Show = { why: boolean; detail: boolean; command: boolean }

function actionLine($: EngineInterface, e: Surface, set: StepSet, a: Action, index: number, n: number, isSpaced: boolean, show: Show, onOpen?: () => unknown, onClose?: () => unknown) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const key = `${set.id}-${index}`
  return (
    <Box key={`a-${key}`} flexDirection="column" marginTop={isSpaced ? 1 : 0}>
      <Box flexDirection="row">
        <Box width={4} flexShrink={0}>
          <Button
            key={`tick-${key}`}
            plain
            label={a.isDone ? '✓ ' : `${n} `}
            hover={{ bold: true }}
            onPress={() => save($, l => toggleAction(l, set.id, index))}
          />
        </Box>
        {/* A folded row with a Copy keeps it beside the text, not out at the box's edge. */}
        <Box flexGrow={!show.command && a.command && !a.isDone ? 0 : 1} flexShrink={1}>
          {/* Not shown in full: its title opens it, folding the one open before. */}
          {onClose && !a.isDone ? (
            <Button key={`close-${key}`} plain label={`▾ ${a.text}`} hover={{ bold: true, underline: true }} onPress={onClose} />
          ) : onOpen && !a.isDone ? (
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Button key={`open-${key}`} plain label={`▸ ${a.text}`} hover={{ bold: true, underline: true }} onPress={onOpen} />
              </Box>
              {/* Folded to one row, it keeps its why on the same line, cut at the edge. */}
              {!show.why && a.why && (
                <Box flexShrink={1}>
                  <Text dimColor wrap="truncate-end">{` · ${a.why}`}</Text>
                </Box>
              )}
            </Box>
          ) : (
            <Text bold={!a.isDone} dimColor={a.isDone} strikethrough={a.isDone} color={a.isDone ? C.done : undefined}>
              {a.text}
            </Text>
          )}
        </Box>
        {/* Folded, its command rides on the same row, cut to fit, with Copy after it. */}
        {!show.command && a.command && !a.isDone && (
          <Box flexShrink={1} marginLeft={2} backgroundColor={C.code} paddingX={1}>
            <Text color={C.do} wrap="truncate-end">{a.command.split('\n')[0]}</Text>
          </Box>
        )}
        {!show.command && a.command && !a.isDone && (
          <Box flexShrink={0} marginLeft={1}>
            {chip($, e, `copy-${key}`, 'Copy', async press => {
              const copied = await $.ui.copy({ text: a.command!, surface: press.surface })
              $.ui.toast(copied.isCopied ? `Copied: ${a.command}` : 'Could not copy the command')
            })}
          </Box>
        )}
      </Box>
      {show.why && a.why && !a.isDone && (
        <Box marginLeft={4}>
          <Text>
            <Text color={C.title}>{'Why: '}</Text>
            <Text>{a.why}</Text>
          </Text>
        </Box>
      )}
      {show.detail && a.detail && !a.isDone && (
        <Box marginLeft={4}>
          <Text dimColor>{a.detail}</Text>
        </Box>
      )}
      {show.command && a.command && !a.isDone && (
        <Box flexDirection="row" marginLeft={4}>
          <Box flexShrink={1} backgroundColor={C.code} paddingX={1}>
            <Text color={C.do}>{a.command}</Text>
          </Box>
          <Box flexShrink={0} marginLeft={1}>
            {chip($, e, `copy-${key}`, 'Copy', async press => {
              const copied = await $.ui.copy({ text: a.command!, surface: press.surface })
              $.ui.toast(copied.isCopied ? 'Command copied' : 'Could not copy the command')
            })}
          </Box>
        </Box>
      )}
    </Box>
  )
}

// What Claude did not put in the box itself this turn; reset as each turn starts.
let isAskedThisTurn = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        "Put everything you need from the user in their Action Items box above the prompt: decisions they make (questions, choices, go-aheads) and actions they do themselves (run a script, sign in, check a setting). Call once before your final answer whenever you need something from them.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The task this is about, a few words.' },
          decisions: {
            type: 'array',
            description: 'Questions the user answers.',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'The question, one short line.' },
                detail: { type: 'string', description: 'Optional context: what the options mean, what you recommend.' },
                options: { type: 'array', items: { type: 'string' }, description: '2-4 short choices to click, if the answer is one of a few.' },
              },
              required: ['question'],
            },
          },
          answered: {
            type: 'array',
            items: { type: 'number' },
            description: "Only to clear questions the user answered by typing: their numbers in the box. Send with the set's title and nothing else.",
          },
          actions: {
            type: 'array',
            description: 'Things the user does themselves.',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The action: imperative, specific about where and what.' },
                why: { type: 'string', description: 'What it gets done or what they are checking for, in their terms. No clear why: leave the action out.' },
                detail: { type: 'string', description: 'One line on how to do it and what they should see when it worked.' },
                command: { type: 'string', description: 'The exact command to run for this action, if any.' },
              },
              required: ['text', 'why'],
            },
          },
        },
        required: ['title'],
      },
    })
    await $.command.register({ name: COMMAND, description: 'Show what Claude still needs from you' })
    // Bring back what earlier sessions pinned; sets from before decisions existed are dropped.
    if ((await read($, sets)).length === 0) {
      const stored = (await $.store.get('sets')) as StepSet[] | undefined
      const usable = Array.isArray(stored) ? stored.filter(s => Array.isArray(s?.items)) : []
      if (usable.length > 0) await update($, sets, () => usable)
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return {
      sections: [...composed.sections, { id: `${PLUGIN}:instructions`, text: INSTRUCTIONS, scope: 'session' as const }],
    }
  })

  // A typed reply answers what is still open: the box stops waiting on it, and clicked answers
  // not yet sent go along with it.
  on('prompt.submit', async ($, e, next) => {
    if (e.text.trim().startsWith('/')) return next(e)
    const context = [...(e.context ?? []), REMINDER]
    // A typed reply settles only what it answers: answers typed after "Other…" are read from it,
    // clicked ones go along, and Claude is told which questions still wait, to clear those it answered.
    if (e.origin.kind === 'composer') {
      const waiting = (await read($, sets)).filter(s => pendingDecisions(s).length > 0)
      if (waiting.length > 0) {
        const after = waiting.map(s => applyTyped(s, e.text))
        await save($, l => l.map(s => after.find(a => a.id === s.id) ?? s))
        // Clicked answers Claude has not had yet go along once.
        const fresh = after
          .map(s => ({ s, ds: decisions(s).filter(d => d.answer !== undefined && !d.isTyping && !d.isDelivered) }))
          .filter(x => x.ds.length > 0)
        if (fresh.length > 0)
          context.push(`Answers the user clicked in the Action Items box:\n${fresh.map(x => [`${x.s.title}:`, ...x.ds.map(d => `- ${d.text} → ${d.answer}`)].join('\n')).join('\n')}`)
        const delivered = after.map(s => ({ ...s, items: s.items.map(it => (it.kind === 'decide' && it.answer !== undefined && !it.isTyping ? { ...it, isDelivered: true } : it)) }))
        await save($, l => l.map(s => delivered.find(a => a.id === s.id) ?? s))
        for (const s of after.filter(s => pendingDecisions(s).length > 0)) context.push(openNote(s))
      }
    }
    return next({ ...e, context })
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    isAskedThisTurn = false
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    isAskedThisTurn = true
    return next(e)
  })

  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    // Only clearing questions answered in chat.
    if (Array.isArray(input.answered) && !Array.isArray(input.decisions) && !Array.isArray(input.actions)) {
      const numbers = input.answered.filter((n): n is number => typeof n === 'number')
      const title = str(input.title)
      const id = await read($, band)
      const list = await read($, sets)
      const target = list.find(s => s.title === title) ?? list.find(s => s.id === id)
      if (!target) return { result: 'Not saved: no set with that title in the box.', isError: true }
      const next = markAnswered(target, numbers)
      await save($, l => l.map(s => (s.id === target.id ? next : s)))
      return { result: `Cleared from the box. Left in it: ${countText(next)}.` }
    }
    const now = await $.clock.now()
    const parsed = parseSet(e as unknown as Record<string, unknown>, String(now), now)
    if (typeof parsed === 'string') return { result: `Not saved: ${parsed}`, isError: true }
    isAskedThisTurn = true
    await show($, parsed)
    const clicks = decisions(parsed).some(d => d.options.length > 0) ? ' Their clicked answers come back to you as their next message.' : ''
    return { result: `Shown in the Action Items box above the prompt (${countText(parsed)}). Tell the user it is there instead of repeating it.${clicks}` }
  })

  // The safety net: a reply that ends asking something, with nothing put in the box, gets its questions put there.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.reason !== 'answer' || e.agentId || isAskedThisTurn) return done
    const questions = findQuestions(e.answer)
    if (questions.length === 0) return done
    const now = await $.clock.now()
    const items: Item[] = questions.map(text => ({ kind: 'decide', text, options: [] }))
    await show($, { id: String(now), title: 'Claude asked', items, at: now })
    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const id = await read($, band)
    if (id === null || e.props.hasSurvey) return below
    // The set asked for; once it is all done, the newest set still waiting on the person.
    const list = await read($, sets)
    const asked = list.find(s => s.id === id)
    const set = asked && isOpen(asked) ? asked : nextSet(list)
    if (!set) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const openCount = list.filter(isOpen).length
    const clearShown = async () => {
      const left = await save($, l => clearSet(l, set.id))
      await update($, tab, () => null)
      // On to the next set still waiting, or the box closes.
      await update($, band, () => nextSet(left)?.id ?? null)
    }
    const clearAll = async () => {
      await save($, () => [])
      await update($, tab, () => null)
      await update($, band, () => null)
    }
    const decide = set.items.map((it, i) => ({ it, i })).filter((x): x is { it: Decision; i: number } => x.it.kind === 'decide')
    const doing = set.items.map((it, i) => ({ it, i })).filter((x): x is { it: Action; i: number } => x.it.kind === 'do')
    // One section at a time: the tab the person picked, else Decide while a question waits.
    const picked = await read($, tab)
    // A picked Decide tab with nothing left to decide gives way to Do.
    const current = picked === 'do' && doing.length > 0 ? 'do' : picked === 'decide' && pendingDecisions(set).length > 0 ? 'decide' : autoTab(set)

    const tabChip = (id: 'decide' | 'do', mark: string, label: string, color: string, count: number) => {
      const isOn = current === id
      const text = `${label.toUpperCase()}${count > 0 ? ` ${count}` : ' ✓'}`
      return (
        <Box key={`tab-${id}-box`} flexDirection="row" flexShrink={0} marginRight={1} paddingX={1} backgroundColor={isOn ? C.chip : undefined} hover={{ backgroundColor: C.frame }}>
          <Text bold color={isOn ? color : undefined} dimColor={!isOn}>{`${mark} `}</Text>
          <Button key={`tab-${id}`} plain dimColor={!isOn} label={text} hover={{ bold: true }} onPress={() => update($, tab, () => id)} />
        </Box>
      )
    }

    // Decide: answered ones fold into a line, the first waiting question opens with its options,
    // the rest wait one line each.
    const answered = decide.filter(x => !isPending(set, x.it))
    const waiting = decide.filter(x => isPending(set, x.it))
    const focus = waiting.find(x => !x.it.isTyping)?.i
    const decidePart = (
      <Box key="decide-part" flexDirection="column">
        {answered.length > 0 && waiting.length > 0 && (
          <Box key="answered-folded">
            <Text color={C.done} dimColor>{`✓   ${answered.length} answered`}</Text>
          </Box>
        )}
        {(waiting.length > 0 ? waiting : answered).map(x =>
          decisionLine($, e, set, x.it, x.i, decide.indexOf(x) + 1, false, x.i === focus),
        )}
      </Box>
    )

    // Do: drawn whole when it fits; else ticked ones fold and only the next open action keeps
    // its detail and command.
    const level = doLevel(doing.map(x => x.it), e.props.bodyColumns, e.props.maxRows)
    const nextOpen = doing.find(x => !x.it.isDone)?.i
    const isDoneShown = await read($, showDone)
    const shown = level === 0 || isDoneShown ? doing : doing.filter(x => !x.it.isDone)
    const doneCount = doing.filter(x => x.it.isDone).length
    // The opened action shows in full: the one picked by its title, else the next open one;
    // "<set>:none" when the person folded it.
    const focusKey = await read($, openAction)
    const opened =
      focusKey === `${set.id}:none` ? undefined : (doing.find(x => `${set.id}:${x.i}` === focusKey && !x.it.isDone)?.i ?? nextOpen)
    const showFor = (i: number): Show => ({ why: level < 3 || i === opened, detail: level < 2 || i === opened, command: level < 3 || i === opened })
    const isWhole = (sh: Show) => sh.why && sh.detail && sh.command
    const doPart = (
      <Box key="do-part" flexDirection="column">
        {/* Ticked ones fold into a line that lists them again, so one can be unticked. */}
        {level > 0 && doneCount > 0 && (
          <Box key="done-folded">
            <Button
              key="toggle-done"
              plain
              dimColor
              label={isDoneShown ? `✓   ${doneCount} done  ▾ hide` : `✓   ${doneCount} done  ▸ show`}
              hover={{ bold: true }}
              onPress={() => update($, showDone, v => !v)}
            />
          </Box>
        )}
        {shown.map((x, n) => {
          const sh = showFor(x.i)
          const open = isWhole(sh) ? undefined : () => update($, openAction, () => `${set.id}:${x.i}`)
          // In a short box the opened one folds back from its title too.
          const close = level > 0 && x.i === opened ? () => update($, openAction, () => `${set.id}:none`) : undefined
          return actionLine($, e, set, x.it, x.i, doing.indexOf(x) + 1, level === 0 && n > 0, sh, open, close)
        })}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box key="action-items-band" flexDirection="column" borderStyle="round" borderColor={C.frame} paddingX={1}>
          <Box key="band-header" flexDirection="row" justifyContent="space-between">
            <Text>
              <Text bold color={C.title}>{'⚑ CLAUDE NEEDS YOU'}</Text>
              <Text dimColor>{'  ·  '}</Text>
              <Text bold>{set.title}</Text>
            </Text>
            <Box key="band-buttons" flexDirection="row" flexShrink={0}>
              {/* Clear drops this set for good, so the box moves on instead of coming back to it. */}
              {openCount > 1 && (
                <Box key="clear-all-box" marginRight={2}>
                  <Button key="clear-all" plain dimColor label={`Clear all ${openCount}`} hover={{ bold: true }} onPress={() => clearAll()} />
                </Box>
              )}
              <Box key="clear-box" marginRight={2}>
                <Button key="clear" plain dimColor label="Clear" hover={{ bold: true }} onPress={() => clearShown()} />
              </Box>
              <Button key="band-close" plain label="✕" hover={{ bold: true }} onPress={() => update($, band, () => null)} />
            </Box>
          </Box>
          <Box key="tabs" flexDirection="row" marginBottom={1}>
            {decide.length > 0 && tabChip('decide', '?', 'Decide', C.decide, waiting.length)}
            {doing.length > 0 && tabChip('do', '▶', 'Do', C.do, doing.length - doing.filter(x => x.it.isDone).length)}
          </Box>
          {current === 'decide' ? decidePart : doPart}
        </Box>
        {below}
      </Box>
    )
  })

  on('command.run', { command: COMMAND }, async $ => {
    const open = nextSet(await read($, sets))
    if (!open) return { text: 'Nothing open: Claude needs nothing from you right now.' }
    await update($, band, () => open.id)
    return { text: `Showing ${open.title} (${countText(open)}) above the prompt.` }
  })
}
