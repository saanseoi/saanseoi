import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'

import type { DatasetProcessingMessage } from '../../../types'
import { metaSchema } from '@repo/db'
import { loadMigrationSql } from '../../../testing/metaFixtures'

import {
  buildAddressHistoryApplySqlImportFile,
  buildAddressCurrentSqlImportFile,
  buildAddressHistorySqlImportFile,
  buildAddressResolvedSqlImportFiles,
  buildAddressSourceSqlImportFiles,
  buildAddressSqlCleanupFile,
} from './sqlImport'
import {
  writeAddressReleaseMetaSqlFile,
  resolveAddressDivisionCohortKey,
} from './sqlStages'
import { splitSqlStatements } from './sqlImportStages'
import { normaliseAddressRowForPipeline } from './normalisation'
import type { ResolvedAddressChunkArtefact } from './types'
import type { NormalisedAddressChunkArtefact } from './types'

const message = {
  cohortKey: '2025-09',
  datasetCode: 'ds-hk-hkgov-dpo-address',
  datasetId: 'dataset-address',
  rawObjectKey: 'hk/hkgov-dpo/2025-09/address.parquet',
  regionCode: 'hk',
  releaseCode: 'dr-hk-hkgov-dpo-address-2025-09.0',
  releaseId: 'release-address',
  shardYear: '2025',
  source: 'hkgov-dpo',
  sourceVersion: '2025-09.0',
  theme: 'addresses',
  resourceType: 'address',
} satisfies DatasetProcessingMessage

const resolvedArtefact = {
  addedRows: 0,
  changedRows: 0,
  insertedVersions: 0,
  kind: 'address.resolved.v1',
  localisedRows: 0,
  processingRunStartedAt: '2026-07-03T00:00:00.000Z',
  releaseId: 'release-address',
  rowEnd: 0,
  rowStart: 0,
  rows: [],
  totalRows: 0,
  unchangedRows: 0,
} satisfies ResolvedAddressChunkArtefact

