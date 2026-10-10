import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Display, Pose, Stats, TrickName } from '../types'
import { PET_CAP, TREAT_CAP, TRICKS, bondLevel, greeting, isTrick, knownTricks, levelUp, toCount, toDisplay, trickFor } from './bond'
import { classifyCommand, contextLevel } from './milestones'
import { initialMood, poseOf, step, tick } from './mood'
import { MAX_SLOTS, drawPack, layout, reconcile } from './pack'
import type { AgentSeen, Geometry } from './pack'
import type { DogEvent } from './mood'
import {
  NIGHT_SLEEP_MS, WAIT_BARK_MS, breakDue, formatStreak, isNight, noteActivity, remind, shouldBark, spinnerWord, yawnDue,
} from './nudges'
import { startAnim, frameOf } from './animator'
import type { Anim } from './animator'
import { cellsOf } from './raster'
import type { PupSet, SpriteSet } from './raster'
import { RECAP_SYSTEM, cleanRecap, describeAction, logAction, recapPrompt, shouldRecap } from './recap'
import { pickOutcome, showFrame } from './shows'
import { PALETTE, PUPS, SHOWS, SPRITES } from './sprites'

const PANE = 'doggo'
const TICK_MS = 100
const FLUSH_MS = 30_000
const BUBBLE_COLUMNS = 12
const BAND_SLOT = 10
const PANE_SLOT = 26
const POLL_EVERY_TICKS = 10
const HINT = 'pet | treat | fetch | trick [name] | band | pane | off | name <name>'
const USAGE = `usage: /doggo [${HINT}]`
const FETCH_BOND_CAP = 3

const mood = atom({ plugin: 'doggo', key: 'mood' } as const, initialMood(0))
const stats = atom({ plugin: 'doggo', key: 'stats' } as const, {
  name: 'Biscuit', bond: 0, treats: 0, pets: 0, sessions: 0, fetched: 0, balls: 0, firstMet: 0, lastSeen: 0,
})
const display = atom({ plugin: 'doggo', key: 'display' } as const, 'band')
const isCounted = atom({ plugin: 'doggo', key: 'isCounted' } as const, false)
const streak = atom({ plugin: 'doggo', key: 'streak' } as const, null)
const lastYawnAt = atom({ plugin: 'doggo', key: 'lastYawnAt' } as const, 0)
const pack = atom({ plugin: 'doggo', key: 'pack' } as const, [])
const show = atom({ plugin: 'doggo', key: 'show' } as const, null)

type CountKey = 'bond' | 'treats' | 'pets' | 'sessions' | 'fetched' | 'balls'

// Per-load values: losing them on a hot reload only resets session caps and the blit cache.
let defaultName = 'Biscuit'
let defaultDisplay: Display = 'band'
let sessionPets = 0
let sessionTreats = 0
let sessionFetches = 0
let pendingFetched = 0
let bandId: string | null = null
let paneSet: SpriteSet = SPRITES.big
const lastBlit = new Map<string, string>()
const anims = new Map<string, Anim>()
// How each drawing last laid out its pack, so the tick can repaint it without a render pass
const packViews = new Map<string, { set: PupSet; geo: Geometry; height: number }>()
let ticks = 0
// The bubble is text, not pixels: a blit can't change it, so a new show line needs a redraw
let lastShowLine = ''
let barkAfterMs = 60_000
let breakAfterMs = 90 * 60_000
let isSpinnerOn = true
let isRecapOn = false
let isBarksOn = false
let barkVolume = 0.6
// What the dog saw this turn, for the recap; and which turn is current, so a late recap can tell it's stale
let turnLog: string[] = []
let currentTurnId = ''
// Approval waits that will bark unless the tool call returns first, by tool_use_id
const waitBarks = new Map<string, { cancel(): void }>()

