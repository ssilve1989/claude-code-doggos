// Spots the moments worth celebrating in Claude's shell commands, and how full the context is. No `$` here.
import type { ContextLevel } from '../types'

export type Milestone = 'test' | 'commit' | 'push'

const TESTS = [
  /^(npm|pnpm|yarn|bun)( run)? test\b/,
  /^((pnpm|yarn|bun) exec|npx|bunx|pnpm dlx) (vitest|jest)\b/,
  /^(vitest|jest|pytest)\b/,
  /^python3? -m pytest\b/,
  /^(go|cargo) test\b/,
  /^claude plugin test\b/,
]

const RANK: Record<Milestone, number> = { test: 1, commit: 2, push: 3 }

/** The biggest milestone in a (possibly chained) command, or null. */
export function classifyCommand(command: string): Milestone | null {
  let best: Milestone | null = null
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const found = classifyOne(part.trim().replace(/^(\w+=\S*\s+)+/, ''))
    if (found && (best === null || RANK[found] > RANK[best])) best = found
  }
  return best
}

function classifyOne(cmd: string): Milestone | null {
  if (/\s--dry-run\b/.test(cmd)) return null
  if (/^git commit\b/.test(cmd)) return 'commit'
  if (/^git push\b/.test(cmd)) return 'push'
  return TESTS.some(re => re.test(cmd)) ? 'test' : null
}

export function contextLevel(percent: number | undefined): ContextLevel {
  if (percent === undefined || percent < 70) return 'ok'
  return percent < 90 ? 'drowsy' : 'full'
}
