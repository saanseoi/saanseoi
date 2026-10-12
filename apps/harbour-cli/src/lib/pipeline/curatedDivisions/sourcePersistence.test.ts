import { camelCaseJson } from '@repo/core/jsonKeys'
import { divisionHierarchyContent } from '@repo/core/pipeline/services/divisions/divisionContainmentEvidence'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import type { DatasetProcessingMessage } from '@repo/core'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { getCurrentSourceDivisionMap } from '@repo/core/pipeline/db/source'
import { createHash } from '@repo/core/pipeline/utils'
import {
  nativeSourcePayloadHashInput,
  saanseoiSourcePayload,
} from '@repo/core/pipeline/services/sources/sourcePayload'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import {
  buildDivisionSourceSqlFile,
  buildDivisionHistorySqlFile,
} from '../divisions/processLocalDivisionSqlUploadRows'
import type { DivisionSqlState } from '../divisions/processLocalDivisionSqlUploadTypes'
import { writeGeometryRows } from '../divisions/processLocalDivisionGeometrySqlUploadRows'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'

const migrations = join(import.meta.dir, '../../../../../../libs/db/migrations')
function database(family: 'source' | 'history' | 'current') {
  const db = new Database(':memory:')
  db.exec(loadMigrationSql(migrations, [family]))
  return db
}

test('curated division SOURCE preserves names and source fields through replay, change and removal', async () => {
  const db = database('source')
  db.exec(loadMigrationSql(migrations, ['history']))
  const sourceDb = drizzle({ client: db, schema: sourceSchema })
  const original = {
    id: 'division',
    class: 'island_group',
    names: { en: { name: 'Original' }, 'zh-hant': { name: '群島' } },
    hierarchies: {
      full: [
        [
          {
            id: 'parent',
            name: 'Parent',
            class: 'district',
            full_containment: true,
            containment_geometry: {
              division: 'sha256:child',
              ancestor: 'sha256:september',
            },
          },
        ],
      ],
    },
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: {
      hkgovLandsd: [{ dataset: 'ds-hk-hkgov-landsd-division', recordId: '3180' }],
    },
  }
  const run = async (version: string, records: (typeof original)[]) => {
    const currentSourceRows = await getCurrentSourceDivisionMap(
      sourceDb as never,
      'saanseoi',
    )
    const prepared = await Promise.all(
      records.map(async record => {
        const raw = {
          id: record.id,
          source: 'saanseoi',
          record: JSON.stringify(record),
        }
        const sourcePayloadHash = await createHash(
          nativeSourcePayloadHashInput(saanseoiSourcePayload(raw)),
        )
        return {
          id: record.id,
          raw,
          sourcePayloadHash,
          sourceChanged:
            currentSourceRows.get(record.id)?.sourcePayloadHash !== sourcePayloadHash,
          currentChanged: false,
        }
      }),
    )
    const message = {
      source: 'saanseoi',
      regionCode: 'hk',
      resourceType: 'division',
      datasetId: 'ds',
      resourceReleaseId: `release-${version}`,
      sourceVersion: version,
    } as DatasetProcessingMessage
    const state = {
      snapshotId: `snapshot-${version}`,
      currentRows: new Map(),
      currentSourceRows,
      seenIds: new Set(records.map(r => r.id)),
      records: prepared,
    } as unknown as DivisionSqlState
    const sourceSql = (await buildDivisionSourceSqlFile(message, state, async () => {}))
      .sql
    if (sourceSql.trim()) db.exec(sourceSql)
    const historySql = (
      await buildDivisionHistorySqlFile(message, state, async () => {})
    ).sql
    if (historySql.trim()) db.exec(historySql)
  }
  try {
    await run('2026-09-01.0', [original])
    const retained = db.query('SELECT * FROM ssDivision').get() as any
    const { id, geometry, ...properties } = original
    expect(JSON.parse(retained.properties)).toEqual(
      camelCaseJson({
        ...properties,
        hierarchies: divisionHierarchyContent(properties.hierarchies),
        sources: [
          {
            dataset: 'ds-hk-hkgov-landsd-division',
            publisherCode: 'hkgovLandsd',
            recordId: '3180',
          },
        ],
      }),
    )
    expect(JSON.parse(retained.sourceGeometry)).toEqual(geometry)
    expect(retained.resourceReleaseId).toBe('release-2026-09-01.0')
    await run('2026-09-01.0', [original])
    const october = structuredClone(original)
    october.hierarchies.full[0]![0]!.containment_geometry.ancestor = 'sha256:october'
    await run('2026-10-01.0', [october])
    expect(db.query('SELECT * FROM ssDivision').all()).toHaveLength(1)
    expect(db.query('SELECT * FROM ssDivision').get()).toEqual(retained)
    const proof = db
      .query(
        "SELECT resolutions, sourceVersionHash FROM sourceResolutions WHERE snapshotId='snapshot-2026-10-01.0'",
      )
      .get() as any
    expect(proof.sourceVersionHash).toBe(retained.versionHash)
    expect(
      JSON.parse(proof.resolutions).divisionContainment.division.parent.ancestor,
    ).toBe('sha256:october')
    await run('2026-11-01.0', [
      { ...original, names: { ...original.names, en: { name: 'Changed' } } },
    ])
    expect(
      db.query('SELECT validToRelease FROM ssDivision WHERE isCurrent=0').get(),
    ).toEqual({ validToRelease: '2026-11-01.0' })
    expect(db.query('SELECT * FROM ssDivision WHERE isCurrent=1').all()).toHaveLength(1)
    await run('2026-12-01.0', [])
    expect(db.query('SELECT * FROM ssDivision WHERE isCurrent=1').all()).toHaveLength(0)
    expect(db.query('SELECT * FROM overtureDivisions').all()).toHaveLength(0)
    expect(db.query('SELECT * FROM sourceResolutions').all()).toHaveLength(3)
  } finally {
    db.close()
  }
})

