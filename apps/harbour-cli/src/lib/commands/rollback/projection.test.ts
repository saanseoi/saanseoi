import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { restoreSnapshotProjection, type ProjectionResourceType } from './projection.ts'

const migrations = join(import.meta.dir, '../../../../../../libs/db/migrations')
const insert = (db: Database, table: string, row: Record<string, unknown>) => {
  db.query(
    `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object' ? JSON.stringify(value) : value,
    ) as never[]),
  )
}
function fixture(resourceType: ProjectionResourceType = 'division') {
  const init = (family: 'meta' | 'history' | 'current') => {
    const db = new Database(':memory:')
    db.exec(loadMigrationSql(migrations, [family]))
    return db
  }
  const meta = init('meta')
  const current = init('current')
  const first = init('history')
  const second = init('history')
  for (const [id, parent] of [
    ['a', null],
    ['b', 'a'],
  ] as const)
    insert(meta, 'snapshots', {
      id,
      code: id,
      resourceType,
      cohortKey: id,
      status: 'published',
      parentSnapshotId: parent,
    })
  for (const id of ['first', 'second'])
    insert(meta, 'dataShards', {
      id,
      shardType: 'history',
      regionCode: 'hk',
      year: id,
      environment: 'preview',
      databaseName: id,
      databaseId: id,
      bindingName: id,
      status: 'active',
      versionHash: id,
    })
  insert(meta, 'snapshotShardAssignments', { snapshotId: 'a', dataShardId: 'first' })
  insert(meta, 'snapshotShardAssignments', { snapshotId: 'b', dataShardId: 'second' })
  const input = {
    current,
    metaDb: createLocalHarbourDb(meta),
    historyTargets: [
      { bindingName: 'first', db: createLocalHarbourDb(first) },
      { bindingName: 'second', db: createLocalHarbourDb(second) },
    ],
    snapshotId: 'b',
    scopeId: 'scope',
    resourceType,
  }
  return {
    meta,
    current,
    first,
    second,
    input,
    close: () => {
      for (const db of [meta, current, first, second]) db.close()
    },
  }
}
function historyRow(
  db: Database,
  table: string,
  row: Record<string, unknown>,
  snapshotId = 'a',
) {
  insert(db, table, {
    ...(table === 'divisionsI18n' ? { isLocaleInferred: 0 } : {}),
    ...(table === 'address2dI18n' ? { formattedAddress: 'Building 5A-5C' } : {}),
    snapshotId,
    sourceReleaseId: `${snapshotId}-source`,
    isCurrent: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...row,
  })
}
function journal(
  db: Database,
  snapshotId: string,
  recordType: string,
  recordId: string,
  versionHash: string | null,
  locale = '',
) {
  insert(db, 'snapshotVersionChanges', {
    snapshotId,
    recordType,
    recordId,
    versionHash,
    locale,
    operation: versionHash ? 'upsert' : 'delete',
    sourceReleaseId: versionHash ? `${snapshotId}-source` : null,
  })
}
const division = { id: 'd', class: 'district', hierarchies: [], versionHash: 'base' }

test('restores independent inherited Division components across shards and preserves unrelated scopes', async () => {
  const f = fixture()
  try {
    historyRow(f.first, 'divisions', division)
    historyRow(f.first, 'divisionsI18n', {
      divisionId: 'd',
      locale: 'en',
      name: 'Old English',
      versionHash: 'en-a',
    })
    historyRow(f.first, 'divisionsI18n', {
      divisionId: 'd',
      locale: 'zh-hant',
      name: '中文',
      versionHash: 'zh-a',
    })
    journal(f.first, 'a', 'division', 'd', 'base')
    journal(f.first, 'a', 'divisionI18n', 'd', 'en-a', 'en')
    journal(f.first, 'a', 'divisionI18n', 'd', 'zh-a', 'zh-hant')
    historyRow(
      f.second,
      'divisionsI18n',
      { divisionId: 'd', locale: 'en', name: 'Revised English', versionHash: 'en-b' },
      'b',
    )
    journal(f.second, 'b', 'divisionI18n', 'd', 'en-b', 'en')
    insert(f.current, 'divisions', {
      snapshotId: 'scope',
      id: 'newer',
      class: 'district',
      hierarchies: [],
    })
    insert(f.current, 'divisions', {
      snapshotId: 'unrelated',
      id: 'safe',
      class: 'district',
      hierarchies: [],
    })
    f.current.exec('PRAGMA foreign_keys=ON')
    expect((await restoreSnapshotProjection(f.input)).counts).toEqual({
      divisions: 1,
      divisionsI18n: 2,
    })
    expect(
      f.current.query('SELECT snapshotId,id FROM divisions ORDER BY snapshotId').all(),
    ).toEqual([
      { snapshotId: 'scope', id: 'd' },
      { snapshotId: 'unrelated', id: 'safe' },
    ])
    expect(
      f.current.query('SELECT locale,name FROM divisionsI18n ORDER BY locale').all(),
    ).toEqual([
      { locale: 'en', name: 'Revised English' },
      { locale: 'zh-hant', name: '中文' },
    ])
    expect(f.first.query('SELECT isCurrent FROM divisions').get()).toEqual({
      isCurrent: 0,
    })
    expect(f.current.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    journal(f.second, 'b', 'division', 'd', null)
    expect((await restoreSnapshotProjection(f.input)).counts).toEqual({
      divisions: 0,
      divisionsI18n: 0,
    })
  } finally {
    f.close()
  }
})

test('missing exact history rolls the isolated candidate back and restores foreign keys', async () => {
  const f = fixture()
  try {
    journal(f.first, 'a', 'division', 'd', 'missing')
    insert(f.current, 'divisions', {
      snapshotId: 'scope',
      id: 'keep',
      class: 'district',
      hierarchies: [],
    })
    f.current.exec('PRAGMA foreign_keys=ON')
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'Missing exact history component',
    )
    expect(f.current.query('SELECT id FROM divisions').all()).toEqual([{ id: 'keep' }])
    expect(f.current.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  } finally {
    f.close()
  }
})

test('rejects incomplete shard assignments and competing journals before changing current', async () => {
  const f = fixture()
  try {
    f.meta.exec("DELETE FROM snapshotShardAssignments WHERE snapshotId='b'")
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'incomplete history shard assignments',
    )
    insert(f.meta, 'snapshotShardAssignments', {
      snapshotId: 'b',
      dataShardId: 'first',
    })
    insert(f.meta, 'snapshotShardAssignments', {
      snapshotId: 'b',
      dataShardId: 'second',
    })
    journal(f.first, 'b', 'division', 'd', 'one')
    journal(f.second, 'b', 'division', 'd', 'two')
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'conflicting history shard journals',
    )
    await expect(
      restoreSnapshotProjection({
        ...f.input,
        historyTargets: f.input.historyTargets.slice(0, 1),
      }),
    ).rejects.toThrow('unavailable history binding second')
  } finally {
    f.close()
  }
})

test('refuses to cascade a Division removal into another Address serving scope', async () => {
  const f = fixture()
  try {
    insert(f.current, 'divisions', {
      snapshotId: 'scope',
      id: 'used',
      class: 'district',
      hierarchies: [],
    })
    insert(f.current, 'address2d', {
      snapshotId: 'address',
      id: 'address',
      divisionSnapshotId: 'scope',
      districtId: 'used',
    })
    f.current.exec('PRAGMA foreign_keys=ON')
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'break retained dependencies',
    )
    expect(f.current.query('SELECT id FROM divisions').all()).toEqual([{ id: 'used' }])
    expect(f.current.query('SELECT id FROM address2d').all()).toEqual([
      { id: 'address' },
    ])
  } finally {
    f.close()
  }
})

test('restores Address2D/3D, localisations and derived number ranges using exact serving dependencies', async () => {
  const f = fixture('address')
  try {
    insert(f.meta, 'snapshotAssembly', {
      id: 'assembly',
      code: 'assembly',
      resourceType: 'address',
      version: 1,
      status: 'scoped',
      versionHash: 'assembly',
    })
    insert(f.meta, 'snapshotAssemblyRuns', {
      id: 'assembly-b',
      snapshotId: 'b',
      snapshotAssemblyId: 'assembly',
      status: 'selected',
      selectionSummaryJson: { lookupSnapshotIds: { division: 'division-old' } },
    })
    historyRow(f.first, 'address2d', {
      id: 'home',
      districtId: 'd',
      versionHash: 'address',
    })
    historyRow(f.first, 'address2dI18n', {
      addressId: 'home',
      locale: 'en',
      buildingNumberFrom: '5A',
      buildingNumberTo: '5C',
      buildingNumberConnector: '-',
      versionHash: 'en',
    })
    historyRow(
      f.second,
      'address3d',
      {
        id: 'flats',
        address2dId: 'home',
        units: [],
        unitCount: 0,
        contentHash: 'empty',
        unresolvedSectionIds: [],
        versionHash: 'units',
      },
      'b',
    )
    historyRow(
      f.second,
      'address3dI18n',
      { address3dId: 'flats', locale: 'en', units: {}, versionHash: 'unit-en' },
      'b',
    )
    journal(f.first, 'a', 'address2d', 'home', 'address')
    journal(f.first, 'a', 'address2dI18n', 'home', 'en', 'en')
    journal(f.second, 'b', 'address3d', 'flats', 'units')
    journal(f.second, 'b', 'address3dI18n', 'flats', 'unit-en', 'en')
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'exact division dependency division-old',
    )
    insert(f.current, 'divisionPublicationState', {
      scopeId: 'division-scope',
      snapshotId: 'division-old',
      status: 'current',
      preparedAt: 'ready',
      publicationToken: 'token',
    })
    insert(f.current, 'divisions', {
      snapshotId: 'division-scope',
      id: 'd',
      class: 'district',
      hierarchies: [],
    })
    const result = await restoreSnapshotProjection(f.input)
    expect(result.counts.address3dI18n).toBe(1)
    expect(f.current.query('SELECT divisionSnapshotId FROM address2d').get()).toEqual({
      divisionSnapshotId: 'division-scope',
    })
    expect(
      f.current
        .query(
          'SELECT buildingNumber,evidence FROM address2dBuildingNumberLookup ORDER BY buildingNumber',
        )
        .all(),
    ).toEqual([
      { buildingNumber: '5A', evidence: 'source_endpoint' },
      { buildingNumber: '5B', evidence: 'derived_member' },
      { buildingNumber: '5C', evidence: 'source_endpoint' },
    ])
    f.current.exec("UPDATE divisionPublicationState SET status='publishing'")
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'exact division dependency',
    )
  } finally {
    f.close()
  }
})

test('ALS rollback requires acknowledged exact canonical membership, including empty projections', async () => {
  const f = fixture('address')
  const cacheDir = mkdtempSync(join(tmpdir(), 'rollback-membership-'))
  try {
    insert(f.meta, 'datasets', {
      id: 'als',
      publisherId: 'publisher',
      code: 'ds-hk-hkgov-dpo-address',
      regionCode: 'hk',
      releaseType: 'snapshot',
      releaseFrequency: 'daily',
      theme: 'addresses',
      versionHash: 'als',
    })
    insert(f.meta, 'snapshotSources', {
      snapshotId: 'b',
      datasetId: 'als',
      resourceReleaseId: 'release',
      role: 'primary',
    })
    insert(f.meta, 'snapshotAssembly', {
      id: 'assembly',
      code: 'assembly',
      resourceType: 'address',
      version: 1,
      status: 'scoped',
      versionHash: 'assembly',
    })
    insert(f.meta, 'snapshotAssemblyRuns', {
      id: 'assembly-b',
      snapshotId: 'b',
      snapshotAssemblyId: 'assembly',
      status: 'selected',
      selectionSummaryJson: { lookupSnapshotIds: { division: 'division-old' } },
    })
    insert(f.current, 'divisionPublicationState', {
      scopeId: 'division-scope',
      snapshotId: 'division-old',
      status: 'current',
      preparedAt: 'ready',
      publicationToken: 'token',
    })
    await expect(restoreSnapshotProjection({ ...f.input, cacheDir })).rejects.toThrow(
      'acknowledged canonical membership sidecar',
    )
    const directory = join(cacheDir, 'address-membership', 'scope')
    mkdirSync(directory, { recursive: true })
    const member = {
      schemaVersion: 1,
      sourceVersion: 'source',
      addresses: [],
      collections: [],
      sources: [],
      aliases: [],
    }
    writeFileSync(join(directory, 'b.json'), JSON.stringify(member))
    expect(
      (await restoreSnapshotProjection({ ...f.input, cacheDir })).counts.address2d,
    ).toBe(0)
    writeFileSync(
      join(directory, 'b.json'),
      JSON.stringify({
        ...member,
        addresses: [
          { id: 'missing', parentId: null, level: 'building', sourceIds: [] },
        ],
      }),
    )
    await expect(restoreSnapshotProjection({ ...f.input, cacheDir })).rejects.toThrow(
      'reviewed canonical membership',
    )
  } finally {
    f.close()
    rmSync(cacheDir, { recursive: true, force: true })
  }
})

test('Street reconstruction respects active membership, coupled locales and latest changelog assertions', async () => {
  const f = fixture('street')
  try {
    for (const [id, status] of [
      ['active', 'active'],
      ['deleted', 'deleted'],
    ] as const) {
      historyRow(f.first, 'streets', { id, status, version: 1, versionHash: id })
      historyRow(f.first, 'streetsI18n', {
        streetId: id,
        locale: 'en',
        name: id,
        versionHash: id,
      })
      journal(f.first, 'a', 'street', id, id)
      journal(f.first, 'a', 'streetI18n', id, id, 'en')
    }
    historyRow(f.first, 'streetsI18n', {
      streetId: 'active',
      locale: 'zh-hant',
      name: 'stale',
      versionHash: 'previous-base',
    })
    journal(f.first, 'a', 'streetI18n', 'active', 'previous-base', 'zh-hant')
    for (const [db, snapshotId, hash] of [
      [f.first, 'a', 'event-a'],
      [f.second, 'b', 'event-b'],
    ] as const) {
      historyRow(
        db,
        'streetChangelog',
        {
          streetId: 'active',
          recordKey: 'event',
          kind: 'name-change',
          isPartialNameChange: 0,
          versionHash: hash,
        },
        snapshotId,
      )
      journal(db, snapshotId, 'streetChangelog', hash, hash)
    }
    expect((await restoreSnapshotProjection(f.input)).counts).toEqual({
      streets: 1,
      streetsI18n: 1,
      streetChangelog: 1,
    })
    expect(
      f.current.query('SELECT sourceReleaseId FROM streetChangelog').get(),
    ).toEqual({ sourceReleaseId: 'b-source' })
    insert(f.current, 'streetGeometry', {
      snapshotId: 'scope',
      streetId: 'active',
      sourceReleaseId: 'source',
      geometry: {},
      bbox: [],
    })
    await expect(restoreSnapshotProjection(f.input)).rejects.toThrow(
      'unjournalled streetGeometry',
    )
  } finally {
    f.close()
  }
})

for (const [resourceType, table, relation] of [
  ['divisionArea', 'divisionAreas', { divisionId: 'd' }],
  [
    'divisionBoundary',
    'divisionBoundaries',
    { leftDivisionId: 'd', rightDivisionId: 'e' },
  ],
] as const)
  test(`restores ${resourceType} geometry from immutable history`, async () => {
    const f = fixture(resourceType)
    try {
      historyRow(f.first, table, {
        id: 'geometry',
        type: 'land',
        geometry: { type: 'Point', coordinates: [114, 22] },
        versionHash: 'shape',
        ...relation,
      })
      journal(f.first, 'a', resourceType, 'geometry', 'shape')
      expect((await restoreSnapshotProjection(f.input)).counts[table]).toBe(1)
      expect(f.current.query(`SELECT snapshotId,id FROM ${table}`).get()).toEqual({
        snapshotId: 'scope',
        id: 'geometry',
      })
    } finally {
      f.close()
    }
  })
