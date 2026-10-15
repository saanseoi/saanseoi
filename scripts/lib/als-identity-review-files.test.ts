import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readIdentityReview,
  verifyIdentityReviewFiles,
} from './als-identity-review-files'

test('binds source-version paths and exact prepared artefacts to the sealed review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'als-identity-review-'))
  try {
    const directory = join(root, '.local/hkgov-dpo/prepared')
    await mkdir(directory, { recursive: true })
    const path = join(directory, 'hkgov-hk-2024-07-31.0-address.parquet')
    const digest = (value: string) => createHash('sha256').update(value).digest('hex')
    await writeFile(path, 'prepared')
    await writeFile(`${path}.address3d.jsonl`, 'inventory')
    const report = {
      schemaVersion: 1,
      sourceVersion: '2024-07-31.0',
      preparedSha256: digest('prepared'),
      address3dSha256: digest('inventory'),
      issues: [],
    }
    await writeFile(`${path}.review.json`, JSON.stringify(report))
    const input = await readIdentityReview(root, '2024-07-31.0')
    await verifyIdentityReviewFiles(input)
    await writeFile(path, 'altered')
    await expect(verifyIdentityReviewFiles(input)).rejects.toThrow('changed')
    await expect(readIdentityReview(root, '../secret')).rejects.toThrow('exact ALS')
    await writeFile(
      `${path}.review.json`,
      JSON.stringify({ ...report, sourceVersion: '2024-08-21.0' }),
    )
    await expect(readIdentityReview(root, '2024-07-31.0')).rejects.toThrow(
      'does not match',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
