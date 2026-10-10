// The dog's mood: a pure state machine fed by session events. No `$` here.
import type { ContextLevel, Mood, Pose } from '../types'
import type { Milestone } from './milestones'

export type DogEvent =
  | { kind: 'prompt' }
  | { kind: 'turnStart' }
  | { kind: 'tool'; tool: string; target: string }
  | { kind: 'toolFailed' }
  | { kind: 'ask' }
  | { kind: 'turnComplete' }
  | { kind: 'pet' }
  | { kind: 'treat'; isAccepted: boolean }
  | { kind: 'greet'; line: string; isExcited: boolean }
  | { kind: 'leash'; line: string }
  | { kind: 'yawn' }
  | { kind: 'context'; level: ContextLevel }
  | { kind: 'compacted' }
  | { kind: 'milestone'; which: Milestone; isOk: boolean }

export const REACTION_MS = 3000
export const SLEEP_AFTER_MS = 10 * 60 * 1000
/** Nudges stay up longer than a reaction so you notice them. */
export const NUDGE_MS = 20_000
/** Claude busy with nothing new to show for this long: the dog lies down to wait. */
export const LIE_AFTER_MS = 2 * 60 * 1000
const ZOOMIES_MS = 4000

export function initialMood(now: number): Mood {
  return { base: 'idle', action: null, reaction: null, line: '', lastActivityAt: now, context: 'ok' }
}

export function step(m: Mood, ev: DogEvent, now: number): Mood {
  // A context reading is bookkeeping, not something happening: it neither wakes nor counts as activity
  if (ev.kind === 'context') {
    const isNewlyFull = ev.level === 'full' && m.context !== 'full'
    return { ...m, context: ev.level, line: isNewlyFull ? 'getting full in here… /compact?' : m.line }
  }
  const woke = m.base === 'asleep'
  const next = apply({ ...m, base: woke ? 'idle' : m.base, lastActivityAt: now }, ev, now)
  return woke ? { ...next, line: 'huh? oh! ' + next.line } : next
}

function apply(m: Mood, ev: DogEvent, now: number): Mood {
  const react = (pose: Pose, line: string, ms = REACTION_MS): Mood => ({ ...m, reaction: { pose, until: now + ms }, line })
  switch (ev.kind) {
    case 'prompt':
      return react('excited', 'ooh, a job!')
    case 'turnStart':
      return { ...m, base: 'working', action: null }
    case 'tool': {
      const [action, line] = toolAction(ev.tool, ev.target)
      return { ...m, base: 'working', action, line }
    }
    case 'toolFailed':
      return react('worried', 'uh oh…')
    case 'ask':
      return { ...m, action: 'tilt', line: 'can we?' }
    case 'turnComplete':
      return { ...react('happy', 'done! good boy?'), base: 'idle', action: null }
    case 'pet':
      return react('happy', '*leans into it*')
    case 'treat':
      return ev.isAccepted ? react('excited', 'nom!') : react('tilt', 'too full… maybe later')
    case 'greet':
      return react(ev.isExcited ? 'excited' : 'happy', ev.line)
    case 'leash':
      return react('leash', ev.line, NUDGE_MS)
    case 'yawn':
      return react('yawn', "it's late… bed?", NUDGE_MS)
    case 'context':
      return { ...m, context: ev.level }
    case 'compacted':
      return { ...react('shake', '*shakes off* fresh start!'), context: 'ok' }
    case 'milestone':
      if (!ev.isOk) return react('worried', ev.which === 'test' ? 'tests failed… 🥺' : 'uh oh…')
      if (ev.which === 'test') return react('zoomies', 'zoomies!!', ZOOMIES_MS)
      return ev.which === 'commit' ? react('happy', 'committed! 🦴') : react('excited', 'shipped it!')
  }
}

function toolAction(tool: string, target: string): [Pose, string] {
  const name = target.split('/').pop() ?? target
  switch (tool) {
    case 'Read':
    case 'Grep':
    case 'Glob':
      return ['sniff', `sniffing ${name}…`]
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return ['dig', `burying a change in ${name}`]
    case 'Bash':
      return ['walk', `fetching \`${target}\`…`]
    case 'Agent':
    case 'Task':
      return ['walk', 'calling the pack…']
    default:
      return ['walk', `fetching ${tool}…`]
  }
}

/** Expires reactions and puts an idle dog to sleep; returns `m` itself when nothing changed. */
export function tick(m: Mood, now: number, sleepAfterMs = SLEEP_AFTER_MS): Mood {
  let out = m
  if (out.reaction && now >= out.reaction.until) out = { ...out, reaction: null }
  if (out.base === 'idle' && now - out.lastActivityAt > sleepAfterMs) {
    out = { ...out, base: 'asleep', action: null, line: 'zzz' }
  }
  if (out.base === 'working' && out.action !== 'lie' && now - out.lastActivityAt > LIE_AFTER_MS) {
    out = { ...out, action: 'lie', line: "I'll wait here…" }
  }
  return out
}

export function poseOf(m: Mood, now: number): Pose {
  if (m.reaction && now < m.reaction.until) return m.reaction.pose
  if (m.base === 'asleep') return 'sleep'
  if (m.base === 'working' && m.action) return m.action
  return m.context === 'full' ? 'pant' : m.context === 'drowsy' ? 'drowsy' : 'idle'
}
