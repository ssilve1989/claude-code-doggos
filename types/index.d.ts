export type Pose =
  | 'idle' | 'excited' | 'happy' | 'worried' | 'tilt' | 'sleep' | 'sniff' | 'dig' | 'walk' | 'leash' | 'yawn'
  | 'drowsy' | 'pant' | 'shake' | 'lie' | 'zoomies'

export type ContextLevel = 'ok' | 'drowsy' | 'full'

export type Display = 'band' | 'pane' | 'off'

export type Mood = {
  base: 'idle' | 'working' | 'asleep'
  /** What the dog is doing while Claude works (sniff, dig, walk, tilt). */
  action: Pose | null
  /** A short-lived pose that wins over everything else until `until`. */
  reaction: { pose: Pose; until: number } | null
  line: string
  lastActivityAt: number
  /** How full the context window is, which colours the idle pose. */
  context: ContextLevel
}

export type Stats = {
  name: string
  bond: number
  treats: number
  pets: number
  sessions: number
  fetched: number
  firstMet: number
  lastSeen: number
}

export type PupPhase = 'waiting' | 'arriving' | 'here' | 'done' | 'sad' | 'leaving'

/** One subagent's puppy. Positions are worked out from these times, so they never need saving. */
export type Pup = {
  id: string
  label: string
  phase: PupPhase
  /** When the current phase started. */
  since: number
  slot: number | null
  /** The slot it is sliding over from, while it scoots. */
  prevSlot: number | null
  slotSince: number
  /** The slot it is running off from, while it leaves. */
  fromSlot: number | null
}

/** An unbroken run of activity; `lastRemindedAt` starts at `startedAt`. */
export type Streak = { startedAt: number; lastActivityAt: number; lastRemindedAt: number }

declare module 'claude-code' {
  interface PluginState {
    doggo: {
      mood: Mood
      stats: Stats
      display: Display
      isCounted: boolean
      streak: Streak | null
      lastYawnAt: number
      pack: readonly Pup[]
    }
  }
}
