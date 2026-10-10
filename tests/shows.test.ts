import { expect, test } from 'claude-code/testing'

import { HEADROOM, headIndex, withShowHeads } from '../hooks/looks'
import { pickOutcome, showDuration, showFrame } from '../hooks/shows'
import { OUTFITS, SHOWS, SPRITES } from '../hooks/sprites'
import type { Show } from '../types'

const T0 = 1_000_000
const fetch = (outcome: Show['outcome']): Show => ({ kind: 'fetch', outcome, startedAt: T0 })

function lines(show: Show, size: 'big' | 'mini'): string[] {
  const seen: string[] = []
  for (let t = T0; t < T0 + showDuration(show, SHOWS[size], SPRITES[size]); t += 50) {
    const f = showFrame(show, t, SHOWS[size], SPRITES[size])
    if (f && seen.at(-1) !== f.line) seen.push(f.line)
  }
  return seen
}

test('fetch: throw, run off, an empty frame while away, run back, then the outcome', async () => {
  expect(lines(fetch('drop'), 'big')).toEqual(['go get it!', 'BALL!', 'fetching!!', 'got it!', 'again! again!'])
  expect(lines(fetch('squirrel'), 'big').at(-1)).toBe('there was a SQUIRREL')
  expect(lines(fetch('keep'), 'big').at(-1)).toBe('mine!')
})

test('while the dog is away its frame is empty', async () => {
  const show = fetch('drop')
  let sawEmpty = false
  for (let t = T0; t < T0 + showDuration(show, SHOWS.big, SPRITES.big); t += 50) {
    const f = showFrame(show, t, SHOWS.big, SPRITES.big)
    if (f?.line === 'fetching!!') {
      expect(/^0+$/.test(f.frame)).toBe(true)
      sawEmpty = true
    }
  }
  expect(sawEmpty).toBe(true)
})

test('a show ends: past its duration there is no frame', async () => {
  for (const show of [fetch('drop'), { kind: 'roll', outcome: 'drop', startedAt: T0 } as const]) {
    for (const size of ['big', 'mini'] as const) {
      const end = T0 + showDuration(show, SHOWS[size], SPRITES[size])
      expect(showFrame(show, end - 1, SHOWS[size], SPRITES[size])).toBeDefined()
      expect(showFrame(show, end, SHOWS[size], SPRITES[size])).toBe(null)
    }
  }
})

test('every frame is the full sprite size', async () => {
  for (const kind of ['fetch', 'sit', 'paw', 'roll', 'dead'] as const) {
    for (const size of ['big', 'mini'] as const) {
      const show: Show = { kind, outcome: 'keep', startedAt: T0 }
      const f = showFrame(show, T0 + 300, SHOWS[size], SPRITES[size])
      expect(f?.frame.length).toBe(SHOWS[size].width * SHOWS[size].height)
    }
  }
})

test('tricks have their lines', async () => {
  expect(lines({ kind: 'sit', outcome: 'drop', startedAt: T0 }, 'big')).toContain('sit pretty!')
  expect(lines({ kind: 'paw', outcome: 'drop', startedAt: T0 }, 'mini')).toContain('high five!')
  expect(lines({ kind: 'roll', outcome: 'drop', startedAt: T0 }, 'big')).toContain('rolling over!')
  expect(lines({ kind: 'dead', outcome: 'drop', startedAt: T0 }, 'big')).toEqual(expect.arrayContaining(['bang! *flop*', '…is it over?']))
})

test('fetch outcomes: mostly a drop, sometimes a squirrel or keep-away', async () => {
  expect(pickOutcome(0)).toBe('drop')
  expect(pickOutcome(0.79)).toBe('drop')
  expect(pickOutcome(0.85)).toBe('squirrel')
  expect(pickOutcome(0.95)).toBe('keep')
})

test('an outfit rides along through a show, in a taller frame', async () => {
  const heads = withShowHeads(headIndex(SPRITES.big), SHOWS.big)
  const wear = { hat: OUTFITS.big.santa, pad: HEADROOM.big, heads }
  const show: Show = { kind: 'paw', outcome: 'drop', startedAt: T0 }
  const plain = showFrame(show, T0 + 100, SHOWS.big, SPRITES.big)
  const dressedUp = showFrame(show, T0 + 100, SHOWS.big, SPRITES.big, wear)
  expect(dressedUp?.height).toBe(SHOWS.big.height + HEADROOM.big)
  expect(dressedUp?.frame.length).toBe(SHOWS.big.width * (SHOWS.big.height + HEADROOM.big))
  // the Santa hat's red (palette 9) appears only in the dressed frame
  expect(plain?.frame.includes('9')).toBe(false)
  expect(dressedUp?.frame.includes('9')).toBe(true)
})
