// Biscuit's pack: one puppy per subagent, arriving, sitting, and leaving without jump cuts. No `$` here.
import type { Pup, PupPhase } from '../types'
import { PUP_FRAME_MS, compose } from './raster'
import type { Layer, PupSet } from './raster'

export const MAX_SLOTS = 4
export const ARRIVE_MS = 900
export const TURN_MS = 150
export const LINGER_MS = 2000
export const LEAVE_MS = 900
export const SCOOT_MS = 500

export type AgentSeen = { id: string; label: string; status: string }
export type PupPose = 'sit' | 'wag' | 'sad' | 'run' | 'turn'
export type Geometry = { slotWidth: number; areaWidth: number; visibleSlots: number }
/** Where to draw one pup. Run frames face left; `isMirrored` turns them to face right. */
export type Placed = { id: string; pose: PupPose; x: number; isMirrored: boolean; since: number }

const ENDED: Record<string, PupPhase> = { completed: 'done', failed: 'sad', killed: 'sad' }
const HOLDS_SLOT: readonly PupPhase[] = ['arriving', 'here', 'done', 'sad']

/**
 * Moves the pack on to `now`: phases that have run their time advance, and with a fresh
 * agent list (`agents` not null) pups come and go. Returns `pack` itself when nothing changed.
 */
export function reconcile(pack: readonly Pup[], agents: readonly AgentSeen[] | null, now: number): readonly Pup[] {
  let changed = false
  const status = new Map(agents?.map(a => [a.id, a.status]))
  const next: Pup[] = []

  for (const p of pack) {
    let pup = p
    if (agents !== null && (pup.phase === 'waiting' || pup.phase === 'arriving' || pup.phase === 'here')) {
      const st = status.get(pup.id)
      const ended = st === undefined ? 'done' : ENDED[st]
      if (ended && pup.phase === 'waiting') {
        changed = true
        continue // never got a slot, so it never shows up
      }
      if (ended) pup = { ...pup, phase: ended, since: now }
    }
    if (pup.phase === 'arriving' && now - pup.since >= ARRIVE_MS) pup = { ...pup, phase: 'here', since: pup.since + ARRIVE_MS }
    if ((pup.phase === 'done' || pup.phase === 'sad') && now - pup.since >= LINGER_MS) {
      pup = { ...pup, phase: 'leaving', since: pup.since + LINGER_MS, fromSlot: pup.slot, slot: null, prevSlot: null }
    }
    if (pup.phase === 'leaving' && now - pup.since >= LEAVE_MS) {
      changed = true
      continue
    }
    if (pup !== p) changed = true
    next.push(pup)
  }

  for (const a of agents ?? []) {
    if (ENDED[a.status] || next.some(p => p.id === a.id)) continue
    next.push({ id: a.id, label: a.label, phase: 'waiting', since: now, slot: null, prevSlot: null, slotSince: now, fromSlot: null })
    changed = true
  }

  // Pups holding slots stay in arrival order and close up any gap; waiting pups fill what is left
  let used = 0
  for (let i = 0; i < next.length; i++) {
    const pup = next[i]
    if (pup === undefined) continue
    if (HOLDS_SLOT.includes(pup.phase)) {
      if (pup.slot !== used) {
        next[i] = pup.phase === 'arriving' ? { ...pup, slot: used } : { ...pup, prevSlot: pup.slot, slot: used, slotSince: now }
        changed = true
      }
      used++
    }
  }
  for (let i = 0; i < next.length && used < MAX_SLOTS; i++) {
    const pup = next[i]
    if (pup?.phase !== 'waiting') continue
    next[i] = { ...pup, phase: 'arriving', since: now, slot: used++, slotSince: now }
    changed = true
  }

  return changed ? next : pack
}

/** Where each visible pup is at `now`, and how many are not shown. */
export function layout(pack: readonly Pup[], now: number, g: Geometry): { placed: Placed[]; overflow: number } {
  const slotX = (slot: number) => slot * g.slotWidth
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
  const placed: Placed[] = []

  for (const p of pack) {
    const at = (pose: PupPose, x: number, isMirrored = false, since = p.since) => placed.push({ id: p.id, pose, x, isMirrored, since })
    if (p.phase === 'waiting' || (p.phase !== 'leaving' && p.slot === null)) continue
    if (p.phase === 'arriving' && p.slot !== null) {
      at('run', lerp(g.areaWidth, slotX(p.slot), (now - p.since) / ARRIVE_MS))
    } else if (p.phase === 'leaving') {
      const from = slotX(p.fromSlot ?? 0)
      const run = now - p.since - TURN_MS
      if (run < 0) at('turn', from)
      else at('run', lerp(from, g.areaWidth, run / (LEAVE_MS - TURN_MS)), true)
    } else if (p.slot !== null) {
      const isScooting = p.prevSlot !== null && p.prevSlot !== p.slot && now - p.slotSince < SCOOT_MS
      if (isScooting && p.prevSlot !== null) {
        at('run', lerp(slotX(p.prevSlot), slotX(p.slot), (now - p.slotSince) / SCOOT_MS), p.slot > p.prevSlot, p.slotSince)
      } else if (p.phase === 'here' && now - p.since < TURN_MS) {
        at('turn', slotX(p.slot))
      } else {
        at(p.phase === 'done' ? 'wag' : p.phase === 'sad' ? 'sad' : 'sit', slotX(p.slot))
      }
    }
  }

  const hidden = pack.filter(p => p.phase === 'waiting' || (p.slot !== null && p.slot >= g.visibleSlots)).length
  return { placed, overflow: hidden }
}

/** The pack as one frame of `areaWidth` by `height` pixels, pups standing on the bottom edge. */
export function drawPack(pack: readonly Pup[], now: number, set: PupSet, g: Geometry, height: number): string {
  const layers: Layer[] = layout(pack, now, g).placed.map(p => {
    const frames = set.poses[p.pose]
    const frame = frames[Math.floor(Math.max(0, now - p.since) / PUP_FRAME_MS[p.pose]) % frames.length] ?? frames[0] ?? ''
    return { frame, width: set.width, height: set.height, x: p.x, y: height - set.height, isMirrored: p.isMirrored }
  })
  return compose(g.areaWidth, height, layers)
}
