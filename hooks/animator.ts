// Plays poses without jump cuts: a new pose waits for the current frame to end,
// a stance change plays its in-between clip, and every loop starts at its first frame. No `$` here.
import type { Pose } from '../types'
import { FRAME_MS } from './raster'
import type { SpriteSet } from './raster'

export const CLIP_MS = 150

export type Anim = {
  /** The pose whose loop is showing, or that the clip in flight lands on. */
  shown: Pose
  /** When `shown`'s loop (or the clip before it) started. */
  since: number
  /** In-between frames still playing from `since`; `shown` starts once they end. */
  clip: readonly string[]
  /** When the pose now wanted was first asked for. */
  wantedSince: number
  wanted: Pose
}

export function startAnim(pose: Pose, now: number): Anim {
  return { shown: pose, since: now, clip: [], wantedSince: now, wanted: pose }
}

export function frameOf(a: Anim, set: SpriteSet, target: Pose, now: number): { anim: Anim; frame: string } {
  let anim: Anim = target === a.wanted ? a : { ...a, wanted: target, wantedSince: now }
  for (;;) {
    if (anim.clip.length > 0) {
      const i = Math.floor((now - anim.since) / CLIP_MS)
      const frame = anim.clip[i]
      if (frame !== undefined) return { anim, frame }
      // landed: the loop starts where the clip ended, and any newer want waits from here
      const landed = anim.since + anim.clip.length * CLIP_MS
      anim = { ...anim, clip: [], since: landed, wantedSince: Math.max(anim.wantedSince, landed) }
      continue
    }
    if (anim.wanted !== anim.shown) {
      const ms = FRAME_MS[anim.shown]
      // the end of the frame showing when the new pose was asked for (at least one frame in)
      const boundary = anim.since + Math.max(1, Math.ceil((anim.wantedSince - anim.since) / ms)) * ms
      if (now >= boundary) {
        anim = { ...anim, shown: anim.wanted, since: boundary, clip: route(set, anim.shown, anim.wanted) }
        continue
      }
    }
    const frames = set.poses[anim.shown]
    const i = Math.floor((now - anim.since) / FRAME_MS[anim.shown]) % frames.length
    return { anim, frame: frames[i] ?? frames[0] ?? '' }
  }
}

/** The in-between frames from one pose's stance to another's, through `sit` when no direct clip exists. */
function route(set: SpriteSet, from: Pose, to: Pose): readonly string[] {
  const a = set.stances[from]
  const b = set.stances[to]
  if (a === b) return []
  const direct = set.clips[`${a}-${b}`]
  if (direct) return direct
  return [...(set.clips[`${a}-sit`] ?? []), ...(set.clips[`sit-${b}`] ?? [])]
}
