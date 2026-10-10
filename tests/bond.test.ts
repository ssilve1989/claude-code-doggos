import { expect, test } from 'claude-code/testing'

import { TRICKS, bondLevel, greeting, knownTricks, levelUp, toCount, toDisplay, trickFor } from '../hooks/bond'

const DAY = 24 * 60 * 60 * 1000

test('bond levels and hearts', async () => {
  expect(bondLevel(0)).toEqual({ title: 'stranger', hearts: 0 })
  expect(bondLevel(10).title).toBe('friend')
  expect(bondLevel(50).title).toBe('best friend')
  expect(bondLevel(200)).toEqual({ title: 'soulmate', hearts: 4 })
  expect(levelUp(9, 10)).toBe('friend')
  expect(levelUp(10, 11)).toBe(null)
})

test('greetings depend on history', async () => {
  const now = 100 * DAY
  expect(greeting('Biscuit', 0, 0, now)).toEqual({ line: "hi! I'm Biscuit!", isExcited: true })
  expect(greeting('Biscuit', 4, now - 3 * DAY, now)).toEqual({ line: "you're BACK!!", isExcited: true })
  expect(greeting('Biscuit', 4, now - 60_000, now).line).toBe('*wags*')
  expect(greeting('Biscuit', 4, now - 2 * DAY, now).line).toBe('hey, you!')
})

test('stored values are checked before use', async () => {
  expect(toCount(5)).toBe(5)
  expect(toCount('5')).toBe(0)
  expect(toCount(-2)).toBe(0)
  expect(toCount(undefined)).toBe(0)
  expect(toDisplay('pane')).toBe('pane')
  expect(toDisplay('sideways')).toBe(undefined)
})

test('each bond level teaches a trick', async () => {
  expect(knownTricks(0)).toEqual(['sit'])
  expect(knownTricks(10)).toEqual(['sit', 'paw'])
  expect(knownTricks(200)).toEqual(['sit', 'paw', 'roll', 'dead'])
  expect(trickFor('best friend')).toBe('roll')
  expect(trickFor('stranger')).toBe('sit')
  expect(TRICKS.dead).toEqual({ title: 'play dead', level: 'soulmate' })
})
