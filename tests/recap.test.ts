import { expect, test } from 'claude-code/testing'

import { RECAP_MIN_MS, cleanRecap, describeAction, recapPrompt, shouldRecap } from '../hooks/recap'

test('actions read as what the dog saw', async () => {
  expect(describeAction('Read', '/repo/src/app.ts', null)).toBe('sniffed app.ts')
  expect(describeAction('Edit', '/repo/src/auth.ts', null)).toBe('dug into auth.ts')
  expect(describeAction('Bash', 'pnpm test', 'passed')).toBe('fetched `pnpm test` (passed)')
  expect(describeAction('Bash', 'ls', null)).toBe('fetched `ls`')
  expect(describeAction('Agent', '', null)).toBe('called the pack')
  expect(describeAction('WebFetch', 'https://x.dev', 'failed')).toBe('used WebFetch (failed)')
})

test('the prompt carries the actions and a capped answer', async () => {
  const p = recapPrompt('Biscuit', ['sniffed app.ts', 'fetched `pnpm test` (passed)'], 'x'.repeat(5000))
  expect(p).toContain('- sniffed app.ts')
  expect(p).toContain('- fetched `pnpm test` (passed)')
  expect(p).toContain('x'.repeat(1500))
  expect(p).not.toContain('x'.repeat(1501))
  expect(recapPrompt('Biscuit', [], 'hi')).toContain('(nothing but thinking)')
})

test('recaps are cleaned to one short line', async () => {
  expect(cleanRecap('  "we found the bug!! good boy claude"  ')).toBe('we found the bug!! good boy claude')
  expect(cleanRecap('first line\nsecond line')).toBe('first line')
  expect(cleanRecap('a'.repeat(150))?.length).toBe(100)
  expect(cleanRecap('a'.repeat(150))?.endsWith('…')).toBe(true)
  expect(cleanRecap('   ')).toBe(null)
})

test('only long, finished, main-conversation turns get a recap', async () => {
  expect(shouldRecap({ durationMs: RECAP_MIN_MS, isAborted: false })).toBe(true)
  expect(shouldRecap({ durationMs: RECAP_MIN_MS - 1, isAborted: false })).toBe(false)
  expect(shouldRecap({ durationMs: RECAP_MIN_MS, isAborted: true })).toBe(false)
  expect(shouldRecap({ durationMs: RECAP_MIN_MS, isAborted: false, agentId: 'a' })).toBe(false)
})
