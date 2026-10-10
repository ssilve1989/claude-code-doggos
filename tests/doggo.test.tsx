import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** Stands in for the engine beneath the mod; returns the store so tests can read it. */
function engine(on: On, tool: ToolCallResult = { result: 'ok' }): Map<string, unknown> {
  const store = new Map<string, unknown>()
  mock.clock(on, { now: 1_000_000 })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => tool)
  return store
}

const doggo = (args: string) =>
  ({ command: 'doggo', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } }) as const

const band = (bodyColumns = 80) =>
  ({
    plugin: 'doggo',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as const

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

test('a first session greets you, counts the session and draws the dog in the band', async ($, on) => {
  const store = engine(on)
  await $.session.start(START)
  expect(store.get('sessions')).toBe(1)
  expect(store.get('bond')).toBe(1)

  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Raster', key: 'dog' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "hi! I'm Biscuit!" })).toBeDefined()
})

test('a reload of the mod does not count the session twice', async ($, on) => {
  const store = engine(on)
  await $.session.start(START)
  await $.session.start(START)
  expect(store.get('sessions')).toBe(1)
})

test('the desktop app gets a line of text instead of a Raster', async ($, on) => {
  engine(on)
  await $.session.start({ ...START, surface: 'desktop' })
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /🐕 Biscuit/ })).toBeDefined()
})

test('a narrow band drops to a text line', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(10), surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBe(undefined)
  expect(await ui.find({ type: 'Text', text: /🐕 Biscuit/ })).toBeDefined()
})

test('a failed tool call worries the dog', async ($, on) => {
  engine(on, { result: 'no', isError: true })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(await ui.find({ type: 'Text', text: 'uh oh…' })).toBeDefined()
})

test('a Read call sniffs the file', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  expect(await ui.find({ type: 'Text', text: 'sniffing app.ts…' })).toBeDefined()
})

test('pets raise the bond up to the session cap; the fourth treat is refused', async ($, on) => {
  const store = engine(on)
  await $.session.start(START)
  const afterStart = Number(store.get('bond'))

  for (let i = 0; i < 7; i++) await $.command.run(doggo('pet'))
  expect(store.get('pets')).toBe(7)
  expect(store.get('bond')).toBe(afterStart + 5)

  for (let i = 0; i < 4; i++) await $.command.run(doggo('treat'))
  expect(store.get('treats')).toBe(3)
  expect(store.get('bond')).toBe(afterStart + 5 + 6)
})

test('commands answer in text only when the dog is hidden', async ($, on) => {
  const store = engine(on)
  await $.session.start(START)
  expect(await $.command.run(doggo('pet'))).toEqual({})
  await $.command.run(doggo('off'))
  expect(store.get('display')).toBe('off')
  expect((await $.command.run(doggo('treat'))).text).toBe('🐕 Biscuit: nom!')
  expect((await $.command.run(doggo('wat'))).text).toMatch(/^usage/)
})

test('renaming sticks in the store', async ($, on) => {
  const store = engine(on)
  await $.session.start(START)
  await $.command.run(doggo('name Sunny Boy'))
  expect(store.get('name')).toBe('Sunny Boy')
})
