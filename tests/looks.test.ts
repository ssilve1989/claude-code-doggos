import { expect, test } from 'claude-code/testing'

import { COAT_SLOTS, dressed, hatLayer, headIndex, isBirthday, outfitFor, paletteFor, toCoat } from '../hooks/looks'
import type { OutfitSprite } from '../hooks/raster'
import { PALETTE, SPRITES } from '../hooks/sprites'

const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d, 12)

test('the calendar picks the outfit', async () => {
  expect(outfitFor(day(10, 23), 0)).toBe(null)
  expect(outfitFor(day(10, 24), 0)).toBe('witch')
  expect(outfitFor(day(10, 31), 0)).toBe('witch')
  expect(outfitFor(day(11, 1), 0)).toBe(null)
  expect(outfitFor(day(12, 1), 0)).toBe('santa')
  expect(outfitFor(day(12, 26), 0)).toBe('santa')
  expect(outfitFor(day(12, 27), 0)).toBe(null)
  expect(outfitFor(day(12, 31), 0)).toBe('party')
  expect(outfitFor(day(1, 1, 2027), 0)).toBe('party')
  expect(outfitFor(day(1, 2, 2027), 0)).toBe(null)
  expect(outfitFor(day(2, 14), 0)).toBe('bandana')
})

test("the dog's birthday is the anniversary of the first session, and wins", async () => {
  const met = day(10, 25, 2025).getTime()
  expect(isBirthday(day(10, 25), met)).toBe(true)
  expect(isBirthday(day(10, 25, 2025), met)).toBe(false) // the day you met is not a birthday yet
  expect(isBirthday(day(10, 26), met)).toBe(false)
  expect(isBirthday(day(10, 25), 0)).toBe(false)
  expect(outfitFor(day(10, 25), met)).toBe('party')
})

test('coats recolour only the gold slots', async () => {
  expect(paletteFor('golden')).toEqual(PALETTE)
  for (const coat of ['cream', 'red'] as const) {
    const p = paletteFor(coat)
    PALETTE.forEach((colour, i) => {
      if (COAT_SLOTS.includes(i)) expect(p[i]).not.toBe(colour)
      else expect(p[i]).toBe(colour)
    })
  }
  expect(toCoat('red')).toBe('red')
  expect(toCoat('purple')).toBe(undefined)
})

test('a hat sits centred on the head, in a taller frame', async () => {
  const hat: OutfitSprite = { width: 3, height: 2, frame: '111' + '111', dy: -2, sideDx: -1 }
  // a 5x2 dog whose head top is at (2, 0), facing us; 2 pixels of headroom
  const dog = '02220' + '22222'
  const out = dressed(dog, 5, 2, [2, 0, 'f'], hat, 2)
  expect(out.height).toBe(4)
  expect(out.frame).toBe('01110' + '01110' + '02220' + '22222')
  // no head (the dog is off-frame): just the headroom
  expect(dressed(dog, 5, 2, null, hat, 2).frame).toBe('00000' + '00000' + dog)
})

test('a side-facing head shifts the hat by sideDx, mirrored when the dog is', async () => {
  const hat: OutfitSprite = { width: 1, height: 1, frame: '1', dy: -1, sideDx: -1 }
  expect(hatLayer([3, 1, 's'], hat, 0, 5, false, 0)).toMatchObject({ x: 2, y: 0, isMirrored: false })
  // mirrored inside a 5-wide frame placed at x=0: column 3 becomes column 1, and the shift flips too
  expect(hatLayer([3, 1, 's'], hat, 0, 5, true, 0)).toMatchObject({ x: 2, y: 0, isMirrored: true })
})

test('every sprite frame knows where its head is', async () => {
  const heads = headIndex(SPRITES.big)
  expect(heads.get(SPRITES.big.poses.idle[0] ?? '')).toEqual([24, 3, 'f'])
  expect(heads.get(SPRITES.big.poses.walk[0] ?? '')?.[2]).toBe('s')
  expect(headIndex(SPRITES.mini).get(SPRITES.mini.poses.idle[0] ?? '')?.[2]).toBe('f')
})