test('empty Address SQL metadata delivery retains lineage and exact Division lookup', async () => {
  const source = new Database(':memory:')
  const delivered = new Database(':memory:')
  try {
    const migrationSql = loadMigrationSql(
      resolve(import.meta.dir, '../../../../../db/migrations'),
      ['meta'],
    )
    source.exec(migrationSql)
    delivered.exec(migrationSql)
    source.exec('PRAGMA foreign_keys = OFF;')
    delivered.exec('PRAGMA foreign_keys = OFF;')
    source.exec(`
      INSERT INTO snapshotLineages (
        id, code, regionCode, resourceType, variant, identityMode,
        primaryDatasetId, versionHash, createdAt, updatedAt
      ) VALUES (
        'address-lineage', 'sl-ds-hk-hkgov-dpo-address', 'hk', 'address', 'default',
        'persistent', 'dataset-address', 'lineage-hash', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z'
      );
      INSERT INTO snapshots (
        id, snapshotLineageId, parentSnapshotId, resourceType, code, cohortKey,
        geometryStatus, revision, status, publishedAt, validFrom, validTo, notes, createdAt, updatedAt
      ) VALUES (
        'address-snapshot', 'address-lineage', NULL, 'address', 'ss-hk-address-2026-08-19.0', '2026-08-19.0',
        'authoritative', 0, 'draft', NULL, NULL, NULL, NULL, '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z'
      );
      INSERT INTO snapshotSources (
        snapshotId, datasetId, resourceReleaseId, role, selectedByRule, selectionMode,
        anchorReleaseId, sourceCohortKey, createdAt
      ) VALUES (
        'address-snapshot', 'dataset-address', 'release-address', 'primary', 'snapshot-assembly-address-v1',
        'exact_ref', 'release-address', '2026-08-19.0', '2026-09-07T00:00:00.000Z'
      );
      INSERT INTO snapshotAssembly (
        id, code, resourceType, version, status, notes, versionHash, createdAt, updatedAt
      ) VALUES (
        'address-assembly', 'snapshot-assembly-address-v1', 'address', 1, 'active', NULL,
        'assembly-hash', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z'
      );
      INSERT INTO snapshotAssemblyRuns (
        id, snapshotId, snapshotAssemblyId, anchorReleaseId, anchorCohortKey, status,
        selectionSummaryJson, createdAt, updatedAt
      ) VALUES (
        'address-assembly-run', 'address-snapshot', 'address-assembly', 'release-address',
        '2026-08-19.0', 'selected', '{}', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z'
      );
      INSERT INTO releaseShardAssignments (releaseId, dataShardId)
      VALUES ('release-address', 'history-shard');
      INSERT INTO snapshotShardAssignments (snapshotId, dataShardId)
      VALUES ('address-snapshot', 'history-shard');
      INSERT INTO snapshots(id,code,resourceType,cohortKey,status)
      VALUES ('division-snapshot','division-snapshot','division','2025','published');
      INSERT INTO snapshotSources(snapshotId,datasetId,resourceReleaseId,role,selectedByRule,selectionMode)
      VALUES ('division-snapshot','dataset-division','release-division','primary','division-test','exact_ref');
    `)
    expect(
      source
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snapshots'",
        )
        .get(),
    ).toEqual({ name: 'snapshots' })
    expect(
      source.query('SELECT id FROM snapshots WHERE id = ?').get('address-snapshot'),
    ).toEqual({
      id: 'address-snapshot',
    })

    let metadataSql = ''
    const result = await writeAddressReleaseMetaSqlFile(
      drizzle({ client: source, schema: metaSchema }) as never,
      {
        async put(_key: string, value: string) {
          metadataSql = value
        },
      } as never,
      {
        ...message,
        totalRows: 0,
        addressDivisionSnapshotId: 'division-snapshot',
      } as typeof message,
    )
    expect(result.addressSqlArtefactKeys).toHaveLength(1)
    delivered.exec(metadataSql)
    expect(
      delivered
        .query(
          "SELECT json_extract(selectionSummaryJson,'$.lookupSnapshotIds.division') AS division FROM snapshotAssemblyRuns WHERE snapshotId='address-snapshot'",
        )
        .get(),
    ).toEqual({ division: 'division-snapshot' })
    expect(
      delivered
        .query(
          "SELECT resourceReleaseId FROM snapshotSources WHERE snapshotId='address-snapshot' AND role='lookup'",
        )
        .get(),
    ).toEqual({ resourceReleaseId: 'release-division' })

    expect(
      delivered
        .query(
          'SELECT snapshotLineageId, parentSnapshotId, revision FROM snapshots WHERE id = ?',
        )
        .get('address-snapshot'),
    ).toEqual({
      snapshotLineageId: 'address-lineage',
      parentSnapshotId: null,
      revision: 0,
    })
    expect(
      delivered
        .query('SELECT variant FROM snapshotLineages WHERE id = ?')
        .get('address-lineage'),
    ).toEqual({ variant: 'default' })
    expect(
      delivered
        .query('SELECT dataShardId FROM snapshotShardAssignments WHERE snapshotId = ?')
        .get('address-snapshot'),
    ).toEqual({ dataShardId: 'history-shard' })
  } finally {
    source.close()
    delivered.close()
  }
})

