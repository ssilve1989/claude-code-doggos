// When the dog should nudge you: breaks, bedtime, barks, and its spinner word. No `$` here.
import type { RenderPropsOf } from 'claude-code'

import type { Pose, Streak } from '../types'

const MIN = 60_000
export const STREAK_GAP_MS = 15 * MIN
export const REMIND_EVERY_MS = 30 * MIN
export const YAWN_EVERY_MS = 60 * MIN
export const NIGHT_SLEEP_MS = 2 * MIN
export const WAIT_BARK_MS = 30_000

/** Extends the current streak, or starts a new one after a long gap. */
export function noteActivity(s: Streak | null, now: number): Streak {
  if (s === null || now - s.lastActivityAt > STREAK_GAP_MS) {
    return { startedAt: now, lastActivityAt: now, lastRemindedAt: now }
  }
  return { ...s, lastActivityAt: now }
}

export function breakDue(s: Streak | null, now: number, breakAfterMs: number): boolean {
  if (s === null || now - s.lastActivityAt > STREAK_GAP_MS) return false
  return now - s.startedAt >= breakAfterMs && (s.lastRemindedAt === s.startedAt || now - s.lastRemindedAt >= REMIND_EVERY_MS)
}

export function remind(s: Streak, now: number): Streak {
  return { ...s, lastRemindedAt: now }
}

export function formatStreak(ms: number): string {
  const minutes = Math.floor(ms / MIN)
  const hours = Math.floor(minutes / 60)
  return hours === 0 ? `${minutes}m` : `${hours}h${String(minutes % 60).padStart(2, '0')}`
}

/** Local hours [start, end); a start later than the end wraps past midnight. */
export function isNight(hour: number, start = 0, end = 5): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}

export function yawnDue(lastYawnAt: number, now: number, hour: number): boolean {
  return isNight(hour) && now - lastYawnAt >= YAWN_EVERY_MS
}

export function shouldBark(turn: { durationMs: number; isAborted: boolean; agentId?: string }, thresholdMs: number): boolean {
  return turn.agentId === undefined && !turn.isAborted && turn.durationMs >= thresholdMs
}

export function spinnerWord(mode: RenderPropsOf['Spinner']['mode'], action: Pose | null): string {
  switch (mode) {
    case 'thinking':
      return 'Pondering'
    case 'requesting':
      return 'Wagging'
    case 'responding':
      return 'Woofing'
    case 'tool-input':
    case 'tool-use':
      return action === 'sniff' ? 'Sniffing' : action === 'dig' ? 'Digging' : action === 'tilt' ? 'Waiting' : 'Fetching'
  }
}
