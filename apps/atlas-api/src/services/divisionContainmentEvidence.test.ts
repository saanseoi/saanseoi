import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import { loadDivisionContainmentEvidence } from './divisionContainmentEvidence'

const step = (
  snapshotId: string,
  parentSnapshotId: string | null,
): SnapshotReplayStep => ({
  snapshotId,
  parentSnapshotId,
  shards: [{ bindingName: 'history', dataShardId: 'history' }],
})

test('request evidence follows sparse snapshot ancestry independently of unchanged source hashes', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE sourceResolutions (
    scopeId TEXT, snapshotId TEXT, sourceReleaseId TEXT, sourceRecordId TEXT,
    sourceVersionHash TEXT, resolutions TEXT)`)
  const shards = new Map([
    ['history', { bindingName: 'history', db: drizzle({ client: sqlite }) as never }],
  ])
  const write = (snapshot: string, ancestor: string | null) =>
    sqlite.query('INSERT INTO sourceResolutions VALUES (?, ?, ?, ?, ?, ?)').run(
      `snapshot:${snapshot}`,
      snapshot,
      `release-${snapshot}`,
      'child',
      'unchanged-content-hash',
      JSON.stringify(
        ancestor === null
          ? { entities: {}, decisions: [{ type: 'source_omission' }] }
          : {
              entities: { division: ['child'] },
              divisionContainment: {
                child: { parent: { division: 'sha256:child', ancestor } },
              },
            },
      ),
    )
  try {
    write('first', 'sha256:first')
    write('next', 'sha256:next')
    write('unrelated', 'sha256:unrelated')
    write('omitted', null)
    sqlite
      .query('INSERT INTO sourceResolutions VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        'snapshot:unproved',
        'unproved',
        'release-unproved',
        'child',
        'unchanged-content-hash',
        JSON.stringify({ entities: { division: ['child'] } }),
      )
    const first = [step('first', null)]
    const next = [...first, step('next', 'first')]
    expect(
      (await loadDivisionContainmentEvidence(first, shards)).get('child')?.parent
        ?.ancestor,
    ).toBe('sha256:first')
    expect(
      (await loadDivisionContainmentEvidence(next, shards)).get('child')?.parent
        ?.ancestor,
    ).toBe('sha256:next')
    expect(
      (
        await loadDivisionContainmentEvidence(
          [...next, step('unchanged', 'next')],
          shards,
        )
      ).get('child')?.parent?.ancestor,
    ).toBe('sha256:next')
    expect(
      (
        await loadDivisionContainmentEvidence(
          [...next, step('omitted', 'next')],
          shards,
        )
      ).size,
    ).toBe(0)
    expect(
      (
        await loadDivisionContainmentEvidence(
          [...next, step('unproved', 'next')],
          shards,
        )
      ).size,
    ).toBe(0)
  } finally {
    sqlite.close()
  }
})
