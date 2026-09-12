import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../testing/metaFixtures'
import type { DatasetProcessingMessage } from '../../../types'
import {
  buildAddressCurrentSqlImportFile,
  buildAddressHistoryApplySqlImportFile,
  buildAddressHistorySqlImportFile,
  buildAddressRetirementSqlImportFiles,
} from './sqlImport'
import type { ResolvedAddressChunkArtefact } from './types'

const message = {
  source: 'hkgov-dpo',
  sourceVersion: '2026-09-01.0',
  releaseId: 'release',
  datasetId: 'dataset',
  cohortKey: '2026-09-01.0',
  regionCode: 'hk',
  processingRunStartedAt: '2026-09-11T00:00:00.000Z',
} as DatasetProcessingMessage

function fixture(snapshotId: string, changed = true): ResolvedAddressChunkArtefact {
  const now =
    snapshotId === 'one' ? '2026-09-01T00:00:00.000Z' : message.processingRunStartedAt!
  return {
    kind: 'address.resolved.v1',
    addedRows: 0,
    changedRows: +changed,
    insertedVersions: +changed,
    localisedRows: 1,
    rowStart: 0,
    rowEnd: 1,
    totalRows: 1,
    processingRunStartedAt: now,
    releaseId: 'release',
    unchangedRows: +!changed,
    rows: [
      {
        addressId: 'a',
        sourceId: 'source-a',
        changed,
        changedExistingId: snapshotId === 'one' ? null : 'a',
        versionHash: snapshotId,
        coverageComponents: [],
        base: {
          id: 'a',
          snapshotId,
          divisionSnapshotId: 'division',
          granularity: 'building',
          createdAt: now,
          updatedAt: now,
        } as ResolvedAddressChunkArtefact['rows'][number]['base'],
        i18n: [
          {
            addressId: 'a',
            snapshotId,
            locale: 'en',
            formattedAddress: 'Harbour Road',
            buildingNumberFrom: '1',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
  }
}

function database(type: 'current' | 'history') {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [type]),
  )
  db.exec('PRAGMA foreign_keys = ON;')
  return db
}

test('current writes retain a stable key and leave unchanged content and components untouched', () => {
  const db = database('current')
  try {
    const apply = (artefact: ResolvedAddressChunkArtefact) =>
      db.exec(
        buildAddressCurrentSqlImportFile(message, artefact, {
          currentSnapshotId: 'lineage',
          currentDivisionSnapshotId: 'division',
        }).sql,
      )
    apply(fixture('one'))
    db.exec(`CREATE TABLE writeAudit (name TEXT);
      CREATE TRIGGER audit_base AFTER UPDATE ON address2d BEGIN INSERT INTO writeAudit VALUES ('base'); END;
      CREATE TRIGGER audit_i18n AFTER UPDATE ON address2dI18n BEGIN INSERT INTO writeAudit VALUES ('i18n'); END;
      CREATE TRIGGER audit_lookup AFTER UPDATE ON address2dBuildingNumberLookup BEGIN INSERT INTO writeAudit VALUES ('lookup'); END;
      CREATE TRIGGER audit_i18n_delete AFTER DELETE ON address2dI18n BEGIN INSERT INTO writeAudit VALUES ('i18n-delete'); END;`)
    apply(fixture('two', false))
    // A changed version can still have identical components; those stay open too.
    apply(fixture('three', true))
    expect(db.query('SELECT * FROM writeAudit').all()).toEqual([])
    expect(db.query('SELECT snapshotId, updatedAt FROM address2d').all()).toEqual([
      { snapshotId: 'lineage', updatedAt: '2026-09-01T00:00:00.000Z' },
    ])
    const changed = fixture('four')
    changed.rows[0]!.base.granularity = 'complex'
    apply(changed)
    expect(db.query('SELECT * FROM writeAudit').all()).toEqual([{ name: 'base' }])
  } finally {
    db.close()
  }
})

test('retirement closes versions, journals translations and deletes only the selected current scope', () => {
  const current = database('current')
  const history = database('history')
  try {
    const artefact = fixture('one')
    history.exec(buildAddressHistorySqlImportFile(message, artefact).sql)
    history.exec(
      buildAddressHistoryApplySqlImportFile(message, {
        hasChanges: true,
        snapshotId: 'one',
      }).sql,
    )
    for (const currentSnapshotId of ['lineage', 'other']) {
      current.exec(
        buildAddressCurrentSqlImportFile(message, artefact, { currentSnapshotId }).sql,
      )
    }
    const files = buildAddressRetirementSqlImportFiles(message, {
      addressIds: ['a'],
      snapshotId: 'two',
      scopeId: 'lineage',
    })
    for (const file of files)
      (file.target === 'current' ? current : history).exec(file.sql)
    expect(current.query('SELECT snapshotId FROM address2d').all()).toEqual([
      { snapshotId: 'other' },
    ])
    for (const table of [
      'address2d',
      'address2dI18n',
      'address2dBuildingNumberLookup',
    ]) {
      expect(
        history.query(`SELECT count(*) AS n FROM ${table} WHERE isCurrent = 1`).get(),
      ).toEqual({ n: 0 })
    }
    expect(
      history
        .query(
          "SELECT recordType, locale, operation FROM snapshotVersionChanges WHERE snapshotId = 'two' ORDER BY recordType",
        )
        .all(),
    ).toEqual([
      { recordType: 'address2d', locale: '', operation: 'delete' },
      { recordType: 'address2dI18n', locale: 'en', operation: 'delete' },
    ])
  } finally {
    current.close()
    history.close()
  }
})

test('a changed address journals translations omitted from its replacement', () => {
  const history = database('history')
  try {
    for (const snapshotId of ['one', 'two']) {
      const artefact = fixture(snapshotId)
      if (snapshotId === 'two') artefact.rows[0]!.i18n = []
      history.exec(buildAddressHistorySqlImportFile(message, artefact).sql)
      history.exec(
        buildAddressHistoryApplySqlImportFile(message, { hasChanges: true, snapshotId })
          .sql,
      )
    }
    expect(
      history
        .query(
          "SELECT operation FROM snapshotVersionChanges WHERE snapshotId = 'two' AND recordType = 'address2dI18n' AND locale = 'en'",
        )
        .get(),
    ).toEqual({ operation: 'delete' })
  } finally {
    history.close()
  }
})
