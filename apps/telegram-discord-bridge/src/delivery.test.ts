import { expect, test } from 'bun:test'

import { needsGitHubMirror } from './delivery.ts'

test('retries a GitHub mirror that has an unconfirmed previous attempt', () => {
  const delivery = {
    github_attempted_at: Date.now(),
    github_completed_at: null,
  }

  expect(needsGitHubMirror(delivery)).toBe(true)
})

test('does not retry a completed GitHub mirror', () => {
  expect(needsGitHubMirror({ github_completed_at: Date.now() })).toBe(false)
})
