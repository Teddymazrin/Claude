import type { EngineInterface, Register } from 'claude-code'

const COMMAND = 'tenant-lens'
// Rereads the files this often while the session is idle, to catch a sign-in made in another window.
const REFRESH_MS = 60_000

// Palette: Azure blue for the label, gold for the subscription, red when it looks like production.
const BLUE = '#3b9eea'
const GOLD = '#d9a441'
const ORANGE = '#e06c3c'
const RED = '#e5484d'
// The details' dark look, matching Control Panel's pane.
const BLACK = '#0c0c0e'
const INK = '#e8e6e3'
const AZURE = '#0078d4'
const MUTED = '#7d8190'

/** Where a tool points: one subscription in one tenant, as one account. */
export interface AzureContext {
  subscription: string
  subscriptionId: string
  tenant: string
  tenantId: string
  account: string
}

export interface Contexts {
  cli: AzureContext | null
  ps: AzureContext | null
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw.replace(/^﻿/, ''))
  } catch {
    return null
  }
}

/** az CLI: the subscription marked `isDefault` in azureProfile.json. */
export function parseCli(raw: string): AzureContext | null {
  const subs = (parse(raw) as { subscriptions?: Record<string, unknown>[] } | null)?.subscriptions
  const sub = Array.isArray(subs) ? subs.find(s => s.isDefault === true) : undefined
  if (!sub) return null
  const tenantId = text(sub.tenantId)
  return {
    subscription: text(sub.name),
    subscriptionId: text(sub.id),
    tenant: text(sub.tenantDefaultDomain) || text(sub.tenantDisplayName) || tenantId,
    tenantId,
    account: text((sub.user as { name?: unknown } | undefined)?.name),
  }
}

/** Az PowerShell: the context named by `DefaultContextKey` in AzureRmContext.json. */
export function parsePs(raw: string): AzureContext | null {
  const file = parse(raw) as { DefaultContextKey?: unknown; Contexts?: Record<string, any> } | null
  const ctx = file?.Contexts?.[text(file.DefaultContextKey)]
  if (!ctx) return null
  const tenantId = text(ctx.Tenant?.Id)
  const props = ctx.Tenant?.ExtendedProperties ?? {}
  return {
    subscription: text(ctx.Subscription?.Name),
    subscriptionId: text(ctx.Subscription?.Id),
    tenant: text(ctx.Tenant?.Directory) || text(props.DefaultDomain) || text(props.DisplayName) || tenantId,
    tenantId,
    account: text(ctx.Account?.Id),
  }
}

/** Names like `Prod`, `Production`, `prd` get the red warning colour. */
export const looksProd = (name: string) => /(^|[^a-z])(prod|production|prd|live)([^a-z]|$)/i.test(name)

/** True when both tools are signed in but point at different subscriptions. */
export const differ = (c: Contexts) => !!c.cli && !!c.ps && c.cli.subscriptionId.toLowerCase() !== c.ps.subscriptionId.toLowerCase()

export function detailText(c: Contexts): string {
  const block = (label: string, x: AzureContext | null) =>
    x
      ? [`${label}`, `  Subscription: ${x.subscription} (${x.subscriptionId})`, `  Tenant:       ${x.tenant}${x.tenant === x.tenantId ? '' : ` (${x.tenantId})`}`, `  Account:      ${x.account}`].join('\n')
      : `${label}\n  not signed in`
  const lines = [block('az CLI', c.cli), block('Az PowerShell', c.ps)]
  if (differ(c)) lines.push('The two point at different subscriptions.')
  return lines.join('\n\n')
}

/** A tenant's domain from the file itself, when az CLI or Az PowerShell saved one. */
export const fileDomain = (x: AzureContext) => (/^[^\s@]+\.[a-z]{2,}$/i.test(x.tenant) ? x.tenant : '')

/** Tenant id → default domain, from ARM's `GET /tenants` (`value[].tenantId`, `defaultDomain`). */
export function parseTenants(raw: string): Record<string, string> {
  const list = (parse(raw) as { value?: { tenantId?: unknown; defaultDomain?: unknown }[] } | null)?.value
  const found: Record<string, string> = {}
  for (const t of Array.isArray(list) ? list : []) {
    const id = text(t.tenantId).toLowerCase()
    const domain = text(t.defaultDomain)
    if (id && domain) found[id] = domain
  }
  return found
}

let current: Contexts = { cli: null, ps: null }
// Domains looked up so far (kept across sessions), and whether a lookup is running or failed this session.
let domains: Record<string, string> = {}
let lookup: 'idle' | 'running' | 'failed' = 'idle'
let timer: { cancel(): void } | undefined
// Whether the button's details are revealed.
let isOpen = false

