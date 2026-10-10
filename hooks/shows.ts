// Fetch and tricks: short scripted performances, each a timeline of beats. No `$` here.
import type { FetchOutcome, Show } from '../types'
import { CLIP_MS } from './animator'
import { compose } from './raster'
import type { Layer, ShowSet, SpriteSet } from './raster'

type Beat = {
  ms: number
  frames: readonly string[]
  frameMs: number
  line: string
  /** Side frames face right; mirrored, they face left. */
  isMirrored?: boolean
  /** The dog's x at the start and end of the beat, in pixels from its frame's left edge. */
  x?: [number, number]
  /** The ball's position as the beat runs from t = 0 to 1. */
  ball?: (t: number) => { x: number; y: number }
}

const RUN_MS = 130

export function pickOutcome(r: number): FetchOutcome {
  return r < 0.8 ? 'drop' : r < 0.9 ? 'squirrel' : 'keep'
}

function beats(show: Show, set: ShowSet, sit: SpriteSet): Beat[] {
  const W = set.width
  const H = set.height
  const f = set.frames
  const idle = sit.poses.idle.slice(0, 1)
  // in-between frames where this size has them; the mini dog cuts straight between stances
  const clip = (key: string, line: string, isMirrored = false): Beat[] => {
    const frames = sit.clips[key]
    return frames ? [{ ms: frames.length * CLIP_MS, frames, frameMs: CLIP_MS, line, isMirrored }] : []
  }

  if (show.kind === 'fetch') {
    const isSquirrel = show.outcome === 'squirrel'
    const standUp = clip('sit-stand', 'BALL!')
    const finale: Beat =
      show.outcome === 'drop' ? { ms: 1800, frames: f.sitBall, frameMs: 400, line: 'again! again!' }
      : show.outcome === 'keep' ? { ms: 1800, frames: f.keepBall, frameMs: 400, line: 'mine!' }
      : { ms: 1800, frames: idle, frameMs: 1800, line: 'there was a SQUIRREL' }
    return [
      {
        ms: 450, frames: idle, frameMs: 450, line: 'go get it!',
        // up out of the dog's mouth and off the right edge in an arc
        ball: t => ({ x: W * 0.55 + (W * 0.5) * t, y: H * 0.35 - Math.sin(Math.PI * t) * H * 0.3 }),
      },
      ...(standUp.length > 0 ? standUp : [{ ms: 150, frames: f.side, frameMs: 150, line: 'BALL!' }]),
      { ms: 700, frames: f.run, frameMs: RUN_MS, line: 'BALL!', x: [0, W] },
      { ms: 1200, frames: [], frameMs: 1200, line: 'fetching!!' },
      { ms: 700, frames: isSquirrel ? f.run : f.runBall, frameMs: RUN_MS, line: isSquirrel ? '…' : 'got it!', x: [W, 0], isMirrored: true },
      ...clip('stand-sit', isSquirrel ? '…' : 'got it!', true),
      finale,
    ]
  }
  switch (show.kind) {
    case 'sit':
      return [{ ms: 250, frames: idle, frameMs: 250, line: 'sit pretty!' }, { ms: 1600, frames: f.pretty, frameMs: 400, line: 'sit pretty!' }]
    case 'paw':
      return [{ ms: 1800, frames: f.paw, frameMs: 450, line: 'high five!' }]
    case 'roll':
      return [
        ...clip('sit-lie', 'rolling over!'),
        { ms: 300, frames: f.lie, frameMs: 300, line: 'rolling over!' },
        { ms: 700, frames: f.belly, frameMs: 700, line: 'rolling over!' },
        { ms: 300, frames: f.lie, frameMs: 300, line: 'ta-da!' },
        ...clip('lie-sit', 'ta-da!'),
      ]
    case 'dead':
      return [
        ...clip('sit-lie', 'bang! *flop*'),
        { ms: 1400, frames: f.dead, frameMs: 1400, line: 'bang! *flop*' },
        { ms: 700, frames: f.deadPeek, frameMs: 700, line: '…is it over?' },
        { ms: 300, frames: f.dead, frameMs: 300, line: '…is it over?' },
        ...clip('lie-sit', '…is it over?'),
      ]
  }
}

export function showDuration(show: Show, set: ShowSet, sit: SpriteSet): number {
  return beats(show, set, sit).reduce((sum, b) => sum + b.ms, 0)
}

/** The show's frame and line at `now`, or null once it has finished. */
export function showFrame(show: Show, now: number, set: ShowSet, sit: SpriteSet): { frame: string; line: string } | null {
  let local = now - show.startedAt
  for (const b of beats(show, set, sit)) {
    if (local >= b.ms) {
      local -= b.ms
      continue
    }
    const t = local / b.ms
    const layers: Layer[] = []
    const dog = b.frames[Math.floor(local / b.frameMs) % Math.max(1, b.frames.length)]
    if (dog !== undefined) {
      const x = b.x ? b.x[0] + (b.x[1] - b.x[0]) * t : 0
      layers.push({ frame: dog, width: set.width, height: set.height, x, y: 0, isMirrored: b.isMirrored })
    }
    if (b.ball) {
      const at = b.ball(t)
      layers.push({ frame: set.ball.frame, width: set.ball.width, height: set.ball.height, x: at.x, y: Math.round(at.y) })
    }
    return { frame: compose(set.width, set.height, layers), line: b.line }
  }
  return null
}
