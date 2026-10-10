// What the dog remembers about you, and what it makes of it. No `$` here.

import type { Display } from '../types'

export const PET_CAP = 5
export const TREAT_CAP = 3

const LEVELS = [
  { title: 'stranger', from: 0 },
  { title: 'friend', from: 10 },
  { title: 'best friend', from: 50 },
  { title: 'soulmate', from: 200 },
] as const

export type Level = { title: (typeof LEVELS)[number]['title']; hearts: number }

export function bondLevel(bond: number): Level {
  let hearts = 0
  for (let i = 0; i < LEVELS.length; i++) if (bond >= (LEVELS[i]?.from ?? Infinity)) hearts = i
  return { title: LEVELS[hearts]?.title ?? 'stranger', hearts: bond >= 200 ? 4 : hearts }
}

/** The new level's title when `after` crosses into it, else null. */
export function levelUp(before: number, after: number): string | null {
  const a = bondLevel(before).title
  const b = bondLevel(after).title
  return a === b ? null : b
}

const DAY = 24 * 60 * 60 * 1000

export function greeting(name: string, sessionsBefore: number, lastSeen: number, now: number): { line: string; isExcited: boolean } {
  if (sessionsBefore === 0) return { line: `hi! I'm ${name}!`, isExcited: true }
  const away = now - lastSeen
  if (away >= 3 * DAY) return { line: "you're BACK!!", isExcited: true }
  if (away < DAY) return { line: '*wags*', isExcited: false }
  return { line: 'hey, you!', isExcited: false }
}

export function toCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

export function toDisplay(v: unknown): Display | undefined {
  return v === 'band' || v === 'pane' || v === 'off' ? v : undefined
}