async function home($: EngineInterface) {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

/**
 * Asks az CLI for each tenant's default domain, once per tenant, ever: the files don't hold it
 * when you signed in with `--tenant`. A network call to Azure Resource Manager made by az with
 * your own sign-in; it uses no Claude tokens. Fails quietly when az isn't signed in.
 */
async function lookupDomains($: EngineInterface) {
  if (lookup === 'running') return
  lookup = 'running'
  $.ui.invalidate('ui.render')
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const argv = [isWindows ? 'az.cmd' : 'az', 'rest', '--method', 'get', '--url', 'https://management.azure.com/tenants?api-version=2022-12-01', '--only-show-errors']
  const found = await $.process
    .run(argv, { timeoutMs: 20_000 })
    .then(r => (r.exitCode === 0 ? parseTenants(r.stdout) : {}))
    .catch(() => ({}))
  if (Object.keys(found).length > 0) {
    domains = { ...domains, ...found }
    await $.store.set('domains', domains).catch(() => {})
  }
  lookup = Object.keys(found).length > 0 ? 'idle' : 'failed'
  $.ui.invalidate('ui.render')
}

/** The domain to show for a tenant: the file's, else one looked up earlier. */
const domainOf = (x: AzureContext) => fileDomain(x) || domains[x.tenantId.toLowerCase()] || ''

/** Reads both files (local only: no sign-in, no network, no tokens) and redraws if anything changed. */
async function refresh($: EngineInterface) {
  const h = await home($)
  const cliDir = ((await $.env.get('AZURE_CONFIG_DIR')) ?? `${h}/.azure`).replace(/\\/g, '/')
  const [cli, ps] = await Promise.all([
    $.fs.read(`${cliDir}/azureProfile.json`).then(parseCli).catch(() => null),
    $.fs.read(`${h}/.Azure/AzureRmContext.json`).then(parsePs).catch(() => null),
  ])
  const next = { cli, ps }
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  if (lookup === 'failed') lookup = 'idle'
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Show the Azure tenant, subscription and account in use' })
    domains = ((await $.store.get('domains').catch(() => undefined)) as Record<string, string> | undefined) ?? {}
    await refresh($)
    timer?.cancel()
    timer = $.clock.every(REFRESH_MS, () => refresh($))
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await refresh($)
    return { text: detailText(current) }
  }).catch(() => ({ text: 'Tenant Lens could not read the Azure files.' }))

  // A sign-in or Set-AzContext usually happens in a shell call, so reread after each one.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await refresh($).catch(() => {})
    return ran
  }).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    const ran = await next(e)
    await refresh($).catch(() => {})
    return ran
  }).catch(($, e, next) => next(e))

  // An "Azure Context" button beside Control Panel's; a click reveals the tenant and subscription above it.
  // Whichever of the two hooks runs outside, the buttons end up side by side on the bottom line.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    const main = current.cli ?? current.ps
    if (!main) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const isEngine = 'type' in below && below.type === 'engine'
    const isEmptyEngine = isEngine && e.props.modes.length === 0
    const isProd = [current.cli, current.ps].some(x => x && looksProd(x.subscription))

    const toggle = () => {
      isOpen = !isOpen
      $.ui.invalidate('ui.render')
      // Opening is the one time a domain is looked up, and only for a tenant with none known.
      const missing = [current.cli, current.ps].some(x => x && !domainOf(x))
      if (isOpen && missing && lookup === 'idle') void lookupDomains($)
    }
    // The name on one line, its id under it, so no line runs much past 50 columns.
    const lookupNote = () =>
      lookup === 'running' ? 'looking up the domain…' : lookup === 'failed' ? 'domain unknown: run az login to show it' : ''
    const field = (key: string, label: string, name: string, id: string, color = INK) => (
      <Box key={key} flexDirection="column">
        <Box flexDirection="row">
          <Text color={MUTED}>{`${label}:`.padEnd(15)}</Text>
          <Text bold color={color}>{name}</Text>
        </Box>
        {name !== id ? <Text color={MUTED}>{`${' '.repeat(15)}${id}`}</Text> : null}
      </Box>
    )
    const block = (label: string, x: AzureContext) => (
      <Box key={`tenant-lens-${label}`} flexDirection="column">
        {differ(current) ? <Text color={BLUE}>{label}</Text> : null}
        {field(`${label}-tenant`, 'Tenant', domainOf(x) || x.tenantId, x.tenantId)}
        {!domainOf(x) && lookupNote() ? <Text color={MUTED}>{`${' '.repeat(15)}${lookupNote()}`}</Text> : null}
        {field(`${label}-sub`, 'Subscription', x.subscription || x.subscriptionId, x.subscriptionId, looksProd(x.subscription) ? RED : GOLD)}
      </Box>
    )
    const details = isOpen ? (
      <Box key="tenant-lens-details" flexDirection="column" backgroundColor={BLACK} paddingX={1}>
        {current.cli ? block('az CLI', current.cli) : null}
        {current.ps && (differ(current) || !current.cli) ? block('Az PowerShell', current.ps) : null}
        {differ(current) ? <Text color={ORANGE}>az CLI and Az PowerShell point at different subscriptions</Text> : null}
      </Box>
    ) : null
    // Red on production, so it warns while closed too.
    const button = (
      <Box key="tenant-lens-button" backgroundColor={isProd ? RED : AZURE} paddingX={1}>
        <Button key="tenant-lens-toggle" plain label={`${isOpen ? '▾' : '☁'} Azure Context${differ(current) ? ' ≠' : ''}`} hover={{ bold: true }} onPress={toggle} />
      </Box>
    )
    const mine = (
      <Box flexDirection="column" alignItems="flex-end">
        {details}
        {button}
      </Box>
    )

    // Another mod's corner (Control Panel's chip) is beneath: sit to its left, on the bottom line.
    if (!isEngine)
      return (
        <Box flexDirection="row" alignItems="flex-end">
          <Box marginRight={1}>{mine}</Box>
          {below}
        </Box>
      )
    // The engine's modes are beneath: keep them above, the button on the bottom line.
    return (
      <Box flexDirection="column" alignItems="flex-end">
        {!isEmptyEngine && below}
        {mine}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
