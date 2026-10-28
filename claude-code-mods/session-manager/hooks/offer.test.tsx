import { expect, mock, test } from 'claude-code/testing'

import { parseAsk } from './handoff'

const BAND = {
  plugin: 'session-manager',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80, scroll: { bodyRows: 19 } },
  viewport: { columns: 84, rows: 40 },
} as const

test('/handoff ask shows the box now, at a given level or the context’s own', () => {
  expect(parseAsk('ask')).toEqual({})
  expect(parseAsk(' Preview ')).toEqual({})
  expect(parseAsk('ask 80')).toEqual({ percent: 80 })
  expect(parseAsk('open')).toBeNull()
})

test('/handoff ask 80 shows the urgent wording', async ($, on) => {
  mock.store(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  await $.command.run({ command: 'handoff', args: 'ask 80' } as never)
  expect(await ui.find({ type: 'Text', text: 'This chat is 80% full' })).toBeTruthy()
  expect(
    await ui.find({ type: 'Text', text: ' · Almost full: soon Claude shrinks the chat and forgets details, and each message costs the most usage. Start fresh now.' }),
  ).toBeTruthy()
  await ui.unmount()
})

test('the offer box shows above the prompt, and Not now closes it', async ($, on) => {
  mock.store(on)
  on('session.usage', () => ({ value: { context: { percent: 52 }, rateLimits: [] } }) as never)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ key: 'handoff-offer' })).toBeFalsy()

  await $.command.run({ command: 'handoff', args: 'ask' } as never)
  expect(await ui.find({ key: 'handoff-offer' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: 'This chat is 52% full' })).toBeTruthy()
  expect(await ui.find({ key: 'offer-write' })).toBeTruthy()

  await ui.press({ key: 'offer-later' })
  expect(await ui.find({ key: 'handoff-offer' })).toBeFalsy()
  await ui.unmount()
})
