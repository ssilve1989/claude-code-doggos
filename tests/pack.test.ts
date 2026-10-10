import { expect, test } from 'claude-code/testing'

import { ARRIVE_MS, LEAVE_MS, LINGER_MS, MAX_SLOTS, SCOOT_MS, TURN_MS, drawPack, layout, reconcile } from '../hooks/pack'
import type { PupSet } from '../hooks/raster'
import type { AgentSeen, Geometry } from '../hooks/pack'
import type { Pup } from '../types'

const T0 = 1_000_000
const running = (id: string, label = id): AgentSeen => ({ id, label, status: 'running' })
const GEO: Geometry = { slotWidth: 10, areaWidth: 40, visibleSlots: 4 }

function only(pack: readonly Pup[], id: string): Pup {
  const p = pack.find(x => x.id === id)
  if (!p) throw new Error(`no pup ${id}`)
  return p
}

test('a new agent brings a pup that runs in, turns, then sits', async () => {
  const pack = reconcile([], [running('a', 'find auth')], T0)
  expect(only(pack, 'a')).toMatchObject({ phase: 'arriving', slot: 0, label: 'find auth' })

  const start = layout(pack, T0, GEO).placed[0]
  expect(start).toMatchObject({ pose: 'run', x: 40, isMirrored: false })
  const mid = layout(pack, T0 + ARRIVE_MS / 2, GEO).placed[0]
  expect(mid?.x).toBe(20)

  const settled = reconcile(pack, null, T0 + ARRIVE_MS)
  expect(only(settled, 'a').phase).toBe('here')
  expect(layout(settled, T0 + ARRIVE_MS, GEO).placed[0]).toMatchObject({ pose: 'turn', x: 0 })
  expect(layout(settled, T0 + ARRIVE_MS + TURN_MS, GEO).placed[0]?.pose).toBe('sit')
})

test('a finished agent wags, then its pup turns and runs off; a failed one is sad first', async () => {
  let pack = reconcile(reconcile([], [running('a'), running('b')], T0), null, T0 + ARRIVE_MS)
  pack = reconcile(pack, [{ id: 'a', label: 'a', status: 'completed' }, { id: 'b', label: 'b', status: 'failed' }], T0 + 5000)
  expect(only(pack, 'a').phase).toBe('done')
  expect(only(pack, 'b').phase).toBe('sad')
  expect(layout(pack, T0 + 5000, GEO).placed.map(p => p.pose)).toEqual(['wag', 'sad'])

  const t = T0 + 5000 + LINGER_MS
  pack = reconcile(pack, null, t)
  expect(only(pack, 'a').phase).toBe('leaving')
  const leaving = layout(pack, t + TURN_MS + 1, GEO).placed[0]
  expect(leaving).toMatchObject({ pose: 'run', isMirrored: true })
  pack = reconcile(pack, null, t + LEAVE_MS)
  expect(pack).toEqual([])
})

test('an agent that vanishes from the list counts as finished', async () => {
  const pack = reconcile(reconcile([], [running('a')], T0), [], T0 + 10)
  expect(only(pack, 'a').phase).toBe('done')
})

test('when a pup leaves, the ones after it scoot over', async () => {
  let pack = reconcile(reconcile([], [running('a'), running('b')], T0), null, T0 + ARRIVE_MS)
  pack = reconcile(pack, [{ id: 'a', label: 'a', status: 'completed' }, running('b')], T0 + 2000)
  const t = T0 + 2000 + LINGER_MS
  pack = reconcile(pack, null, t)
  expect(only(pack, 'b')).toMatchObject({ slot: 0, prevSlot: 1 })
  const b = (now: number) => layout(pack, now, GEO).placed.find(p => p.id === 'b')
  expect(b(t)).toMatchObject({ pose: 'run', x: 10 })
  expect(b(t + SCOOT_MS / 2)?.x).toBe(5)
  expect(b(t + SCOOT_MS)).toMatchObject({ pose: 'sit', x: 0 })
})

test('more pups than slots wait off-screen and show as overflow', async () => {
  const agents = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => running(id))
  let pack = reconcile([], agents, T0)
  expect(pack.filter(p => p.phase === 'arriving')).toHaveLength(MAX_SLOTS)
  expect(only(pack, 'e').phase).toBe('waiting')
  expect(layout(pack, T0, GEO).overflow).toBe(2)
  expect(layout(pack, T0, { ...GEO, visibleSlots: 1 }).overflow).toBe(5)

  // a slot frees up: the first waiting pup runs in
  pack = reconcile(reconcile(pack, null, T0 + ARRIVE_MS), [{ id: 'a', label: 'a', status: 'completed' }, ...agents.slice(1)], T0 + 2000)
  pack = reconcile(pack, null, T0 + 2000 + LINGER_MS)
  expect(only(pack, 'e')).toMatchObject({ phase: 'arriving', slot: 3 })
})

test('reconcile returns the same pack when nothing changed', async () => {
  const pack = reconcile([], [running('a')], T0)
  expect(reconcile(pack, [running('a')], T0 + 10) === pack).toBe(true)
  expect(reconcile(pack, null, T0 + 10) === pack).toBe(true)
})

test('a waiting pup whose agent ends never shows up', async () => {
  const agents = ['a', 'b', 'c', 'd', 'e'].map(id => running(id))
  let pack = reconcile([], agents, T0)
  pack = reconcile(pack, [...agents.slice(0, 4), { id: 'e', label: 'e', status: 'completed' }], T0 + 10)
  expect(pack.find(p => p.id === 'e')).toBe(undefined)
})

test('drawPack puts a settled pup in its slot on the bottom edge', async () => {
  const set: PupSet = {
    width: 2, height: 1,
    poses: { sit: ['11'], wag: ['22'], sad: ['33'], run: ['12'], turn: ['44'] },
  }
  const g: Geometry = { slotWidth: 3, areaWidth: 6, visibleSlots: 2 }
  let pack = reconcile([], [running('a'), running('b')], T0)
  pack = reconcile(pack, null, T0 + ARRIVE_MS)
  expect(drawPack(pack, T0 + ARRIVE_MS + TURN_MS, set, g, 2)).toBe('000000' + '110110')
  // run frames are stored facing left, so an arriving pup is drawn as stored
  expect(drawPack(reconcile([], [running('a')], T0), T0 + ARRIVE_MS / 2, set, g, 1)).toBe('000120')
})