test('curated areas write their own SOURCE before the publication receipt completes', async () => {
  const source = database('source'),
    history = database('history'),
    current = database('current')
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    historyDb: drizzle({ client: history, schema: historySchema }),
    sourceDb: drizzle({ client: source, schema: sourceSchema }),
  } as unknown as LocalAddressDbContext
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [115, 22],
        [115, 23],
        [114, 22],
      ],
    ],
  }
  const properties = {
    divisionId: 'division',
    isLand: true,
    isTerritorial: false,
    type: 'land',
    sources: { saanseoi: [{ record_id: 'drawn-area' }] },
  }
  const row = normaliseDivisionAreaGeometryRow(
    {
      id: 'area',
      division_id: 'division',
      class: 'land',
      geometry,
      source_properties: properties,
      source_geometry: geometry,
    },
    'saanseoi',
  )!
  const version = {
    source: 'saanseoi' as const,
    variant: 'saanseoi',
    resourceReleaseId: 'area-release',
    releaseCode: 'area-release',
    sourceVersion: '2026-09-01.0',
    snapshotId: 'snapshot',
    snapshotLineageId: 'area-lineage',
    parentSnapshotId: null,
    cohortKey: '2026-09-01.0',
  }
  try {
    source.exec(
      "CREATE TRIGGER reject_source BEFORE INSERT ON ssDivisionArea BEGIN SELECT RAISE(ABORT,'source write failed'); END;",
    )
    await expect(
      writeGeometryRows(context, 'divisionArea', [row], version),
    ).rejects.toThrow('source write failed')
    expect(
      current
        .query(
          'SELECT * FROM divisionAreaPublicationState WHERE preparedAt IS NOT NULL',
        )
        .all(),
    ).toHaveLength(0)
    source.exec('DROP TRIGGER reject_source')
    await writeGeometryRows(context, 'divisionArea', [row], version)
    const retained = source.query('SELECT * FROM ssDivisionArea').get() as any
    expect(retained.sourceRecordId).toBe('area')
    expect(JSON.parse(retained.properties)).toEqual(camelCaseJson(properties))
    expect(JSON.parse(retained.sourceGeometry)).toEqual(geometry)
    expect(source.query('SELECT * FROM overtureDivisionAreas').all()).toHaveLength(0)
    expect(history.query('SELECT sourceRecordId FROM sourceResolutions').all()).toEqual(
      [{ sourceRecordId: 'area' }],
    )
    expect(
      current
        .query(
          'SELECT * FROM divisionAreaPublicationState WHERE preparedAt IS NOT NULL',
        )
        .all(),
    ).toHaveLength(1)
    await writeGeometryRows(context, 'divisionArea', [row], {
      ...version,
      skipCanonicalMaterialisation: true,
    })
    expect(source.query('SELECT * FROM ssDivisionArea').all()).toEqual([retained])
    const changed = {
      ...row,
      source: { ...row.source, properties: { ...properties, extra: 'curated' } },
    }
    await writeGeometryRows(context, 'divisionArea', [changed], {
      ...version,
      sourceVersion: '2026-10-01.0',
      cohortKey: '2026-10-01.0',
      resourceReleaseId: 'next',
      snapshotId: 'next',
    })
    expect(
      source.query('SELECT validToRelease FROM ssDivisionArea WHERE isCurrent=0').get(),
    ).toEqual({ validToRelease: '2026-10-01.0' })
    expect(
      source.query('SELECT * FROM ssDivisionArea WHERE isCurrent=1').all(),
    ).toHaveLength(1)
    await writeGeometryRows(context, 'divisionArea', [], {
      ...version,
      sourceVersion: '2026-11-01.0',
      cohortKey: '2026-11-01.0',
      resourceReleaseId: 'removed',
      snapshotId: 'removed',
    })
    expect(
      source.query('SELECT * FROM ssDivisionArea WHERE isCurrent=1').all(),
    ).toHaveLength(0)
  } finally {
    source.close()
    history.close()
    current.close()
  }
})

test('source rollover closes SaanSeoi versions in older shards without touching Overture', async () => {
  const { buildExtraSourceSqlOperations } = await import(
    '../divisions/processLocalDivisionSqlUploadImport'
  )
  const db = database('source')
  try {
    for (const table of ['ssDivision', 'overtureDivisions'])
      db.exec(
        `INSERT INTO ${table}(sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent) VALUES('same-id','old','old-release','2025-01-01.0',1)`,
      )
    const operations = buildExtraSourceSqlOperations(
      { source: 'saanseoi', sourceVersion: '2026-09-01.0' } as DatasetProcessingMessage,
      {
        records: [{ id: 'same-id', sourceChanged: true }],
        currentSourceRows: new Map([['same-id', { ownerShardKeys: ['older-source'] }]]),
      } as unknown as DivisionSqlState,
      { sourceByOwnerKey: new Map([['older-source', {}]]) } as never,
    )
    for (const operation of operations) db.exec(operation.sql)
    expect(db.query('SELECT isCurrent,validToRelease FROM ssDivision').get()).toEqual({
      isCurrent: 0,
      validToRelease: '2026-09-01.0',
    })
    expect(db.query('SELECT isCurrent FROM overtureDivisions').get()).toEqual({
      isCurrent: 1,
    })
  } finally {
    db.close()
  }
})
