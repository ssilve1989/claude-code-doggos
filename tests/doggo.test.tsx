import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** Stands in for the engine beneath the mod; returns the store so tests can read it. */
// Local times, so night-owl behaviour does not depend on the machine's timezone
const AFTERNOON = new Date(2026, 0, 1, 13).getTime()
const NIGHT = new Date(2026, 0, 1, 1).getTime()

function engine(on: On, tool: ToolCallResult = { result: 'ok' }, now = AFTERNOON) {
  const store = new Map<string, unknown>()
  const notified: string[] = []
  const clock = mock.clock(on, { now })
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
  on('tool.check', () => ({ decision: 'ask' }))
  on('ui.notify', (_$, e) => {
    notified.push(e.text)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { store, clock, notified }
}

const prompt = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const

const turnDone = (durationMs: number, extra: { isAborted?: boolean; agentId?: string } = {}) =>
  ({ answer: '', durationMs, isAborted: false, turnId: 't1', reason: 'answer', ...extra }) as const

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
  const { store } = engine(on)
  await $.session.start(START)
  expect(store.get('sessions')).toBe(1)
  expect(store.get('bond')).toBe(1)

  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Raster', key: 'dog' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: "hi! I'm Biscuit!" })).toBeDefined()
})

test('a reload of the mod does not count the session twice', async ($, on) => {
  const { store } = engine(on)
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
  const { store } = engine(on)
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
  const { store } = engine(on)
  await $.session.start(START)
  expect(await $.command.run(doggo('pet'))).toEqual({})
  await $.command.run(doggo('off'))
  expect(store.get('display')).toBe('off')
  expect((await $.command.run(doggo('treat'))).text).toBe('🐕 Biscuit: nom!')
  expect((await $.command.run(doggo('wat'))).text).toMatch(/^usage/)
})

test('renaming sticks in the store', async ($, on) => {
  const { store } = engine(on)
  await $.session.start(START)
  await $.command.run(doggo('name Sunny Boy'))
  expect(store.get('name')).toBe('Sunny Boy')
})

test('a long turn barks, a short or aborted one does not', async ($, on) => {
  const { notified } = engine(on)
  await $.session.start(START)
  await $.turn.complete(turnDone(59_000))
  await $.turn.complete(turnDone(120_000, { isAborted: true }))
  expect(notified).toEqual([])
  await $.turn.complete(turnDone(61_000))
  expect(notified).toEqual(["Claude's done! 🐾"])
})

test("a subagent finishing neither barks nor ends the dog's working mood", async ($, on) => {
  const { notified } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/app.ts' })
  await $.turn.complete(turnDone(300_000, { agentId: 'sub-1' }))
  expect(notified).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'sniffing app.ts…' })).toBeDefined()
})

test('an approval left waiting barks after 30 seconds', async ($, on) => {
  const { clock, notified } = engine(on)
  await $.session.start(START)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'u1' })
  await clock.advance(29_000)
  expect(notified).toEqual([])
  await clock.advance(2_000)
  expect(notified).toEqual(['Claude needs you!'])
})

test('an approval answered in time does not bark', async ($, on) => {
  const { clock, notified } = engine(on)
  await $.session.start(START)
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'u2' })
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u2' })
  await clock.advance(60_000)
  expect(notified).toEqual([])
})

test('the terminal spinner speaks dog; the desktop keeps its own words', async ($, on) => {
  engine(on)
  on('ui.render', { component: 'Spinner' }, ($, e) => $.ui.resolve(e).Text({ children: [e.props.word] }))
  await $.session.start(START)
  const props = { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } as const
  const terminal = await $.ui.mount({ plugin: 'doggo', component: 'Spinner', props, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: 'Pondering' })).toBeDefined()
  const desktop = await $.ui.mount({ plugin: 'doggo', component: 'Spinner', props, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: 'Sauteing' })).toBeDefined()
})

test('a late-night prompt gets a yawn, once an hour', async ($, on) => {
  engine(on, { result: 'ok' }, NIGHT)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.prompt.submit(prompt('one more thing'))
  expect(await ui.find({ type: 'Text', text: "it's late… bed?" })).toBeDefined()
  await $.prompt.submit(prompt('and another'))
  expect(await ui.find({ type: 'Text', text: 'ooh, a job!' })).toBeDefined()
})

test('a long enough work streak brings the leash', { options: { breakAfterMinutes: 1 } }, async ($, on) => {
  const { clock } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.prompt.submit(prompt('keep going'))
  await clock.advance(30_000)
  await $.prompt.submit(prompt('keep going'))
  await clock.advance(30_000)
  expect(await ui.find({ type: 'Text', text: "walk? you've been at it 1m" })).toBeDefined()
})
