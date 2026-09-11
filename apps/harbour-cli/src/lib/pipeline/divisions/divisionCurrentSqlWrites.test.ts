import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import type { DatasetProcessingMessage } from '@repo/core'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { buildDivisionCurrentSqlFile } from './processLocalDivisionSqlUploadRows'
import type {
  DivisionPreparedRecord,
  DivisionSqlState,
} from './processLocalDivisionSqlUploadTypes'

test('Division SQL delivers only changed current records and localisations across logical releases', async () => {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  db.exec('PRAGMA foreign_keys=ON')
  const message = {
    source: 'overture',
    regionCode: 'hk',
    resourceType: 'division',
    sourceVersion: '2026-01-01.0',
    releaseId: 'release',
    datasetId: 'dataset',
  } as DatasetProcessingMessage
  const record = (id: string): DivisionPreparedRecord => ({
    id,
    currentChanged: true,
    baseChanged: true,
    currentExists: false,
    base: {
      id,
      divisionCode: null,
      class: 'district',
      level: 2,
      category: 'administrative',
      hierarchies: { full: [], administrative: [], locality: [] },
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
    },
    canonicalI18n: [
      {
        divisionId: id,
        locale: 'en',
        name: id,
        nameVariant: null,
        nameAlts: null,
        nameRules: null,
        nameProvenance: 'provided',
        isLocaleInferred: false,
      },
    ],
    i18nVersionHash: id,
    versionHash: id,
    sourcePayloadHash: id,
    raw: {},
    sourceChanged: false,
  })
  const rows = [record('a'), record('b')]
  const baseline = new Map(
    rows.map(row => [row.id, { localisedRows: row.canonicalI18n }]),
  )
  const total = () =>
    (db.query('SELECT total_changes() AS count').get() as { count: number }).count
  const run = async (
    snapshotId: string,
    records: DivisionPreparedRecord[],
    currentRows = new Map(),
  ) => {
    const state = {
      snapshotId,
      records,
      currentRows,
      seenIds: new Set(records.map(row => row.id)),
    } as DivisionSqlState
    const file = await buildDivisionCurrentSqlFile(
      message,
      state,
      async () => {},
      'lineage',
    )
    const before = total()
    if (file.sql.trim()) db.exec(file.sql)
    return total() - before
  }
  try {
    expect(await run('first', rows)).toBe(4)
    expect(
      await run(
        'reissued',
        rows.map(row => ({ ...row, currentChanged: false, baseChanged: false })),
        baseline,
      ),
    ).toBe(0)
    expect(
      await run(
        'changed',
        [
          { ...rows[0]!, base: { ...rows[0]!.base, divisionCode: 'revised' } },
          { ...rows[1]!, currentChanged: false, baseChanged: false },
        ],
        baseline,
      ),
    ).toBe(1)
    expect(db.query('SELECT divisionCode FROM divisions WHERE id=?').get('a')).toEqual({
      divisionCode: 'revised',
    })
    expect(
      await run(
        'removed',
        [{ ...rows[0]!, currentChanged: false, baseChanged: false }],
        baseline,
      ),
    ).toBe(2)
    expect(db.query('SELECT snapshotId,id FROM divisions').all()).toEqual([
      { snapshotId: 'lineage', id: 'a' },
    ])
  } finally {
    db.close()
  }
})
