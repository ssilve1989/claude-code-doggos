import type { AgentInfo, On, SessionMeasureInput, SessionMessage, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** Stands in for the engine beneath the mod; returns the store so tests can read it. */
// Local times, so night-owl behaviour does not depend on the machine's timezone
const AFTERNOON = new Date(2026, 0, 1, 13).getTime()
const NIGHT = new Date(2026, 0, 1, 1).getTime()

function engine(on: On, tool: ToolCallResult = { result: 'ok' }, now = AFTERNOON) {
  const store = new Map<string, unknown>()
  const notified: string[] = []
  const agents: AgentInfo[] = []
  const prompts: string[] = []
  const sounds: string[] = []
  const model = { reply: 'we dug up the bug!! good boy claude', delayMs: 0 }
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
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('agent.list', () => ({ value: [...agents] }))
  on('model.complete', async (_$, e) => {
    prompts.push(e.prompt)
    if (model.delayMs > 0) await clock.sleep(model.delayMs)
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true, text: model.reply, usage } }
  })
  on('audio.play', (_$, e) => {
    sounds.push('asset' in e.clip ? String(e.clip.asset) : '?')
    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  return { store, clock, notified, agents, prompts, sounds, model }
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

  await $.tool.call({ tool: 'Bash', command: 'cat missing.txt' })
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

test('passing tests set off the zoomies; failing ones get sad ears', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.tool.call({ tool: 'Bash', command: 'pnpm test' })
  expect(await ui.find({ type: 'Text', text: 'zoomies!!' })).toBeDefined()
})

test('a failing test run is sad, not just a generic failure', async ($, on) => {
  engine(on, { result: 'FAIL', isError: true })
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.tool.call({ tool: 'Bash', command: 'cargo test' })
  expect(await ui.find({ type: 'Text', text: 'tests failed… 🥺' })).toBeDefined()
})

test('a filling context warns once, and a compaction shakes it off', async ($, on) => {
  engine(on)
  const summary: SessionMessage[] = [{ role: 'user', text: 'summary so far', toolUses: [] }]
  on('session.compact', () => ({ messages: [...summary] }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  const usage = (percent: number): SessionMeasureInput => ({ context: { window: 200_000, percent }, rateLimits: [], changed: ['context'] })
  await $.session.measure(usage(92))
  expect(await ui.find({ type: 'Text', text: 'getting full in here… /compact?' })).toBeDefined()
  await $.session.compact({ trigger: 'manual', messages: [...summary] })
  expect(await ui.find({ type: 'Text', text: '*shakes off* fresh start!' })).toBeDefined()
})

const agent = (id: string, status: AgentInfo['status'], description = 'find the auth handler'): AgentInfo =>
  ({ id, description, type: 'Explore', status })

const pane = { plugin: 'doggo', component: 'Pane', requestId: 'doggo' } as const
const paneProps = (bodyColumns: number) =>
  ({ title: 'Biscuit', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }) as const

test('a running subagent brings a pup to the band, and it leaves when the agent is done', async ($, on) => {
  const { clock, agents } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  expect(await ui.find({ type: 'Raster', key: 'pack' })).toBe(undefined)

  agents.push(agent('a1', 'running'))
  await clock.advance(1_000)
  expect(await ui.find({ type: 'Raster', key: 'pack' })).toBeDefined()

  agents[0] = agent('a1', 'completed')
  await clock.advance(1_000 + 2_000 + 900)
  expect(await ui.find({ type: 'Raster', key: 'pack' })).toBe(undefined)
})

test('the pane labels settled pups with their task, and the desktop counts them', async ($, on) => {
  const { clock, agents } = engine(on)
  await $.session.start(START)
  agents.push(agent('a1', 'running', 'find the auth handler'), agent('a2', 'running', 'read the tests'))
  await clock.advance(2_000)

  const wide = await $.ui.mount({ ...pane, props: paneProps(80), surface: 'terminal' })
  expect(await wide.find({ type: 'Raster', key: 'pack' })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: 'find the auth handler' })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: 'read the tests' })).toBeDefined()

  const desktop = await $.ui.mount({ ...band(), surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /\(\+2 pups\)/ })).toBeDefined()
})

