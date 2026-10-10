import { expect, test } from 'claude-code/testing'

import { classifyCommand, contextLevel } from '../hooks/milestones'

test('test runners are recognised, alone or in a chain', async () => {
  const tests = [
    'npm test', 'pnpm test', 'yarn test', 'bun test', 'npm run test', 'pnpm run test -- --watch=false',
    'vitest run', 'pnpm exec vitest', 'npx jest src', 'pytest -q', 'python -m pytest', 'go test ./...',
    'cargo test', 'claude plugin test', 'cd app && npm test', 'CI=1 pnpm test', 'npm run build && npm test',
  ]
  for (const cmd of tests) expect([cmd, classifyCommand(cmd)]).toEqual([cmd, 'test'])
})

test('commits and pushes are recognised, dry runs are not', async () => {
  expect(classifyCommand('git commit -m "feat: x"')).toBe('commit')
  expect(classifyCommand('git add -A && git commit -qm "fix: test"')).toBe('commit')
  expect(classifyCommand('git push')).toBe('push')
  expect(classifyCommand('git push -u origin main')).toBe('push')
  expect(classifyCommand('git commit --dry-run')).toBe(null)
  expect(classifyCommand('git push --dry-run')).toBe(null)
})

test('the biggest milestone in a chain wins', async () => {
  expect(classifyCommand('pnpm test && git commit -m x && git push')).toBe('push')
  expect(classifyCommand('npm test && git commit -m x')).toBe('commit')
})

test('everything else is not a milestone', async () => {
  for (const cmd of ['ls', 'git status', 'echo npm test', 'cat test.txt', 'npm install', 'grep -r test src']) {
    expect([cmd, classifyCommand(cmd)]).toEqual([cmd, null])
  }
})

test('context levels', async () => {
  expect(contextLevel(undefined)).toBe('ok')
  expect(contextLevel(69.9)).toBe('ok')
  expect(contextLevel(70)).toBe('drowsy')
  expect(contextLevel(90)).toBe('full')
})
