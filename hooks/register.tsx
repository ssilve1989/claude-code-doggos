import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Display, Pose, Stats } from '../types'
import { PET_CAP, TREAT_CAP, bondLevel, greeting, levelUp, toCount, toDisplay } from './bond'
import { initialMood, poseOf, step, tick } from './mood'
import type { DogEvent } from './mood'
import {
  NIGHT_SLEEP_MS, WAIT_BARK_MS, breakDue, formatStreak, isNight, noteActivity, remind, shouldBark, spinnerWord, yawnDue,
} from './nudges'
import { startAnim, frameOf } from './animator'
import type { Anim } from './animator'
import { cellsOf } from './raster'
import type { SpriteSet } from './raster'
import { PALETTE, SPRITES } from './sprites'

const PANE = 'doggo'
const TICK_MS = 100
const FLUSH_MS = 30_000
const BUBBLE_COLUMNS = 12
const USAGE = 'usage: /doggo [pet | treat | band | pane | off | name <name>]'

const mood = atom({ plugin: 'doggo', key: 'mood' } as const, initialMood(0))
const stats = atom({ plugin: 'doggo', key: 'stats' } as const, {
  name: 'Biscuit', bond: 0, treats: 0, pets: 0, sessions: 0, fetched: 0, firstMet: 0, lastSeen: 0,
})
const display = atom({ plugin: 'doggo', key: 'display' } as const, 'band')
const isCounted = atom({ plugin: 'doggo', key: 'isCounted' } as const, false)
const streak = atom({ plugin: 'doggo', key: 'streak' } as const, null)
const lastYawnAt = atom({ plugin: 'doggo', key: 'lastYawnAt' } as const, 0)

type CountKey = 'bond' | 'treats' | 'pets' | 'sessions' | 'fetched'

// Per-load values: losing them on a hot reload only resets session caps and the blit cache.
let defaultName = 'Biscuit'
let defaultDisplay: Display = 'band'
let sessionPets = 0
let sessionTreats = 0
let pendingFetched = 0
let bandId: string | null = null
let paneSet: SpriteSet = SPRITES.big
const lastBlit = new Map<string, string>()
const anims = new Map<string, Anim>()
let barkAfterMs = 60_000
let breakAfterMs = 90 * 60_000
let isSpinnerOn = true
// Approval waits that will bark unless the tool call returns first, by tool_use_id
const waitBarks = new Map<string, { cancel(): void }>()