describe('address SQL import staging cleanup', () => {
  test('current rows store Division scopes while resolved artefacts and history retain logical revisions', () => {
    const db = new Database(':memory:')
    try {
      db.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
          'current',
        ]),
      )
      const normalised = normaliseAddressRowForPipeline({
        id: 'address',
        divisionSnapshotId: 'division-revision',
        enFormattedAddress: 'Example',
      })
      const artefact: ResolvedAddressChunkArtefact = {
        ...resolvedArtefact,
        rowEnd: 1,
        totalRows: 1,
        rows: [
          {
            addressId: 'address',
            sourceId: 'source',
            versionHash: 'hash',
            changed: true,
            changedExistingId: null,
            coverageComponents: [],
            i18n: [],
            base: {
              ...normalised.base,
              id: 'address',
              snapshotId: 'address-revision',
              createdAt: '2026-09-12',
              updatedAt: '2026-09-12',
            },
          },
        ],
      }
      db.exec(
        buildAddressCurrentSqlImportFile(message, artefact, {
          currentSnapshotId: 'address-scope',
          currentDivisionSnapshotId: 'division-scope',
        }).sql,
      )
      expect(
        db.query('SELECT snapshotId,divisionSnapshotId FROM address2d').get(),
      ).toEqual({ snapshotId: 'address-scope', divisionSnapshotId: 'division-scope' })
      db.exec(buildAddressHistorySqlImportFile(message, artefact).sql)
      expect(
        db
          .query(
            'SELECT snapshotId,divisionSnapshotId FROM zzAddressImportResolvedRows',
          )
          .get(),
      ).toEqual({
        snapshotId: 'address-revision',
        divisionSnapshotId: 'division-revision',
      })
      expect(artefact.rows[0]?.base.divisionSnapshotId).toBe('division-revision')
    } finally {
      db.close()
    }
  })
  test('drops current resolved staging tables after current apply SQL', () => {
    const currentFile = buildAddressResolvedSqlImportFiles(
      message,
      resolvedArtefact,
    ).find(file => file.target === 'current')

    expect(currentFile?.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(currentFile?.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(currentFile?.sql.indexOf('DROP TABLE IF EXISTS')).toBeGreaterThan(
      currentFile?.sql.indexOf('UPDATE address2d') ?? -1,
    )
  })

  test('realigns the complete current snapshot after the final chunk', () => {
    const currentFile = buildAddressResolvedSqlImportFiles(message, resolvedArtefact, {
      currentDivisionSnapshotId: 'division-snapshot',
      currentSnapshotId: 'snapshot-address',
    }).find(file => file.target === 'current')

    const applyIndex = currentFile?.sql.indexOf('INSERT INTO address2d (') ?? -1
    const alignmentIndex = currentFile?.sql.lastIndexOf('UPDATE address2d\nSET') ?? -1

    expect(alignmentIndex).toBeGreaterThan(applyIndex)
    expect(currentFile?.sql).toContain("divisionSnapshotId = 'division-snapshot'")
    expect(currentFile?.sql).toContain(
      "WHERE snapshotId = 'snapshot-address'\n  AND divisionSnapshotId IS NOT 'division-snapshot';",
    )
  })

  test('writes a history-apply cleanup artefact even when there are no changes', () => {
    const historyApplyFile = buildAddressHistoryApplySqlImportFile(message, {
      hasChanges: false,
      snapshotId: 'snapshot-address',
    })

    expect(historyApplyFile.target).toBe('history-apply')
    expect(historyApplyFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(historyApplyFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(historyApplyFile.sql).not.toContain('INSERT INTO address2d')
  })

  test('drops resolved staging tables in cleanup artefacts', () => {
    const cleanupFile = buildAddressSqlCleanupFile(message, 'history')

    expect(cleanupFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedI18n;',
    )
    expect(cleanupFile.sql).toContain(
      'DROP TABLE IF EXISTS zzAddressImportResolvedRows;',
    )
    expect(cleanupFile.sql).not.toContain('DELETE FROM zzAddressImportResolvedRows')
  })
})

describe('HKGov ALS source SQL', () => {
  test('stores acquisition references independently of canonical provenance', () => {
    const db = new Database(':memory:')
    try {
      db.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
          'source',
        ]),
      )
      const evidence = [{ dataset: 'hkgov-dpo', sourceFile: 'addresses.geojson' }]
      const inputs = [null, [], {}, { hkgovAls: [] }, evidence, { hkgovAls: evidence }]
      const files = buildAddressSourceSqlImportFiles(message, {
        kind: 'address.normalised.v1',
        processingRunStartedAt: '2026-09-08T00:00:00.000Z',
        releaseId: 'release-address',
        rowStart: 0,
        rowEnd: inputs.length,
        totalRows: inputs.length,
        rows: inputs.map((sources, index) => ({
          base: { sources, granularity: 'building' },
          canonicalId: `address-${index}`,
          sourceId: `source-${index}`,
          sourcePayloadHash: `hash-${index}`,
          i18n: [],
          matchKey: null,
          raw: publisherEvidence(
            { publisherField: index },
            `source-${index}`,
            evidence,
          ),
          source: {},
        })) as unknown as NormalisedAddressChunkArtefact['rows'],
      })
      for (const file of files) db.exec(file.sql)
      expect(
        db
          .query(
            'SELECT sourceLocator FROM hkgovAlsAddresses2d ORDER BY sourceRecordId',
          )
          .all(),
      ).toEqual(
        inputs.map(() => ({
          sourceLocator: JSON.stringify({ sourceFile: 'addresses.geojson' }),
        })),
      )
    } finally {
      db.close()
    }
  })

  test('stores source payload and provenance without derived address projections', () => {
    const sourceFile = buildAddressSourceSqlImportFiles(message, {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 0,
      rowStart: 0,
      rows: [],
      totalRows: 0,
    })[0]

    expect(sourceFile?.sql).toContain('sourceLocator, properties')
    expect(sourceFile?.sql).not.toContain('addressEn')
    expect(sourceFile?.sql).not.toContain('addressZhHant')
    expect(sourceFile?.sql).not.toContain('hkgovAlsAddress2dI18n')
  })

  test('omits unchanged source records and their membership writes', () => {
    const sourceFile = buildAddressSourceSqlImportFiles(
      message,
      {
        kind: 'address.normalised.v1',
        processingRunStartedAt: '2026-07-18T00:00:00.000Z',
        releaseId: 'release-address',
        rowEnd: 2,
        rowStart: 0,
        rows: [
          {
            base: {},
            canonicalId: 'address-unchanged',
            i18n: [],
            matchKey: null,
            raw: publisherEvidence({ marker: 'unchanged-payload' }, 'source-unchanged'),
            sourceId: 'source-unchanged',
            sourcePayloadHash: 'unchanged-hash',
          },
          {
            base: {},
            canonicalId: 'address-changed',
            i18n: [],
            matchKey: null,
            raw: publisherEvidence({ marker: 'changed-payload' }, 'source-changed'),
            sourceId: 'source-changed',
            sourcePayloadHash: 'changed-hash',
          },
        ],
        totalRows: 2,
      } as unknown as NormalisedAddressChunkArtefact,
      {
        changedSourceRecordIds: new Set(['source-changed']),
      },
    )[0]

    expect(sourceFile?.sql).not.toContain('stagingAddresses2dReleaseRows')
    expect(sourceFile?.sql).not.toContain('source-unchanged')
    expect(sourceFile?.sql).toContain('source-changed')
    expect(sourceFile?.sql).not.toContain('unchanged-payload')
    expect(sourceFile?.sql).toContain('changed-payload')
    expect(sourceFile?.sql).not.toContain('SET releaseId =')
  })
})