export const register: Register = (on, options) => {
  defaultName = typeof options.name === 'string' && options.name.trim() ? options.name.trim() : 'Biscuit'
  defaultDisplay = toDisplay(options.display) ?? 'band'
  barkAfterMs = positive(options.barkAfterSeconds, 60) * 1000
  breakAfterMs = positive(options.breakAfterMinutes, 90) * 60_000
  isSpinnerOn = options.spinner !== false
  isRecapOn = options.recap === true
  isBarksOn = options.barks === true
  barkVolume = typeof options.barkVolume === 'number' ? Math.min(1, Math.max(0, options.barkVolume)) : 0.6

  on('session.start', async ($, e, next) => {
    await wakeUp($)
    $.clock.every(TICK_MS, () => onTick($))
    $.clock.every(FLUSH_MS, () => flushFetched($))
    try {
      await $.command.register({
        name: 'doggo',
        description: 'Your golden retriever buddy',
        argumentHint: HINT,
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
    currentTurnId = e.turnId
    turnLog = []
    await feel($, { kind: 'turnStart' })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) await feel($, { kind: 'tool', tool: String(e.tool), target: targetOf(e) })
    const ran = await next(e)
    cancelWaitBark(e.tool_use_id)
    pendingFetched += 1
    if (ran.deny !== undefined) return ran
    const milestone = String(e.tool) === 'Bash' && e.agentId === undefined ? classifyCommand(fieldOf(e, 'command')) : null
    if (milestone) await feel($, { kind: 'milestone', which: milestone, isOk: ran.isError !== true })
    else if (ran.isError === true) await feel($, { kind: 'toolFailed' })
    if (e.agentId === undefined) {
      const outcome = milestone === 'test' ? (ran.isError === true ? 'failed' : 'passed') : ran.isError === true ? 'failed' : null
      turnLog = logAction(turnLog, describeAction(String(e.tool), targetOf(e), outcome))
    }
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
    if (shouldBark(e, barkAfterMs)) {
      await bark($, "Claude's done! 🐾")
      playSound($, 'sounds/bark.wav')
    }
    if (isRecapOn && shouldRecap(e)) {
      const turnId = e.turnId
      const actions = turnLog
      const answer = e.answer
      // from a timer, so the model call belongs to the mod and not to this turn's ending
      $.clock.after(0, () => recap($, turnId, actions, answer))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await feel($, { kind: 'context', level: contextLevel(e.context.percent) })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    // precompute runs in the background; only a compaction you'd see gets a shake
    const isSeen = e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'auto')
    if (isSeen && done.skip === undefined) await feel($, { kind: 'compacted' })
    return done
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
      case 'fetch':
        await play($, 'fetch')
        return reply($)
      case 'trick': {
        const name = rest[0] ?? ''
        const known = knownTricks(toCount(await $.store.get('bond')))
        if (name === '') {
          await play($, known[Math.floor(Math.random() * known.length)] ?? 'sit')
          return reply($)
        }
        if (!isTrick(name)) return { text: `tricks: ${known.join(', ')} (and more to learn)` }
        if (!known.includes(name)) {
          await feel($, { kind: 'say', pose: 'tilt', line: `don't know that one yet… (${TRICKS[name].level})` })
          return reply($)
        }
        await play($, name)
        return reply($)
      }
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
    const pups = await read($, pack)
    if (e.surface !== 'terminal' || e.props.bodyColumns < set.width || e.props.maxRows < rows) {
      const { Text } = $.ui.resolve(e)
      return <Text>{textLine(s.name, m.line, pups.length)}</Text>
    }
    const { Box, Raster, Text } = $.ui.resolve(e)
    bandId = e.requestId
    const playing = await read($, show)
    const act = playing ? showFrame(playing, now, SHOWS.mini, set) : null
    const r = act ? cellsOf(act.frame, set.width, set.height, PALETTE) : drawn(bandId, set, pose, now)
    const hasBubble = e.props.bodyColumns >= set.width + 1 + BUBBLE_COLUMNS
    // the pack only gets what the bubble can spare, so it is the first thing a narrow band drops
    const spare = e.props.bodyColumns - set.width - 1 - BUBBLE_COLUMNS - 4
    const slots = hasBubble ? Math.min(MAX_SLOTS, Math.max(0, Math.floor(spare / BAND_SLOT))) : 0
    const view = pups.length > 0 && slots > 0 ? packView(bandId, pups, now, PUPS.mini, slots, BAND_SLOT, set.height) : null
    if (!view) packViews.delete(bandId)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Raster key="dog" columns={r.columns} rows={r.rows} cells={r.cells} />
        {hasBubble && (
          <Box flexDirection="column" justifyContent="center" flexGrow={1}>
            <Text bold color="#E8AC4C">{s.name}</Text>
            <Text wrap="truncate-end">{act?.line ?? m.line}</Text>
          </Box>
        )}
        {view && <Raster key="pack" columns={view.cells.columns} rows={view.cells.rows} cells={view.cells.cells} />}
        {view && view.overflow > 0 && <Text dimColor>+{view.overflow}</Text>}
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
    const playing = await read($, show)
    const isBig = e.props.bodyColumns >= SPRITES.big.width
    const paneAct = playing ? showFrame(playing, now, isBig ? SHOWS.big : SHOWS.mini, isBig ? SPRITES.big : SPRITES.mini) : null
    const { Box, Button, Text } = $.ui.resolve(e)
    const info = (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text bold color="#E8AC4C">{s.name}</Text>
          <Text dimColor>· {level.title} {hearts}</Text>
        </Box>
        <Text wrap="truncate-end">{paneAct?.line ?? (m.line || ' ')}</Text>
        <Text dimColor>together {s.sessions} sessions · since {since}</Text>
        <Text dimColor>treats {s.treats} · pets {s.pets} · balls {s.balls} · things fetched {grouped(s.fetched + pendingFetched)}</Text>
        <Box flexDirection="row" columnGap={3}>
          <Button key="pet" label="pet" hotkey="p" plain onPress={() => pet($)} />
          <Button key="treat" label="treat" hotkey="t" plain onPress={() => treat($)} />
          <Button key="fetch" label="fetch" hotkey="f" plain onPress={() => play($, 'fetch')} />
        </Box>
      </Box>
    )
    if (e.surface !== 'terminal') return info
    const { Raster } = $.ui.resolve(e)
    paneSet = isBig ? SPRITES.big : SPRITES.mini
    const r = paneAct ? cellsOf(paneAct.frame, paneSet.width, paneSet.height, PALETTE) : drawn(PANE, paneSet, poseOf(m, now), now)
    const pups = await read($, pack)
    const slots = Math.min(MAX_SLOTS, Math.floor(e.props.bodyColumns / PANE_SLOT))
    const view = pups.length > 0 && slots > 0 ? packView(PANE, pups, now, PUPS.big, slots, PANE_SLOT, PUPS.big.height) : null
    if (!view) packViews.delete(PANE)
    // labels sit under settled pups only; one moving through a slot would drag its label along
    const labels = Array.from({ length: slots }, (_, slot) =>
      pups.find(p => p.slot === slot && (p.phase === 'here' || p.phase === 'done' || p.phase === 'sad'))?.label ?? '')
    return (
      <Box flexDirection="column" rowGap={1}>
        <Raster key="dog" columns={r.columns} rows={r.rows} cells={r.cells} />
        {view && (
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Raster key="pack" columns={view.cells.columns} rows={view.cells.rows} cells={view.cells.cells} />
              {view.overflow > 0 && <Text dimColor>+{view.overflow}</Text>}
            </Box>
            <Box flexDirection="row">
              {labels.map((label, slot) => (
                <Box key={`label-${slot}`} width={PANE_SLOT}>
                  <Text dimColor wrap="truncate-end">{label || ' '}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
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
    playSound($, 'sounds/woof.wav')
    await bump($, 'treats', 1)
    const bond = toCount(await $.store.get('bond'))
    await bump($, 'bond', 2)
    celebrate($, (await read($, stats)).name, levelUp(bond, bond + 2))
    await refreshStats($)
  }
  await feel($, { kind: 'treat', isAccepted })
}

function celebrate($: EngineInterface, name: string, title: string | null): void {
  if (!title) return
  const trick = trickFor(title)
  $.ui.toast(`${name} thinks you're a ${title} now ♥${trick ? ` and learned ${TRICKS[trick].title}!` : ''}`)
}

/** Starts fetch or a trick, unless a show is already running. */
async function play($: EngineInterface, kind: 'fetch' | TrickName): Promise<void> {
  if ((await read($, show)) !== null) return
  const now = await $.clock.now()
  const outcome = pickOutcome(Math.random())
  if ((await read($, display)) === 'off') {
    // nothing to watch: the dog just tells you how it went
    const line = kind !== 'fetch' ? `*${TRICKS[kind].title}*` : outcome === 'drop' ? '*fetches the ball* again!' : outcome === 'keep' ? '*fetches the ball* mine!' : 'there was a SQUIRREL'
    await feel($, { kind: 'say', pose: 'happy', line })
  } else {
    await update($, show, () => ({ kind, outcome, startedAt: now }))
    if (kind === 'fetch') playSound($, 'sounds/bark.wav')
  }
  if (kind !== 'fetch') return
  sessionFetches += 1
  await bump($, 'balls', 1)
  if (sessionFetches <= FETCH_BOND_CAP) {
    const bond = toCount(await $.store.get('bond'))
    await bump($, 'bond', 1)
    celebrate($, (await read($, stats)).name, levelUp(bond, bond + 1))
  }
  await refreshStats($)
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
    balls: toCount(await $.store.get('balls')),
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
  ticks += 1
  const seen = ticks % POLL_EVERY_TICKS === 0 ? await pollAgents($) : null
  const pups = await read($, pack)
  const moved = reconcile(pups, seen, now)
  if (moved !== pups) await update($, pack, () => moved)
  for (const [requestId, view] of packViews) {
    const isShown = (shown === 'band' && requestId === bandId) || (shown === 'pane' && requestId === PANE)
    if (isShown) await repaint($, `${requestId}:pack`, requestId, 'pack', drawPack(moved, now, view.set, view.geo, view.height))
  }
  const playing = await read($, show)
  if (playing) {
    // the show runs on whichever sprite size is on screen; sizes differ in length
    const isBand = shown === 'band'
    const sit = isBand ? SPRITES.mini : paneSet
    const set = isBand || paneSet !== SPRITES.big ? SHOWS.mini : SHOWS.big
    const requestId = isBand ? bandId : PANE
    const act = showFrame(playing, now, set, sit)
    if (act) {
      if (requestId !== null) await repaint($, requestId, requestId, 'dog', act.frame, sit.width, sit.height)
      if (act.line !== lastShowLine) {
        lastShowLine = act.line
        $.ui.invalidate('ui.render')
      }
      return
    }
    lastShowLine = ''
    // the show is over: it ends sitting, so the animation picks up from a sit
    for (const id of [...anims.keys()]) anims.set(id, startAnim('idle', now))
    await update($, show, () => null)
    await feel($, { kind: 'say', pose: 'happy', line: showFrame(playing, now - 1, set, sit)?.line ?? '' })
    return
  }
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
  await repaint($, requestId, requestId, 'dog', advanceAnim(requestId, set, pose, now), set.width, set.height)
}

/** Blits a frame to a mounted Raster unless it is already showing; `cache` names the Raster. */
async function repaint(
  $: EngineInterface, cache: string, requestId: string, key: string, frame: string, width?: number, height?: number,
): Promise<void> {
  if (lastBlit.get(cache) === frame) return
  lastBlit.set(cache, frame)
  const view = packViews.get(requestId)
  const w = width ?? view?.geo.areaWidth ?? 0
  const h = height ?? view?.height ?? 0
  try {
    const r = cellsOf(frame, w, h, PALETTE)
    await $.ui.blit({ requestId, key, cells: r.cells, columns: r.columns, rows: r.rows })
  } catch {
    lastBlit.delete(cache) // not mounted right now; try again next tick
  }
}

/** Lays out a drawing's pack and remembers how, so ticks can repaint it. */
function packView(requestId: string, pups: Parameters<typeof drawPack>[0], now: number, set: PupSet, slots: number, slotWidth: number, height: number) {
  const geo: Geometry = { slotWidth, areaWidth: slots * slotWidth, visibleSlots: slots }
  packViews.set(requestId, { set, geo, height })
  const frame = drawPack(pups, now, set, geo, height)
  lastBlit.set(`${requestId}:pack`, frame)
  return { cells: cellsOf(frame, geo.areaWidth, height, PALETTE), overflow: layout(pups, now, geo).overflow }
}

async function pollAgents($: EngineInterface): Promise<AgentSeen[] | null> {
  try {
    const agents = await $.agent.list()
    return agents.map(a => ({ id: a.id, label: a.description || a.name || a.type, status: a.status }))
  } catch {
    return null // skip this poll; the pack keeps moving on time alone
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

/** Asks Haiku for a one-line dog's-eye recap and puts it in the bubble, unless a newer turn has begun. */
async function recap($: EngineInterface, turnId: string, actions: readonly string[], answer: string): Promise<void> {
  try {
    const name = (await read($, stats)).name
    const r = await $.model.complete({
      model: 'haiku', system: RECAP_SYSTEM, prompt: recapPrompt(name, actions, answer), maxTokens: 120, timeoutMs: 15_000,
    })
    const line = r.isAnswered ? cleanRecap(r.text) : null
    if (line && turnId === currentTurnId) await feel($, { kind: 'say', pose: 'happy', line })
  } catch {
    // no recap this time: the bubble keeps "done!"
  }
}

function playSound($: EngineInterface, asset: string): void {
  if (!isBarksOn) return
  $.audio.play({ asset }, { gain: barkVolume }).catch(() => {
    // no player here (Linux, Windows) or the clip failed: barks are a nicety
  })
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
    const value = fieldOf(e, key)
    if (value) return value.split('\n')[0] ?? ''
  }
  return ''
}

/** A string field of a tool's input, read without assuming which tool it is. */
function fieldOf(e: object, key: string): string {
  const value = Object.entries(e).find(([k]) => k === key)?.[1]
  return typeof value === 'string' ? value : ''
}

function textLine(name: string, line: string, pups = 0): string {
  return `🐕 ${name}${pups > 0 ? ` (+${pups} pup${pups === 1 ? '' : 's'})` : ''}${line ? ': ' + line : ''}`
}

function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
