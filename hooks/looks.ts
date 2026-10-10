// How the dog looks: its coat, and what it wears on which day. No `$` here.
import type { Coat, Outfit } from '../types'
import { compose } from './raster'
import type { Head, Layer, OutfitSprite, ShowSet, SpriteSet } from './raster'
import { PALETTE } from './sprites'

/** The palette slots that make up the coat: base, light, cream and shadow gold. */
export const COAT_SLOTS: readonly number[] = [2, 3, 4, 5]

const COATS: Record<Coat, readonly number[]> = {
  golden: [0xc48028, 0xe8ac4c, 0xf8da96, 0x96581a],
  cream: [0xe2c08c, 0xf2dcb4, 0xfcf2de, 0xb98d5a],
  red: [0x9a4418, 0xc4632c, 0xe8a46c, 0x642a0c],
}

export function paletteFor(coat: Coat): readonly number[] {
  const colours = COATS[coat]
  return PALETTE.map((c, i) => {
    const slot = COAT_SLOTS.indexOf(i)
    return slot === -1 ? c : colours[slot] ?? c
  })
}

export function toCoat(v: unknown): Coat | undefined {
  return v === 'golden' || v === 'cream' || v === 'red' ? v : undefined
}

export function toOutfit(v: unknown): Outfit | undefined {
  return v === 'witch' || v === 'santa' || v === 'party' || v === 'bandana' ? v : undefined
}

/** True on an anniversary of `firstMet` (local date), never on the day itself. */
export function isBirthday(date: Date, firstMet: number): boolean {
  if (!firstMet) return false
  const met = new Date(firstMet)
  return date.getFullYear() > met.getFullYear() && date.getMonth() === met.getMonth() && date.getDate() === met.getDate()
}

/** What the calendar says to wear today; a birthday beats every holiday. */
export function outfitFor(date: Date, firstMet: number): Outfit | null {
  if (isBirthday(date, firstMet)) return 'party'
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (m === 10 && d >= 24) return 'witch'
  if (m === 12 && d <= 26) return 'santa'
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'party'
  if (m === 2 && d === 14) return 'bandana'
  return null
}

/** Extra pixels above the dog on outfit days, so a hat isn't cut off by the frame's top edge. */
export const HEADROOM = { big: 8, mini: 4 } as const

/** Every frame of a sprite set mapped to its head; identical frames have identical heads. */
export function headIndex(set: SpriteSet): Map<string, Head | null> {
  const index = new Map<string, Head | null>()
  const add = (frames: readonly string[] | undefined, heads: readonly (Head | null)[] | undefined) =>
    frames?.forEach((f, i) => index.set(f, heads?.[i] ?? null))
  for (const pose of Object.keys(set.poses)) {
    if (isPose(set, pose)) add(set.poses[pose], set.heads[pose])
  }
  for (const [key, frames] of Object.entries(set.clips)) add(frames, set.clipHeads[key])
  return index
}

/** The same for show frames, added to a pose index so one lookup covers both. */
export function withShowHeads(index: Map<string, Head | null>, set: ShowSet): Map<string, Head | null> {
  for (const name of Object.keys(set.frames)) {
    if (isShowFrame(set, name)) set.frames[name].forEach((f, i) => index.set(f, set.heads[name][i] ?? null))
  }
  return index
}

function isShowFrame(set: ShowSet, key: string): key is keyof ShowSet['frames'] {
  return key in set.frames
}

function isPose(set: SpriteSet, key: string): key is keyof SpriteSet['poses'] {
  return key in set.poses
}

/**
 * Where to draw the hat for a head in a dog layer at `dogX` of `width` pixels,
 * `pad` pixels down from the top of a taller frame.
 */
export function hatLayer(head: Head, hat: OutfitSprite, dogX: number, width: number, isMirrored: boolean, pad: number): Layer {
  const [hx, hy, facing] = head
  const shift = facing === 's' ? hat.sideDx : 0
  const centre = isMirrored ? dogX + width - 1 - hx : dogX + hx
  const x = centre - Math.floor(hat.width / 2) + (isMirrored ? -shift : shift)
  return { frame: hat.frame, width: hat.width, height: hat.height, x, y: pad + hy + hat.dy, isMirrored }
}

/** A dog frame with headroom added and the outfit on. */
export function dressed(frame: string, width: number, height: number, head: Head | null, hat: OutfitSprite, pad: number) {
  const layers: Layer[] = [{ frame, width, height, x: 0, y: pad }]
  if (head) layers.push(hatLayer(head, hat, 0, width, false, pad))
  return { frame: compose(width, height + pad, layers), height: height + pad }
}
