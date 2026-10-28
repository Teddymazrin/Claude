import type { EngineInterface, Register } from 'claude-code'

const TITLE = 'Guard Rails'
const COMMAND = 'guard-rails'
const LOG_SIZE = 20
const BLOCK = 'Block'
const ALLOW = 'Allow once'

export type Rule = { label: string; pattern: RegExp }
export type Hit = { label: string; what: string }
export type Entry = { at: number; tool: string; label: string; what: string; outcome: 'blocked' | 'allowed' }

// Commands checked in Bash and PowerShell alike.
export const COMMAND_RULES: readonly Rule[] = [
  { label: 'Recursive force delete (rm -rf)', pattern: /\brm\s+(-\w*r\w*f|-\w*f\w*r|(?=.*--recursive)(?=.*--force))/i },
  { label: 'Recursive force delete (Remove-Item -Recurse -Force)', pattern: /\b(Remove-Item|rm|del|rd|rmdir)\b(?=.*\s-Recurse\b)(?=.*\s-Force\b)/i },
  { label: 'Force push (git push --force)', pattern: /\bgit\s+push\b.*\s(--force(?!-with-lease)\b|-f\b)/ },
  { label: 'Discards uncommitted work (git reset --hard)', pattern: /\bgit\s+reset\b.*\s--hard\b/ },
  { label: 'Deletes untracked files (git clean -f)', pattern: /\bgit\s+clean\b.*\s-\w*f/ },
  { label: 'Deletes Azure resources (Remove-Az…)', pattern: /\bRemove-Az\w+/i },
  { label: 'Deletes Microsoft Graph objects (Remove-Mg…)', pattern: /\bRemove-Mg\w+/i },
  { label: 'Deletes Azure resources (az … delete)', pattern: /\baz\s+(?:[\w-]+\s+)*?delete\b/i },
  { label: 'Wipes a disk or volume', pattern: /\b(Format-Volume|Clear-Disk|diskpart|mkfs(\.\w+)?)\b/i },
  { label: 'Shuts down or restarts the computer', pattern: /\b(Stop-Computer|Restart-Computer|shutdown(\.exe)?\s)/i },
]

// Paths checked when a tool edits or writes a file.
export const FILE_RULES: readonly Rule[] = [
  { label: 'Edits Claude Code settings', pattern: /(^|\/)\.claude\/settings(\.local)?\.json$/i },
  { label: 'Edits a .env secrets file', pattern: /(^|\/)\.env(\.[^/]*)?$/i },
  { label: 'Edits SSH keys or config', pattern: /(^|\/)\.ssh\//i },
]

const SHELLS = ['Bash', 'PowerShell']
const FILE_TOOLS: Record<string, string> = { Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

// One line, short enough for a dialog.
export const snippet = (text: string, max = 80) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** The first rule a tool call trips, or undefined when it is fine. */
export const check = (tool: string, input: Record<string, unknown>): Hit | undefined => {
  if (SHELLS.includes(tool) && typeof input.command === 'string') {
    const rule = COMMAND_RULES.find(r => r.pattern.test(input.command as string))
    return rule && { label: rule.label, what: snippet(input.command) }
  }
  const key = FILE_TOOLS[tool]
  const path = key ? input[key] : undefined
  if (typeof path === 'string') {
    const rule = FILE_RULES.find(r => r.pattern.test(path.replace(/\\/g, '/')))
    return rule && { label: rule.label, what: path }
  }
  return undefined
}

/** The log with `entry` added, newest first, at most LOG_SIZE long. */
export const logged = (log: readonly Entry[], entry: Entry) => [entry, ...log].slice(0, LOG_SIZE)

export const logText = (log: readonly Entry[]) =>
  log.length === 0
    ? `${TITLE}: nothing stopped yet.`
    : [
        `${TITLE}: last ${log.length} risky call${log.length === 1 ? '' : 's'}, newest first`,
        ...log.map(e => `${new Date(e.at).toLocaleString()}  ${e.outcome === 'blocked' ? 'BLOCKED' : 'allowed'}  ${e.tool}: ${e.label}\n    ${e.what}`),
      ].join('\n')

async function storedLog($: EngineInterface): Promise<Entry[]> {
  const value = await $.store.get('log')
  return Array.isArray(value) ? (value as Entry[]) : []
}

async function record($: EngineInterface, tool: string, hit: Hit, outcome: Entry['outcome']) {
  const entry = { at: await $.clock.now(), tool, label: hit.label, what: hit.what, outcome }
  await $.store.set('log', logged(await storedLog($), entry))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show what Guard Rails stopped or let through' })
    return next(e)
  })

  // Asks before a risky call runs; anything else passes untouched.
  on('tool.call', async ($, e, next) => {
    const hit = check(e.tool, e as unknown as Record<string, unknown>)
    if (!hit) return next(e)
    // Dismissed, or nobody to ask (claude -p): blocked.
    const answer = await $.ui
      .ask(`${hit.label}: ${hit.what} · Let it run?`, { options: [BLOCK, ALLOW], header: TITLE })
      .catch(() => BLOCK)
    if (answer === ALLOW) {
      await record($, e.tool, hit, 'allowed').catch(() => {})
      return next(e)
    }
    await record($, e.tool, hit, 'blocked').catch(() => {})
    $.ui.toast(`${TITLE} blocked: ${hit.label}`)
    return { deny: `${TITLE} blocked this call (${hit.label}). Do not retry it or work around it; ask the user first.` }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${TITLE}: its check failed, so the call was blocked.` }))

  on('command.run', { command: COMMAND }, async $ => ({ text: logText(await storedLog($)) }))
}
