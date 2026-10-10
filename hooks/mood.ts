// The dog's mood: a pure state machine fed by session events. No `$` here.
import type { Mood, Pose } from '../types'

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

export const REACTION_MS = 3000
export const SLEEP_AFTER_MS = 10 * 60 * 1000

export function initialMood(now: number): Mood {
  return { base: 'idle', action: null, reaction: null, line: '', lastActivityAt: now }
}

export function step(m: Mood, ev: DogEvent, now: number): Mood {
  const woke = m.base === 'asleep'
  const next = apply({ ...m, base: woke ? 'idle' : m.base, lastActivityAt: now }, ev, now)
  return woke ? { ...next, line: 'huh? oh! ' + next.line } : next
}

function apply(m: Mood, ev: DogEvent, now: number): Mood {
  const react = (pose: Pose, line: string): Mood => ({ ...m, reaction: { pose, until: now + REACTION_MS }, line })
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
export function tick(m: Mood, now: number): Mood {
  let out = m
  if (out.reaction && now >= out.reaction.until) out = { ...out, reaction: null }
  if (out.base === 'idle' && now - out.lastActivityAt > SLEEP_AFTER_MS) {
    out = { ...out, base: 'asleep', action: null, line: 'zzz' }
  }
  return out
}

export function poseOf(m: Mood, now: number): Pose {
  if (m.reaction && now < m.reaction.until) return m.reaction.pose
  if (m.base === 'asleep') return 'sleep'
  if (m.base === 'working' && m.action) return m.action
  return 'idle'
}
