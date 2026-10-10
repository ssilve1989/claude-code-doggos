// Turns a sprite frame (one palette index per pixel) into Raster cells:
// two pixels per terminal cell, top as the ▀ glyph's colour, bottom as its background.

import type { Pose } from '../types'

export type SpriteSet = {
  width: number
  height: number
  poses: Record<Pose, readonly string[]>
}
export type Sprites = { big: SpriteSet; mini: SpriteSet }

export type Cells = { columns: number; rows: number; cells: string }

export const DEFAULT_COLOR = 0x01000000

const SPACE = 0x20
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

export function cellsOf(frame: string, width: number, height: number, palette: readonly number[]): Cells {
  const rows = Math.ceil(height / 2)
  const words = new Uint32Array(width * rows * 3)
  const colour = (x: number, y: number): number | undefined => {
    if (y >= height) return undefined
    const index = frame.charCodeAt(y * width + x) - 48
    return index === 0 ? undefined : palette[index]
  }
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < width; x++) {
      const top = colour(x, row * 2)
      const bottom = colour(x, row * 2 + 1)
      const at = (row * width + x) * 3
      if (top !== undefined) words.set([UPPER, top, bottom ?? DEFAULT_COLOR], at)
      else if (bottom !== undefined) words.set([LOWER, bottom, DEFAULT_COLOR], at)
      else words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], at)
    }
  }
  return { columns: width, rows, cells: new Uint8Array(words.buffer).toBase64() }
}

/** The frame of a pose to show at `now`, each pose cycling at its own pace. */
export function frameAt(set: SpriteSet, pose: Pose, now: number): string {
  const frames = set.poses[pose]
  const i = Math.floor(now / FRAME_MS[pose]) % frames.length
  return frames[i] ?? frames[0] ?? ''
}

const FRAME_MS: Record<Pose, number> = {
  idle: 700, excited: 200, happy: 180, worried: 900, tilt: 900,
  sleep: 1200, sniff: 400, dig: 220, walk: 260, leash: 500, yawn: 1500,
}
