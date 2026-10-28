import { expect, test } from 'claude-code/testing'

import { detailText, differ, fileDomain, looksProd, parseCli, parsePs, parseTenants } from './register'

const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47'

const cliProfile = '﻿' + JSON.stringify({
  installationId: 'x',
  subscriptions: [
    { id: 'aaa', name: 'Dev', isDefault: false, tenantId: TENANT, user: { name: 'me@contoso.com', type: 'user' } },
    { id: 'bbb', name: 'Contoso Prod', isDefault: true, tenantId: TENANT, user: { name: 'me@contoso.com', type: 'user' } },
  ],
})

const psContext = JSON.stringify({
  DefaultContextKey: 'Dev (aaa) - tenant - me@contoso.com',
  Contexts: {
    'Dev (aaa) - tenant - me@contoso.com': {
      Account: { Id: 'me@contoso.com', Type: 'User' },
      Tenant: { Id: TENANT, Directory: 'contoso.onmicrosoft.com' },
      Subscription: { Id: 'AAA', Name: 'Dev' },
    },
  },
})

test('reads the default az CLI subscription, BOM and all', () => {
  const c = parseCli(cliProfile)
  expect(c?.subscription).toBe('Contoso Prod')
  expect(c?.tenantId).toBe(TENANT)
  expect(c?.account).toBe('me@contoso.com')
})

test('reads the default Az PowerShell context', () => {
  const c = parsePs(psContext)
  expect(c?.subscription).toBe('Dev')
  expect(c?.tenant).toBe('contoso.onmicrosoft.com')
})

test('signed out or broken files read as nothing', () => {
  expect(parseCli('')).toBeNull()
  expect(parseCli('{"subscriptions":[]}')).toBeNull()
  expect(parsePs('not json')).toBeNull()
  expect(parsePs('{"DefaultContextKey":"Default","Contexts":{}}')).toBeNull()
})

test('spots production names', () => {
  expect(looksProd('Contoso Prod')).toBe(true)
  expect(looksProd('sub-prd-01')).toBe(true)
  expect(looksProd('Production')).toBe(true)
  expect(looksProd('Product Team Dev')).toBe(false)
  expect(looksProd('Dev')).toBe(false)
})

test('flags when az and Az point at different subscriptions', () => {
  const cli = parseCli(cliProfile)
  const ps = parsePs(psContext)
  expect(differ({ cli, ps })).toBe(true)
  expect(differ({ cli: ps, ps })).toBe(false)
  expect(differ({ cli, ps: null })).toBe(false)
  expect(detailText({ cli, ps })).toContain('different subscriptions')
  expect(detailText({ cli: null, ps: null })).toContain('not signed in')
})

test('finds a domain in the file only when it is one', () => {
  expect(fileDomain(parsePs(psContext)!)).toBe('contoso.onmicrosoft.com')
  expect(fileDomain(parseCli(cliProfile)!)).toBe('')
  expect(fileDomain({ ...parsePs(psContext)!, tenant: 'Contoso Ltd' })).toBe('')
})

test('reads tenant domains from the ARM tenants list', () => {
  const raw = JSON.stringify({ value: [{ tenantId: TENANT.toUpperCase(), defaultDomain: 'contoso.onmicrosoft.com' }, { tenantId: 'x' }] })
  expect(parseTenants(raw)).toEqual({ [TENANT]: 'contoso.onmicrosoft.com' })
  expect(parseTenants('ERROR: expired')).toEqual({})
})
