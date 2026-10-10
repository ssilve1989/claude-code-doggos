import { expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, cellsOf, compose } from '../hooks/raster'

const PALETTE = [DEFAULT_COLOR, 0x111111, 0x222222]

function words(cells: string): number[] {
  const bytes = Uint8Array.fromBase64(cells)
  return Array.from(new Uint32Array(bytes.buffer))
}

test('packs two pixel rows into one half-block cell row', async () => {
  // 4 columns x 2 pixel rows: both empty, top only, bottom only, both
  const frame = '0120' + '0021'
  const r = cellsOf(frame, 4, 2, PALETTE)
  expect(r.columns).toBe(4)
  expect(r.rows).toBe(1)
  expect(words(r.cells)).toEqual([
    0x20, DEFAULT_COLOR, DEFAULT_COLOR,
    0x2580, 0x111111, DEFAULT_COLOR,
    0x2580, 0x222222, 0x222222,
    0x2584, 0x111111, DEFAULT_COLOR,
  ])
})

test('an odd pixel height leaves the last bottom half empty', async () => {
  const r = cellsOf('1' + '2' + '1', 1, 3, PALETTE)
  expect(r.rows).toBe(2)
  expect(words(r.cells)).toEqual([0x2580, 0x111111, 0x222222, 0x2580, 0x111111, DEFAULT_COLOR])
})

test('compose stamps frames onto a transparent canvas, clipped and optionally mirrored', async () => {
  // a 2x1 sprite: left pixel 1, right pixel 2
  const sprite = { frame: '12', width: 2, height: 1 }
  expect(compose(4, 1, [{ ...sprite, x: 1, y: 0 }])).toBe('0120')
  expect(compose(4, 1, [{ ...sprite, x: 1, y: 0, isMirrored: true }])).toBe('0210')
  // off the right edge: clipped, not wrapped
  expect(compose(4, 1, [{ ...sprite, x: 3, y: 0 }])).toBe('0001')
  // later layers win, but their transparent pixels don't erase
  expect(compose(3, 1, [{ ...sprite, x: 0, y: 0 }, { frame: '03', width: 2, height: 1, x: 0, y: 0 }])).toBe('130')
  expect(compose(2, 2, [{ frame: '1', width: 1, height: 1, x: 1, y: 1 }])).toBe('0001')
})

test('frames use base-36 palette indices, so more than ten colours fit', async () => {
  const palette = [DEFAULT_COLOR, ...Array.from({ length: 11 }, (_, i) => 0x100000 + i)]
  const r = cellsOf('a' + '0', 1, 2, palette)
  expect(words(r.cells)).toEqual([0x2580, 0x100009, DEFAULT_COLOR])
})
