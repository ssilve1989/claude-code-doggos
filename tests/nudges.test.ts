import { expect, test } from 'claude-code/testing'

import {
  REMIND_EVERY_MS, STREAK_GAP_MS, breakDue, formatStreak, isNight, noteActivity, remind, shouldBark, spinnerWord, yawnDue,
} from '../hooks/nudges'

const MIN = 60_000
const T0 = 10_000_000

test('a streak starts on activity, continues across short gaps and resets after a long one', async () => {
  const s = noteActivity(null, T0)
  expect(s).toEqual({ startedAt: T0, lastActivityAt: T0, lastRemindedAt: T0 })
  const cont = noteActivity(s, T0 + 10 * MIN)
  expect(cont.startedAt).toBe(T0)
  const reset = noteActivity(cont, T0 + 10 * MIN + STREAK_GAP_MS + 1)
  expect(reset.startedAt).toBe(T0 + 10 * MIN + STREAK_GAP_MS + 1)
})

test('a break is due at the threshold, then every 30 minutes, never after a gap', async () => {
  const after = 90 * MIN
  let s = noteActivity(null, T0)
  for (let t = 10; t <= 90; t += 10) s = noteActivity(s, T0 + t * MIN)
  expect(breakDue(s, T0 + 89 * MIN, after)).toBe(false)
  expect(breakDue(s, T0 + 90 * MIN, after)).toBe(true)
  s = remind(s, T0 + 90 * MIN)
  expect(breakDue(s, T0 + 100 * MIN, after)).toBe(false)
  s = noteActivity(noteActivity(s, T0 + 100 * MIN), T0 + 110 * MIN)
  expect(breakDue(s, T0 + 90 * MIN + REMIND_EVERY_MS, after)).toBe(true)
  // walked away: the streak is over, so no nagging
  expect(breakDue(s, T0 + 110 * MIN + STREAK_GAP_MS + 1, after)).toBe(false)
  expect(breakDue(null, T0, after)).toBe(false)
})

test('streak lengths read as hours and minutes', async () => {
  expect(formatStreak(90 * MIN)).toBe('1h30')
  expect(formatStreak(125 * MIN)).toBe('2h05')
  expect(formatStreak(45 * MIN)).toBe('45m')
})

test('night hours, including a window that wraps past midnight', async () => {
  expect(isNight(0)).toBe(true)
  expect(isNight(4)).toBe(true)
  expect(isNight(5)).toBe(false)
  expect(isNight(23)).toBe(false)
  expect(isNight(23, 22, 5)).toBe(true)
  expect(isNight(12, 22, 5)).toBe(false)
})

test('yawns come at night at most once an hour', async () => {
  expect(yawnDue(0, T0, 1)).toBe(true)
  expect(yawnDue(T0, T0 + 59 * MIN, 1)).toBe(false)
  expect(yawnDue(T0, T0 + 60 * MIN, 1)).toBe(true)
  expect(yawnDue(0, T0, 14)).toBe(false)
})

test('barks only for long, finished, main-conversation turns', async () => {
  const at = 60_000
  expect(shouldBark({ durationMs: 61_000, isAborted: false }, at)).toBe(true)
  expect(shouldBark({ durationMs: 59_000, isAborted: false }, at)).toBe(false)
  expect(shouldBark({ durationMs: 120_000, isAborted: true }, at)).toBe(false)
  expect(shouldBark({ durationMs: 120_000, isAborted: false, agentId: 'a1' }, at)).toBe(false)
})

test('the spinner speaks dog', async () => {
  expect(spinnerWord('tool-use', 'sniff')).toBe('Sniffing')
  expect(spinnerWord('tool-use', 'dig')).toBe('Digging')
  expect(spinnerWord('tool-input', 'walk')).toBe('Fetching')
  expect(spinnerWord('tool-use', 'tilt')).toBe('Waiting')
  expect(spinnerWord('tool-use', null)).toBe('Fetching')
  expect(spinnerWord('thinking', 'dig')).toBe('Pondering')
  expect(spinnerWord('requesting', null)).toBe('Wagging')
  expect(spinnerWord('responding', null)).toBe('Woofing')
})
