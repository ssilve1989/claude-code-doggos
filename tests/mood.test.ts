import { expect, test } from 'claude-code/testing'

import { LIE_AFTER_MS, REACTION_MS, SLEEP_AFTER_MS, initialMood, poseOf, step, tick } from '../hooks/mood'

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

test('a filling context makes the idle dog drowsy, then panting with one warning', async () => {
  let m = initialMood(T0)
  m = step(m, { kind: 'context', level: 'drowsy' }, T0)
  expect(poseOf(m, T0)).toBe('drowsy')
  m = step(m, { kind: 'context', level: 'full' }, T0)
  expect(poseOf(m, T0)).toBe('pant')
  expect(m.line).toBe('getting full in here… /compact?')
  const again = step({ ...m, line: 'x' }, { kind: 'context', level: 'full' }, T0)
  expect(again.line).toBe('x')
})

test('compaction shakes off and resets the context level', async () => {
  const full = step(initialMood(T0), { kind: 'context', level: 'full' }, T0)
  const m = step(full, { kind: 'compacted' }, T0)
  expect(poseOf(m, T0)).toBe('shake')
  expect(m.line).toBe('*shakes off* fresh start!')
  expect(m.context).toBe('ok')
})

test('milestones', async () => {
  const m = step(initialMood(T0), { kind: 'turnStart' }, T0)
  const cases = [
    { which: 'test', isOk: true, pose: 'zoomies', line: 'zoomies!!' },
    { which: 'test', isOk: false, pose: 'worried', line: 'tests failed… 🥺' },
    { which: 'commit', isOk: true, pose: 'happy', line: 'committed! 🦴' },
    { which: 'push', isOk: true, pose: 'excited', line: 'shipped it!' },
    { which: 'commit', isOk: false, pose: 'worried', line: 'uh oh…' },
  ] as const
  for (const c of cases) {
    const r = step(m, { kind: 'milestone', which: c.which, isOk: c.isOk }, T0)
    expect([c.which, c.isOk, poseOf(r, T0), r.line]).toEqual([c.which, c.isOk, c.pose, c.line])
  }
})

test('a long quiet stretch mid-turn lies the dog down until the next tool call', async () => {
  let m = step(initialMood(T0), { kind: 'turnStart' }, T0)
  expect(tick(m, T0 + LIE_AFTER_MS - 1) === m).toBe(true)
  m = tick(m, T0 + LIE_AFTER_MS + 1)
  expect(poseOf(m, T0 + LIE_AFTER_MS + 1)).toBe('lie')
  expect(m.line).toBe("I'll wait here…")
  m = step(m, { kind: 'tool', tool: 'Read', target: 'a.ts' }, T0 + LIE_AFTER_MS + 2)
  expect(poseOf(m, T0 + LIE_AFTER_MS + 2)).toBe('sniff')
})

test('say shows a pose and a line briefly', async () => {
  const m = step(initialMood(T0), { kind: 'say', pose: 'tilt', line: "don't know that one yet…" }, T0)
  expect(poseOf(m, T0)).toBe('tilt')
  expect(m.line).toBe("don't know that one yet…")
})