describe('HKGov ALS identity alias SQL', () => {
  test('writes permanent ss-to-GERS aliases into meta', () => {
    const hkgovMessage = {
      ...message,
      datasetCode: 'ds-hk-hkgov-dpo-address',
      releaseCode: 'dr-hk-hkgov-dpo-address-2025-09-03.0',
      source: 'hkgov-dpo',
      sourceVersion: '2025-09-03.0',
    } satisfies DatasetProcessingMessage
    const artefact = {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 1,
      rowStart: 0,
      rows: [
        {
          base: {},
          canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
          i18n: [],
          matchKey: null,
          raw: {
            canonicalId: '04bb2336-9590-449b-b6dd-57e22a0462f1',
            identityAlias: 'ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
            identityMatchMethod: 'hkgov-als',
          },
          source: {},
          sourceId: 'ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa',
          sourcePayloadHash: 'hash',
        },
      ],
      totalRows: 1,
    } as unknown as NormalisedAddressChunkArtefact

    const metaFile = buildAddressSourceSqlImportFiles(hkgovMessage, artefact).find(
      file => file.target === 'meta',
    )

    expect(metaFile?.sql).toContain('INSERT OR IGNORE INTO entityAliases')
    expect(metaFile?.sql).toContain('ss-aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa')
    expect(metaFile?.sql).toContain('04bb2336-9590-449b-b6dd-57e22a0462f1')
  })
})

