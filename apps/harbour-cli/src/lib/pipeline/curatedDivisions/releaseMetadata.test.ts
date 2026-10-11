import { resolve } from 'node:path'
import { expect, test } from 'bun:test'

import { readCuratedDivisionRelease } from './releaseMetadata.ts'

const repoRoot = resolve(import.meta.dir, '../../../../../..')

test('curated bootstrap selects the initial edition', async () => {
  await expect(readCuratedDivisionRelease(repoRoot, '2026-09-01.0')).resolves.toEqual({
    releaseVersion: '2026-09-01.0',
    publicationDate: '2026-09-01',
    sourceSchemaVersion: '1.0',
  })
})

test('curated assembly defaults to the latest jointly versioned edition', async () => {
  await expect(readCuratedDivisionRelease(repoRoot)).resolves.toMatchObject({
    releaseVersion: '2026-10-01.1',
  })
})
