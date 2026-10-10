import { expect, test } from 'claude-code/testing'

import { DEFAULT_COLOR, cellsOf } from '../hooks/raster'

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