describe('address SQL string literals', () => {
  test('splits bilingual rows by UTF-8 bytes and retains every escaped value', () => {
    const name = "香港 O'Brien; 大廈".repeat(5)
    const normalised = normaliseAddressRowForPipeline({
      id: 'address',
      divisionSnapshotId: 'division',
      enFormattedAddress: name,
    })
    const rows = Array.from({ length: 128 }, (_, index) => ({
      addressId: `address-${index}`,
      sourceId: `source-${index}`,
      versionHash: 'version',
      changed: true,
      changedExistingId: null,
      coverageComponents: [],
      i18n: [],
      base: {
        ...normalised.base,
        id: `address-${index}`,
        snapshotId: 'snapshot',
        sources: { name },
        createdAt: '2026-09-07',
        updatedAt: '2026-09-07',
      },
    }))
    const file = buildAddressHistorySqlImportFile(
      message,
      {
        ...resolvedArtefact,
        rows,
        rowEnd: rows.length,
        totalRows: rows.length,
      },
      { maxStatementBytes: 2000 },
    )
    const inserts = splitSqlStatements(file.sql).filter(statement =>
      statement.startsWith('INSERT'),
    )
    expect(inserts.length).toBeGreaterThan(1)
    expect(inserts.every(statement => Buffer.byteLength(statement) <= 2000)).toBe(true)
    const db = new Database(':memory:')
    try {
      db.exec(file.sql)
      expect(
        db.query('SELECT COUNT(*) AS count FROM zzAddressImportResolvedRows').get(),
      ).toEqual({ count: 128 })
      expect(
        db
          .query(
            'SELECT sources FROM zzAddressImportResolvedRows WHERE rowNumber = 127',
          )
          .get(),
      ).toEqual({ sources: JSON.stringify({ name }) })
    } finally {
      db.close()
    }
  })

  test('rejects a single oversized row before producing an import file', () => {
    expect(() =>
      buildAddressSourceSqlImportFiles(message, {
        kind: 'address.normalised.v1',
        processingRunStartedAt: '2026-09-07',
        releaseId: message.releaseId,
        rowStart: 0,
        rowEnd: 1,
        totalRows: 1,
        rows: [
          {
            base: {},
            i18n: [],
            raw: publisherEvidence({ text: '香港'.repeat(20_000) }),
            sourceId: 'source',
            sourcePayloadHash: 'hash',
          },
        ],
      } as unknown as NormalisedAddressChunkArtefact),
    ).toThrow('statement byte limit')
  })

  test('represents NUL separators as SQLite expressions', () => {
    const artefact = {
      kind: 'address.normalised.v1',
      processingRunStartedAt: '2026-07-18T00:00:00.000Z',
      releaseId: 'release-address',
      rowEnd: 1,
      rowStart: 0,
      rows: [
        {
          base: {
            divisionSnapshotId: 'division-snapshot',
            streetSnapshotId: null,
            streetId: null,
            hamletId: null,
            microhoodId: null,
            villageId: null,
            neighbourhoodId: null,
            macrohoodId: null,
            townId: null,
            districtId: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d',
            areaId: null,
            countryId: null,
            geometry: null,
            identifiers: null,
            bbox: null,
            sources: null,
          },
          canonicalId: 'address-1',
          coverageComponents: [],
          i18n: [],
          matchKey: '8d17afe0-5631-49c5-b86d-d53c5d4b2f9d::GRAHAM STREET::46\0',
          raw: publisherEvidence({}, 'source-1'),
          sourceId: 'source-1',
          sourcePayloadHash: 'hash',
        },
      ],
      totalRows: 1,
    } as unknown as NormalisedAddressChunkArtefact

    const sourceFile = buildAddressSourceSqlImportFiles(message, artefact)[0]

    expect(sourceFile?.sql).not.toContain('\0')
    expect(sourceFile?.sql).toContain(
      "'8d17afe0-5631-49c5-b86d-d53c5d4b2f9d::GRAHAM STREET::46' || char(0) || ''",
    )
  })
})

describe('HKGov ALS division cohort selection', () => {
  test('does not treat the DPO release sequence as an Overture cohort', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-01-23.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-01-23.0',
        },
        ['2025-09-24.0'],
      ),
    ).toBe('2025-09-24.0')
  })

  test('uses the latest Overture cohort at or before an ALS release', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.0',
        },
        ['2025-09-24.0', '2025-12-17.0', '2026-02-18.0'],
      ),
    ).toBe('2025-12-17.0')
  })

  test('uses the first later Overture cohort even when it is in another year', () => {
    expect(
      resolveAddressDivisionCohortKey(
        {
          cohortKey: '2025-12-18.0',
          source: 'hkgov-dpo',
          sourceVersion: '2025-12-18.0',
        },
        ['2026-02-18.0', '2026-05-20.0'],
      ),
    ).toBe('2026-02-18.0')
  })
})

function publisherEvidence(
  properties: Record<string, unknown>,
  sourceRecordId = 'source',
  sources: unknown[] = [],
) {
  return {
    publisherSource: {
      sourceRecordId,
      versionHash: 'source-hash',
      properties,
      sourceGeometry: null,
      sources,
    },
  }
}
