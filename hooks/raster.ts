// Turns a sprite frame (one base-36 palette index per pixel) into Raster cells:
// two pixels per terminal cell, top as the ▀ glyph's colour, bottom as its background.

import type { Outfit, Pose } from '../types'
import type { PupPose } from './pack'

export type Stance = 'sit' | 'stand' | 'lie'

export type SpriteSet = {
  width: number
  height: number
  poses: Record<Pose, readonly string[]>
  /** Poses in one stance share a body, so switching between them needs no in-between frames. */
  stances: Record<Pose, Stance>
  /** In-between frames for a stance change, keyed `from-to` (e.g. `stand-sit`). */
  clips: Partial<Record<string, readonly string[]>>
  /** Where the head is in each frame of `poses`, for outfits. */
  heads: Record<Pose, readonly (Head | null)[]>
  clipHeads: Partial<Record<string, readonly (Head | null)[]>>
}

/** The top-centre of the head in a frame, and whether it faces us (`f`) or right (`s`). */
export type Head = readonly [number, number, 'f' | 's']

export type OutfitSprite = { width: number; height: number; frame: string; dy: number; sideDx: number }
export type OutfitSprites = { big: Record<Outfit, OutfitSprite>; mini: Record<Outfit, OutfitSprite> }
export type Sprites = { big: SpriteSet; mini: SpriteSet }

export type PupSet = { width: number; height: number; poses: Record<PupPose, readonly string[]> }
export type PupSprites = { big: PupSet; mini: PupSet }

export type ShowFrame =
  | 'side' | 'run' | 'runBall' | 'sitBall' | 'keepBall' | 'pretty' | 'paw' | 'lie' | 'belly' | 'dead' | 'deadPeek'
export type ShowSet = {
  width: number
  height: number
  frames: Record<ShowFrame, readonly string[]>
  heads: Record<ShowFrame, readonly (Head | null)[]>
  ball: { width: number; height: number; frame: string }
}
export type ShowSprites = { big: ShowSet; mini: ShowSet }

export const PUP_FRAME_MS: Record<PupPose, number> = { sit: 900, wag: 160, sad: 1000, run: 110, turn: 150 }

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
    const index = parseInt(frame[y * width + x] ?? '0', 36)
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

export const FRAME_MS: Record<Pose, number> = {
  idle: 700, excited: 200, happy: 180, worried: 900, tilt: 900,
  sleep: 1200, sniff: 400, dig: 220, walk: 260, leash: 500, yawn: 1500,
  drowsy: 1100, pant: 160, shake: 110, lie: 1300, zoomies: 120,
}

export type Layer = { frame: string; width: number; height: number; x: number; y: number; isMirrored?: boolean }

/** Stamps sprite frames onto one transparent canvas, later layers on top, clipped to its edges. */
export function compose(width: number, height: number, layers: readonly Layer[]): string {
  const out = new Array<string>(width * height).fill('0')
  for (const l of layers) {
    for (let y = 0; y < l.height; y++) {
      for (let x = 0; x < l.width; x++) {
        const px = l.frame[y * l.width + (l.isMirrored ? l.width - 1 - x : x)]
        const cx = Math.round(l.x) + x
        const cy = l.y + y
        if (px === undefined || px === '0' || cx < 0 || cx >= width || cy < 0 || cy >= height) continue
        out[cy * width + cx] = px
      }
    }
  }
  return out.join('')
}
