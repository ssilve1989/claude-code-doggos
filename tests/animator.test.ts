import { expect, test } from 'claude-code/testing'

import { CLIP_MS, frameOf, startAnim } from '../hooks/animator'
import type { SpriteSet } from '../hooks/raster'

// One-character "frames" keep the expectations readable.
const POSE_MS = 700 // idle's frame time
const set: SpriteSet = {
  width: 1,
  height: 1,
  poses: {
    idle: ['i0', 'i1', 'i2', 'i3'], excited: ['e0', 'e1'], happy: ['h0', 'h1'], worried: ['w0'], tilt: ['t0'],
    sleep: ['s0', 's1'], sniff: ['n0', 'n1'], dig: ['d0', 'd1'], walk: ['k0', 'k1'], leash: ['l0'], yawn: ['y0'],
  },
  stances: {
    idle: 'sit', excited: 'sit', happy: 'sit', worried: 'sit', tilt: 'sit', leash: 'sit', yawn: 'sit',
    sleep: 'lie', sniff: 'stand', dig: 'stand', walk: 'stand',
  },
  clips: { 'stand-sit': ['a', 'b', 'c'], 'sit-stand': ['c', 'b', 'a'], 'sit-lie': ['x'], 'lie-sit': ['x'] },
}

function play(anim = startAnim('idle', 0)) {
  let a = anim
  return (target: Parameters<typeof frameOf>[2], now: number) => {
    const r = frameOf(a, set, target, now)
    a = r.anim
    return r.frame
  }
}

test('a loop starts from its first frame and cycles at the pose pace', async () => {
  const at = play()
  expect(at('idle', 0)).toBe('i0')
  expect(at('idle', POSE_MS)).toBe('i1')
  expect(at('idle', 4 * POSE_MS)).toBe('i0')
})

test('a new pose in the same stance waits for the current frame to end, then starts at frame 0', async () => {
  const at = play()
  expect(at('happy', 100)).toBe('i0') // mid-frame: keep showing it
  expect(at('happy', POSE_MS - 1)).toBe('i0')
  expect(at('happy', POSE_MS)).toBe('h0') // no clip within a stance
  expect(at('happy', POSE_MS + 180)).toBe('h1')
})

test('a stance change plays the clip between the loops', async () => {
  const at = play(startAnim('walk', 0))
  expect(at('idle', 10)).toBe('k0')
  const t = 260 // walk's frame time: the boundary
  expect(at('idle', t)).toBe('a')
  expect(at('idle', t + CLIP_MS)).toBe('b')
  expect(at('idle', t + 2 * CLIP_MS)).toBe('c')
  expect(at('idle', t + 3 * CLIP_MS)).toBe('i0')
})

test('crossing two stances chains both clips', async () => {
  const at = play(startAnim('walk', 0))
  at('sleep', 0)
  const frames = [260, 260 + CLIP_MS, 260 + 2 * CLIP_MS, 260 + 3 * CLIP_MS, 260 + 4 * CLIP_MS].map(t => at('sleep', t))
  expect(frames).toEqual(['a', 'b', 'c', 'x', 's0'])
})

test('a new target mid-clip lets the clip finish, then plans from where it landed', async () => {
  const at = play(startAnim('walk', 0))
  expect(at('idle', 260)).toBe('a')
  expect(at('dig', 260 + CLIP_MS)).toBe('b') // changed its mind: still finishes sitting down
  expect(at('dig', 260 + 2 * CLIP_MS)).toBe('c')
  // landed on idle at 260 + 3 clips; it waits for idle's first frame to end, then stands back up
  const landed = 260 + 3 * CLIP_MS
  expect(at('dig', landed)).toBe('i0')
  expect(at('dig', landed + POSE_MS)).toBe('c')
  expect(at('dig', landed + POSE_MS + 3 * CLIP_MS)).toBe('d0')
})

test('a missing clip falls back to a direct switch', async () => {
  const bare: SpriteSet = { ...set, clips: {} }
  const r = frameOf(startAnim('walk', 0), bare, 'idle', 260)
  expect(r.frame).toBe('i0')
})
