import { expect, test } from 'claude-code/testing'

import { REACTION_MS, SLEEP_AFTER_MS, initialMood, poseOf, step, tick } from '../hooks/mood'

const T0 = 1_000_000

test('a prompt excites the dog briefly, then it settles', async () => {
  const m = step(initialMood(T0), { kind: 'prompt' }, T0)
  expect(poseOf(m, T0)).toBe('excited')
  expect(m.line).toBe('ooh, a job!')
  const later = tick(m, T0 + REACTION_MS + 1)
  expect(later.reaction).toBe(null)
  expect(poseOf(later, T0 + REACTION_MS + 1)).toBe('idle')
})

test('tool calls choose a pose and a line', async () => {
  const working = step(initialMood(T0), { kind: 'turnStart' }, T0)
  const cases = [
    { tool: 'Read', target: 'src/app.ts', pose: 'sniff', line: 'sniffing app.ts…' },
    { tool: 'Grep', target: 'TODO', pose: 'sniff', line: 'sniffing TODO…' },
    { tool: 'Edit', target: '/a/b/app.ts', pose: 'dig', line: 'burying a change in app.ts' },
    { tool: 'Bash', target: 'npm test', pose: 'walk', line: 'fetching `npm test`…' },
    { tool: 'Agent', target: '', pose: 'walk', line: 'calling the pack…' },
    { tool: 'WebFetch', target: '', pose: 'walk', line: 'fetching WebFetch…' },
  ] as const
  for (const c of cases) {
    const m = step(working, { kind: 'tool', tool: c.tool, target: c.target }, T0)
    expect(poseOf(m, T0)).toBe(c.pose)
    expect(m.line).toBe(c.line)
  }
})

test('a failed tool worries the dog, and finishing a turn makes it happy', async () => {
  let m = step(initialMood(T0), { kind: 'turnStart' }, T0)
  m = step(m, { kind: 'toolFailed' }, T0)
  expect(poseOf(m, T0)).toBe('worried')
  m = step(m, { kind: 'turnComplete' }, T0 + 10)
  expect(poseOf(m, T0 + 10)).toBe('happy')
  expect(m.base).toBe('idle')
  expect(poseOf(tick(m, T0 + 10 + REACTION_MS + 1), T0 + 10 + REACTION_MS + 1)).toBe('idle')
})

test('a permission question tilts the head until the next tool call', async () => {
  let m = step(initialMood(T0), { kind: 'turnStart' }, T0)
  m = step(m, { kind: 'ask' }, T0)
  expect(poseOf(m, T0)).toBe('tilt')
  expect(m.line).toBe('can we?')
  m = step(m, { kind: 'tool', tool: 'Bash', target: 'ls' }, T0)
  expect(poseOf(m, T0)).toBe('walk')
})

test('the dog sleeps after ten idle minutes and wakes on the next event', async () => {
  const m = initialMood(T0)
  expect(tick(m, T0 + SLEEP_AFTER_MS - 1).base).toBe('idle')
  const asleep = tick(m, T0 + SLEEP_AFTER_MS + 1)
  expect(asleep.base).toBe('asleep')
  expect(poseOf(asleep, T0 + SLEEP_AFTER_MS + 1)).toBe('sleep')
  const woken = step(asleep, { kind: 'prompt' }, T0 + SLEEP_AFTER_MS + 2)
  expect(woken.base).toBe('idle')
  expect(woken.line).toBe('huh? oh! ooh, a job!')
})

test('the dog does not fall asleep mid-turn', async () => {
  const m = step(initialMood(T0), { kind: 'turnStart' }, T0)
  expect(tick(m, T0 + SLEEP_AFTER_MS * 2).base).toBe('working')
})

test('tick returns the same mood when nothing changes', async () => {
  const m = initialMood(T0)
  expect(tick(m, T0 + 5) === m).toBe(true)
})

test('pets and treats react', async () => {
  const m = initialMood(T0)
  expect(poseOf(step(m, { kind: 'pet' }, T0), T0)).toBe('happy')
  const nom = step(m, { kind: 'treat', isAccepted: true }, T0)
  expect(poseOf(nom, T0)).toBe('excited')
  expect(nom.line).toBe('nom!')
  const full = step(m, { kind: 'treat', isAccepted: false }, T0)
  expect(poseOf(full, T0)).toBe('tilt')
  expect(full.line).toBe('too full… maybe later')
})

test('the leash and yawn nudges show their poses', async () => {
  const m = initialMood(T0)
  const leash = step(m, { kind: 'leash', line: "walk? you've been at it 1h30" }, T0)
  expect(poseOf(leash, T0)).toBe('leash')
  expect(leash.line).toBe("walk? you've been at it 1h30")
  // a reminder stays up long enough to notice
  expect(poseOf(tick(leash, T0 + REACTION_MS + 1), T0 + REACTION_MS + 1)).toBe('leash')
  const yawn = step(m, { kind: 'yawn' }, T0)
  expect(poseOf(yawn, T0)).toBe('yawn')
  expect(yawn.line).toBe("it's late… bed?")
})

test('tick takes a shorter sleep threshold at night', async () => {
  const m = initialMood(T0)
  expect(tick(m, T0 + 2 * 60_000 + 1, 2 * 60_000).base).toBe('asleep')
  expect(tick(m, T0 + 2 * 60_000 + 1).base).toBe('idle')
})