test('fetch plays in the band, ends, and counts the ball', async ($, on) => {
  const { store, clock } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.command.run(doggo('fetch'))
  expect(await ui.find({ type: 'Text', text: 'go get it!' })).toBeDefined()
  expect(store.get('balls')).toBe(1)
  await clock.advance(1_500)
  expect(await ui.find({ type: 'Text', text: 'fetching!!' })).toBeDefined()
  await clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: /again! again!|there was a SQUIRREL|mine!/ })).toBeDefined()
  // over: another fetch can start
  await $.command.run(doggo('fetch'))
  expect(store.get('balls')).toBe(2)
})

test('fetch counts toward the bond at most three times a session', async ($, on) => {
  const { store, clock } = engine(on)
  await $.session.start(START)
  const before = Number(store.get('bond'))
  for (let i = 0; i < 5; i++) {
    await $.command.run(doggo('fetch'))
    await clock.advance(10_000)
  }
  expect(store.get('balls')).toBe(5)
  expect(store.get('bond')).toBe(before + 3)
})

test('a locked trick gets a puzzled tilt; a known one plays', async ($, on) => {
  engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.command.run(doggo('trick roll'))
  expect(await ui.find({ type: 'Text', text: "don't know that one yet… (best friend)" })).toBeDefined()
  await $.command.run(doggo('trick sit'))
  expect(await ui.find({ type: 'Text', text: 'sit pretty!' })).toBeDefined()
  expect((await $.command.run(doggo('trick juggle'))).text).toBe('tricks: sit (and more to learn)')
})

test('with the dog hidden, fetch answers in text and does not get stuck', async ($, on) => {
  const { store } = engine(on)
  await $.session.start(START)
  await $.command.run(doggo('off'))
  expect((await $.command.run(doggo('fetch'))).text).toMatch(/^🐕 Biscuit: /)
  await $.command.run(doggo('fetch'))
  expect(store.get('balls')).toBe(2)
})

const turnStart = (turnId: string) => ({ text: 'go', turnId }) as const

test('with recaps on, a long turn gets a dog-speak line from Haiku', { options: { recap: true } }, async ($, on) => {
  const { clock, prompts } = engine(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.turn.start(turnStart('t1'))
  await $.tool.call({ tool: 'Read', file_path: '/repo/session.ts' })
  await $.turn.complete({ ...turnDone(45_000), turnId: 't1', answer: 'Fixed the session bug.' })
  await clock.advance(1)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('- sniffed session.ts')
  expect(prompts[0]).toContain('Fixed the session bug.')
  expect(await ui.find({ type: 'Text', text: 'we dug up the bug!! good boy claude' })).toBeDefined()
})

test('short turns, and recaps switched off, never call the model', async ($, on) => {
  const { clock, prompts } = engine(on)
  await $.session.start(START)
  await $.turn.complete(turnDone(120_000))
  await clock.advance(1)
  expect(prompts).toEqual([])
})

test('a recap that arrives after the next turn began is dropped', { options: { recap: true } }, async ($, on) => {
  const { clock, model } = engine(on)
  model.delayMs = 5_000
  await $.session.start(START)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await $.turn.start(turnStart('t1'))
  await $.turn.complete({ ...turnDone(45_000), turnId: 't1' })
  await clock.advance(1)
  await $.turn.start(turnStart('t2'))
  await clock.advance(6_000)
  expect(await ui.find({ type: 'Text', text: 'we dug up the bug!! good boy claude' })).toBe(undefined)
})

test('barks play only when switched on', { options: { barks: true } }, async ($, on) => {
  const { sounds } = engine(on)
  await $.session.start(START)
  await $.turn.complete(turnDone(61_000))
  await $.command.run(doggo('treat'))
  await $.command.run(doggo('fetch'))
  expect(sounds).toEqual(['sounds/bark.wav', 'sounds/woof.wav', 'sounds/bark.wav'])
})

test('no barks by default', async ($, on) => {
  const { sounds } = engine(on)
  await $.session.start(START)
  await $.turn.complete(turnDone(61_000))
  await $.command.run(doggo('treat'))
  expect(sounds).toEqual([])
})
