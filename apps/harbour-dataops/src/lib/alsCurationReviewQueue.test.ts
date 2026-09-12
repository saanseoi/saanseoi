import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AlsCurationReviewError } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsReviewIssue'
import { queueAlsCurationReview } from './alsCurationReviewQueue'

test('review queue preserves exact evidence and deduplicates identical failures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-review-queue-'))
  try {
    const error = new AlsCurationReviewError({
      code: 'curation-guard-mismatch',
      status: 'unresolved',
      sourceVersion: '2026-04-25.0',
      curationFile: 'aliases.json',
      decisionId: 'block-1',
      message: 'point changed',
      decision: { owner: 'owner-csu' },
      assertion: { actual: '[114,22]', expected: '[114,23]', operator: 'strictEqual' },
      records: [{ role: 'owner', row: { sources: '{"original":true}' } }],
    })
    const path = await queueAlsCurationReview(error, directory)
    expect(await queueAlsCurationReview(error, directory)).toBe(path)
    expect(await readdir(directory)).toHaveLength(1)
    expect(await Bun.file(path).json()).toEqual({ schemaVersion: 1, ...error.issue })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