export const register: Register = (on, options) => {
  defaultName = typeof options.name === 'string' && options.name.trim() ? options.name.trim() : 'Biscuit'
  defaultDisplay = toDisplay(options.display) ?? 'band'
  barkAfterMs = positive(options.barkAfterSeconds, 60) * 1000
  breakAfterMs = positive(options.breakAfterMinutes, 90) * 60_000
  isSpinnerOn = options.spinner !== false

  on('session.start', async ($, e, next) => {
    await wakeUp($)
    $.clock.every(TICK_MS, () => onTick($))
    $.clock.every(FLUSH_MS, () => flushFetched($))
    try {
      await $.command.register({
        name: 'doggo',
        description: 'Your golden retriever buddy',
        argumentHint: 'pet | treat | band | pane | off | name <name>',
        immediate: true,
      })
    } catch {
      $.ui.toast('/doggo is unavailable: the command name is taken')
    }
    return next(e)
  })

  // /clear, /resume and /branch reset $.state without a new session.start
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await wakeUp($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await flushFetched($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, streak, cur => noteActivity(cur, now))
    if (yawnDue(await read($, lastYawnAt), now, new Date(now).getHours())) {
      await update($, lastYawnAt, () => now)
      await feel($, { kind: 'yawn' })
    } else {
      await feel($, { kind: 'prompt' })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await feel($, { kind: 'turnStart' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await feel($, { kind: 'tool', tool: String(e.tool), target: targetOf(e) })
    const ran = await next(e)
    cancelWaitBark(e.tool_use_id)
    pendingFetched += 1
    if (ran.deny === undefined && ran.isError === true) await feel($, { kind: 'toolFailed' })
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.agentId === undefined) {
      await feel($, { kind: 'ask' })
      const key = e.tool_use_id ?? ''
      waitBarks.get(key)?.cancel()
      waitBarks.set(key, $.clock.after(WAIT_BARK_MS, () => bark($, 'Claude needs you!')))
    }
    return verdict
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // A subagent finishing is not the end of your turn
    if (e.agentId !== undefined) return next(e)
    for (const key of [...waitBarks.keys()]) cancelWaitBark(key)
    const now = await $.clock.now()
    await update($, streak, cur => noteActivity(cur, now))
    await feel($, { kind: 'turnComplete' })
    if (shouldBark(e, barkAfterMs)) await bark($, "Claude's done! 🐾")
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'doggo' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    switch (sub) {
      case '':
        await setDisplay($, (await read($, display)) === 'pane' ? 'band' : 'pane')
        return {}
      case 'pet':
        await pet($)
        return reply($)
      case 'treat':
        await treat($)
        return reply($)
      case 'band':
      case 'pane':
      case 'off':
        await setDisplay($, sub)
        return {}
      case 'name': {
        const name = rest.join(' ').trim()
        if (!name) return { text: USAGE }
        await $.store.set('name', name)
        await refreshStats($)
        await feel($, { kind: 'greet', line: `${name}? I love it!`, isExcited: true })
        return reply($)
      }
      default:
        return { text: USAGE }
    }
  })

  on('ui.close', async ($, e, next) => {
    // The person closed the pane themselves: bring the dog back to the band
    if (e.id === PANE && e.origin.kind === 'person') {
      await $.store.set('display', 'band')
      await update($, display, () => 'band')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // The desktop's spinner shows real step descriptions, so it keeps them
    if (!isSpinnerOn || e.surface !== 'terminal') return next(e)
    const m = await read($, mood)
    return next({ ...e, props: { ...e.props, word: spinnerWord(e.props.mode, m.action) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((await read($, display)) !== 'band' || e.props.hasSurvey) return next(e)
    const m = await read($, mood)
    const s = await read($, stats)
    const now = await $.clock.now()
    const pose = poseOf(m, now)
    const set = SPRITES.mini
    const rows = Math.ceil(set.height / 2)
    if (e.surface !== 'terminal' || e.props.bodyColumns < set.width || e.props.maxRows < rows) {
      const { Text } = $.ui.resolve(e)
      return <Text>{textLine(s.name, m.line)}</Text>
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    bandId = e.requestId
    const r = drawn(bandId, set, pose, now)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Raster key="dog" columns={r.columns} rows={r.rows} cells={r.cells} />
        {e.props.bodyColumns >= set.width + 1 + BUBBLE_COLUMNS && (
          <Box flexDirection="column" justifyContent="center">
            <Text bold color="#E8AC4C">{s.name}</Text>
            <Text wrap="truncate-end">{m.line}</Text>
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const m = await read($, mood)
    const s = await read($, stats)
    const now = await $.clock.now()
    const level = bondLevel(s.bond)
    const hearts = '♥'.repeat(level.hearts) + '♡'.repeat(4 - level.hearts)
    const since = s.firstMet ? new Date(s.firstMet).toISOString().slice(0, 10) : 'today'
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text bold color="#E8AC4C">{s.name}</Text>
          <Text dimColor>· {level.title} {hearts}</Text>
        </Box>
        <Text wrap="truncate-end">{m.line || ' '}</Text>
        <Text dimColor>together {s.sessions} sessions · since {since}</Text>
        <Text dimColor>treats {s.treats} · pets {s.pets} · things fetched {grouped(s.fetched + pendingFetched)}</Text>
        <Box flexDirection="row" columnGap={3}>
          <Button key="pet" label="pet" hotkey="p" plain onPress={() => pet($)} />
          <Button key="treat" label="treat" hotkey="t" plain onPress={() => treat($)} />
        </Box>
      </Box>
    )
    if (e.surface !== 'terminal') return info
    const { Raster } = $.ui.resolve(e)
    paneSet = e.props.bodyColumns >= SPRITES.big.width ? SPRITES.big : SPRITES.mini
    const r = drawn(PANE, paneSet, poseOf(m, now), now)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Raster key="dog" columns={r.columns} rows={r.rows} cells={r.cells} />
        {info}
      </Box>
    )
  })
}

/** Loads what the dog remembers, counts a new session once, and says hello. */
async function wakeUp($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, mood, () => initialMood(now))
  const shown = toDisplay(await $.store.get('display')) ?? defaultDisplay
  await update($, display, () => shown)
  if (!(await read($, isCounted))) {
    await update($, isCounted, () => true)
    const before = await loadStats($)
    await bump($, 'sessions', 1)
    await bump($, 'bond', 1)
    if (!before.firstMet) await $.store.set('firstMet', now)
    await $.store.set('lastSeen', now)
    const hello = greeting(before.name, before.sessions, before.lastSeen, now)
    await feel($, { kind: 'greet', ...hello })
    celebrate($, before.name, levelUp(before.bond, before.bond + 1))
  }
  await refreshStats($)
  if (shown === 'pane') await $.ui.open({ id: PANE, title: (await read($, stats)).name })
}

async function feel($: EngineInterface, ev: DogEvent): Promise<void> {
  const now = await $.clock.now()
  await update($, mood, m => step(m, ev, now))
}

async function pet($: EngineInterface): Promise<void> {
  sessionPets += 1
  await bump($, 'pets', 1)
  const bond = toCount(await $.store.get('bond'))
  if (sessionPets <= PET_CAP) {
    await bump($, 'bond', 1)
    celebrate($, (await read($, stats)).name, levelUp(bond, bond + 1))
  }
  await refreshStats($)
  await feel($, { kind: 'pet' })
}

async function treat($: EngineInterface): Promise<void> {
  sessionTreats += 1
  const isAccepted = sessionTreats <= TREAT_CAP
  if (isAccepted) {
    await bump($, 'treats', 1)
    const bond = toCount(await $.store.get('bond'))
    await bump($, 'bond', 2)
    celebrate($, (await read($, stats)).name, levelUp(bond, bond + 2))
    await refreshStats($)
  }
  await feel($, { kind: 'treat', isAccepted })
}

function celebrate($: EngineInterface, name: string, title: string | null): void {
  if (title) $.ui.toast(`${name} thinks you're a ${title} now ♥`)
}

/** Commands stay quiet while the dog is on screen to answer for itself. */
async function reply($: EngineInterface): Promise<{ text?: string }> {
  if ((await read($, display)) !== 'off') return {}
  return { text: textLine((await read($, stats)).name, (await read($, mood)).line) }
}

async function setDisplay($: EngineInterface, next: Display): Promise<void> {
  await $.store.set('display', next)
  await update($, display, () => next)
  if (next === 'pane') {
    await $.ui.open({ id: PANE, title: (await read($, stats)).name, closeOnEscape: true })
  } else {
    await $.ui.close({ id: PANE })
  }
}

/** Re-reads the store right before writing, since other sessions share it. */
async function bump($: EngineInterface, key: CountKey, by: number): Promise<number> {
  const value = toCount(await $.store.get(key)) + by
  await $.store.set(key, value)
  return value
}

async function loadStats($: EngineInterface): Promise<Stats> {
  const name = await $.store.get('name')
  return {
    name: typeof name === 'string' && name.trim() ? name : defaultName,
    bond: toCount(await $.store.get('bond')),
    treats: toCount(await $.store.get('treats')),
    pets: toCount(await $.store.get('pets')),
    sessions: toCount(await $.store.get('sessions')),
    fetched: toCount(await $.store.get('fetched')),
    firstMet: toCount(await $.store.get('firstMet')),
    lastSeen: toCount(await $.store.get('lastSeen')),
  }
}

async function refreshStats($: EngineInterface): Promise<void> {
  const fresh = await loadStats($)
  await update($, stats, () => fresh)
}

async function flushFetched($: EngineInterface): Promise<void> {
  if (pendingFetched === 0) return
  const n = pendingFetched
  pendingFetched = 0
  await bump($, 'fetched', n)
  await refreshStats($)
}

async function onTick($: EngineInterface): Promise<void> {
  const shown = await read($, display)
  if (shown === 'off') return
  const now = await $.clock.now()
  const sleepAfter = isNight(new Date(now).getHours()) ? NIGHT_SLEEP_MS : undefined
  const m = await read($, mood)
  if (tick(m, now, sleepAfter) !== m) {
    // The pose changed: the write redraws every site that reads the mood
    await update($, mood, cur => tick(cur, now, sleepAfter))
    return
  }
  const run = await read($, streak)
  if (run !== null && m.base !== 'asleep' && breakDue(run, now, breakAfterMs)) {
    await update($, streak, () => remind(run, now))
    await feel($, { kind: 'leash', line: `walk? you've been at it ${formatStreak(now - run.startedAt)}` })
    return
  }
  const pose = poseOf(m, now)
  if (shown === 'band' && bandId !== null) await animate($, bandId, SPRITES.mini, pose, now)
  if (shown === 'pane') await animate($, PANE, paneSet, pose, now)
}

/** Repaints a mounted Raster when its frame has moved on, without a render pass. */
async function animate($: EngineInterface, requestId: string, set: SpriteSet, pose: Pose, now: number): Promise<void> {
  const frame = advanceAnim(requestId, set, pose, now)
  if (lastBlit.get(requestId) === frame) return
  lastBlit.set(requestId, frame)
  try {
    const r = cellsOf(frame, set.width, set.height, PALETTE)
    await $.ui.blit({ requestId, key: 'dog', cells: r.cells, columns: r.columns, rows: r.rows })
  } catch {
    lastBlit.delete(requestId) // not mounted right now; try again next tick
  }
}

/** Moves this drawing's animation towards `pose` and returns the frame to show now. */
function advanceAnim(requestId: string, set: SpriteSet, pose: Pose, now: number): string {
  const r = frameOf(anims.get(requestId) ?? startAnim(pose, now), set, pose, now)
  anims.set(requestId, r.anim)
  return r.frame
}

function drawn(requestId: string, set: SpriteSet, pose: Pose, now: number) {
  const frame = advanceAnim(requestId, set, pose, now)
  lastBlit.set(requestId, frame)
  return cellsOf(frame, set.width, set.height, PALETTE)
}

async function bark($: EngineInterface, text: string): Promise<void> {
  try {
    await $.ui.notify(text, { title: (await read($, stats)).name })
  } catch {
    // notifications off or unavailable: the dog on screen still reacts
  }
}

function cancelWaitBark(key: string | undefined): void {
  const k = key ?? ''
  waitBarks.get(k)?.cancel()
  waitBarks.delete(k)
}

function positive(v: unknown, fallback: number): number {
  return typeof v === 'number' && v > 0 ? v : fallback
}

function targetOf(e: object): string {
  for (const key of ['file_path', 'notebook_path', 'command', 'pattern', 'url', 'query']) {
    const value = Object.entries(e).find(([k]) => k === key)?.[1]
    if (typeof value === 'string') return value.split('\n')[0] ?? ''
  }
  return ''
}

function textLine(name: string, line: string): string {
  return `🐕 ${name}${line ? ': ' + line : ''}`
}

function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
