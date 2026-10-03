import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertPreparedAlsReview,
  writeAlsReviewCache,
  writeAlsReviewFailureCache,
} from './hkgovAlsReviewCache'
import { collectAlsReviewIssues, reportAlsReviewIssue } from './hkgovAlsReviewIssue'

test('ALS local review cache blocks unresolved cases and rejects edited or stale evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-review-cache-'))
  const path = join(directory, 'prepared.parquet')
  try {
    await writeFile(path, 'prepared')
    await writeFile(`${path}.address3d.jsonl`, 'inventory')
    await expect(
      assertPreparedAlsReview(path, '2026-10-01.0', undefined),
    ).rejects.toThrow('no sealed review cache')
    const pending = await writeAlsReviewCache(path, '2026-10-01.0', [
      { code: 'identity-drift', evidence: { id: 'pending' } },
    ])
    await expect(
      assertPreparedAlsReview(path, '2026-10-01.0', pending),
    ).rejects.toThrow('1 unresolved ALS issues')
    const ready = await writeAlsReviewCache(path, '2026-10-01.0', [])
    await assertPreparedAlsReview(path, '2026-10-01.0', ready)
    await writeAlsReviewFailureCache(path, '2026-10-01.0', [
      { code: 'curation-guard-mismatch' },
    ])
    await expect(assertPreparedAlsReview(path, '2026-10-01.0', ready)).rejects.toThrow(
      'changed after preparation',
    )
    await writeAlsReviewCache(path, '2026-10-01.0', [])
    await expect(assertPreparedAlsReview(path, '2026-09-01.0', ready)).rejects.toThrow(
      'does not match',
    )
    await writeFile(`${path}.review.json`, '{}')
    await expect(assertPreparedAlsReview(path, '2026-10-01.0', ready)).rejects.toThrow(
      'changed after preparation',
    )
    const unchanged = await writeAlsReviewCache(path, '2026-10-01.0', [])
    await writeFile(path, 'different')
    await expect(
      assertPreparedAlsReview(path, '2026-10-01.0', unchanged),
    ).rejects.toThrow('does not match')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('ALS preparation collects review issues across awaits without mixing concurrent releases', async () => {
  const runs = await Promise.all(
    ['one', 'two'].map(sourceVersion =>
      collectAlsReviewIssues(async issues => {
        await Promise.resolve()
        reportAlsReviewIssue(
          {
            code: 'curation-guard-mismatch',
            sourceVersion,
            curationFile: 'fixture.json',
            decisionId: sourceVersion,
            message: 'Source assertion differs.',
          },
          () => {},
        )
        return issues
      }),
    ),
  )
  expect(runs.map(issues => issues.map(issue => issue.sourceVersion))).toEqual([
    ['one'],
    ['two'],
  ])
})
