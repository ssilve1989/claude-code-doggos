// What the dog says about a turn once it's over: the facts it saw, and the line it turns them into. No `$` here.

export const RECAP_MIN_MS = 30_000
const ANSWER_CHARS = 1500
const LINE_CHARS = 100
const MAX_ACTIONS = 20

export const RECAP_SYSTEM = [
  'You are a golden retriever watching your human and Claude (an AI coding assistant) work together.',
  'Given what happened in one turn, reply with ONE short excited line in dog voice: what got done, like a dog would tell it.',
  'Lowercase, under 15 words, at most one emoji, no quotes, no explanations.',
  'Example: we dug up the auth bug in session.ts!! claude is a good boy',
].join('\n')

export function describeAction(tool: string, target: string, outcome: 'passed' | 'failed' | null): string {
  const name = target.split('/').pop() || target
  const suffix = outcome ? ` (${outcome})` : ''
  switch (tool) {
    case 'Read':
    case 'Grep':
    case 'Glob':
      return `sniffed ${name}${suffix}`
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `dug into ${name}${suffix}`
    case 'Bash':
      return `fetched \`${target}\`${suffix}`
    case 'Agent':
    case 'Task':
      return `called the pack${suffix}`
    default:
      return `used ${tool}${suffix}`
  }
}

/** Appends an action, skipping a repeat of the last one, keeping the most recent few. */
export function logAction(log: readonly string[], action: string): string[] {
  if (log.at(-1) === action) return [...log]
  return [...log, action].slice(-MAX_ACTIONS)
}

export function recapPrompt(name: string, actions: readonly string[], answer: string): string {
  return [
    `You are ${name}. This turn:`,
    actions.length ? actions.map(a => `- ${a}`).join('\n') : '(nothing but thinking)',
    '',
    "Claude's answer began:",
    answer.slice(0, ANSWER_CHARS),
  ].join('\n')
}

/** One line, unquoted, short enough for the bubble; null when nothing usable came back. */
export function cleanRecap(text: string): string | null {
  const line = (text.trim().split('\n')[0] ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
  if (!line) return null
  return line.length > LINE_CHARS ? line.slice(0, LINE_CHARS - 1) + '…' : line
}

export function shouldRecap(turn: { durationMs: number; isAborted: boolean; agentId?: string }): boolean {
  return turn.agentId === undefined && !turn.isAborted && turn.durationMs >= RECAP_MIN_MS
}
