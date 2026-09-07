import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import {
  extractIdentityMappings,
  extractAreaIdentityMappings,
  identityBridgePage,
  listIdentityBridge,
  type IdentityBridgeQuery,
} from './identityBridge'

const query: IdentityBridgeQuery = {
  resourceType: 'division',
  region: 'hk',
  domain: 'planning',
  releaseSet: 'release-old',
  limit: 1,
}

test('regional codes target the area record division reference', () => {
  expect(extractAreaIdentityMappings('CENSTATD:area:HK', null, 'island')).toEqual([
    { namespace: 'hkgovCenstatd.code', identifier: 'HK', canonicalId: 'island' },
  ])
  expect(extractAreaIdentityMappings('CENSTATD:area:UNKNOWN', null, 'id')).toEqual([])
})

test('Planning extraction qualifies subunits and excludes inherited parent codes', () => {
  expect(
    extractIdentityMappings(
      {
        'PLAND:PPU': '3',
        'PLAND:SPU': '35',
        'PLAND:TPU': '351',
        'PLAND:SUBUNIT': '30',
      },
      'subunit',
    ),
  ).toEqual([
    { namespace: 'PLAND:SUBUNIT', identifier: '351-30', canonicalId: 'subunit' },
  ])
  expect(
    extractIdentityMappings(
      { hkgovPland: { ppu: '3', spu: '35', tpu: '351', subunit: '30' } },
      'subunit',
    ),
  ).toEqual([
    { namespace: 'PLAND:SUBUNIT', identifier: '351-30', canonicalId: 'subunit' },
  ])
  expect(
    extractIdentityMappings(
      { saanseoiCorrection: { code: 'x' }, curationId: 'review' },
      'id',
    ),
  ).toEqual([])
})

test('pagination deduplicates tuples while retaining ambiguous identifiers', () => {
  const rows = ['a', 'a', 'b'].map(canonicalId => ({
    namespace: 'hkgovCsuId',
    identifier: 'shared',
    canonicalId,
  }))
  const first = identityBridgePage(rows, query)
  expect(first.data.map(row => row.canonicalId)).toEqual(['a'])
  const second = identityBridgePage(rows, {
    ...query,
    cursor: requireDefined(first.nextCursor),
  })
  expect(second.data.map(row => row.canonicalId)).toEqual(['b'])
  expect(second.nextCursor).toBeNull()
  expect(identityBridgePage(rows, { ...query, identifier: 'missing' }).data).toEqual([])
})

test('maps Greater Bay Area requests to Hong Kong and returns no Macao mappings', async () => {
  const sqlite = new Database(':memory:')
  const db = createLocalHarbourDb(sqlite)
  const regions: string[] = []
  const dependencies = {
    resolveApiReleaseSetSnapshotsForRequest: async (
      _db: unknown,
      _resourceType: unknown,
      selectors: { regionCode: string },
    ) => {
      regions.push(selectors.regionCode)
      return {
        releaseSet: {
          code: 'release-old',
          apiCatalogRevision: 'catalogue',
          domainCode: 'planning',
        },
        snapshots: [],
      } as never
    },
    resolveSnapshotReplayPlan: async () => [] as never,
    resolveSnapshotVersionState: async () => new Map() as never,
  }

  try {
    expect(
      await listIdentityBridge(
        {
          metaDb: db as never,
          historyDbsByBinding: {} as never,
          query: { ...query, region: 'gba' },
        },
        dependencies,
      ),
    ).toBeNull()
    expect(
      await listIdentityBridge(
        {
          metaDb: db as never,
          historyDbsByBinding: {} as never,
          query: { ...query, region: 'mo' },
        },
        dependencies,
      ),
    ).toEqual({
      data: [],
      nextCursor: null,
      meta: {
        releaseSet: 'release-old',
        catalogRevision: 'catalogue',
        resourceType: 'division',
        domain: 'planning',
      },
    })
    expect(regions).toEqual(['hk', 'hk'])
  } finally {
    sqlite.close()
  }
})

test('lookup reads the selected immutable version, not a later version or a deleted record', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(`CREATE TABLE divisions (id TEXT, versionHash TEXT, identifiers TEXT);
      CREATE TABLE snapshotVersionChanges (snapshotId TEXT, recordType TEXT, recordId TEXT, locale TEXT, versionHash TEXT, operation TEXT, sourceReleaseId TEXT);
      INSERT INTO divisions VALUES ('d1', 'old', '{"PLAND:TPU":"101"}'), ('d1', 'new', '{"PLAND:TPU":"999"}'), ('deleted', 'gone', '{"PLAND:TPU":"102"}');
      INSERT INTO snapshotVersionChanges VALUES ('base', 'division', 'd1', '', 'old', 'upsert', 'source'), ('base', 'division', 'deleted', '', 'gone', 'upsert', 'source'), ('selected', 'division', 'deleted', '', NULL, 'delete', NULL);`)
    const db = createLocalHarbourDb(sqlite)
    const resolver = await import('@repo/core/pipeline/db/snapshotReplay.ts')
    const result = await listIdentityBridge(
      { metaDb: db as never, historyDbsByBinding: { history: db } as never, query },
      {
        resolveApiReleaseSetSnapshotsForRequest: async () =>
          ({
            releaseSet: {
              code: 'release-old',
              apiCatalogRevision: 'catalogue',
              domainCode: 'planning',
            },
            snapshots: [
              {
                role: 'primary',
                snapshotResourceType: 'division',
                snapshotId: 'selected',
              },
            ],
          }) as never,
        resolveSnapshotReplayPlan: async () =>
          [
            { snapshotId: 'base', shards: [{ bindingName: 'history' }] },
            { snapshotId: 'selected', shards: [{ bindingName: 'history' }] },
          ] as never,
        resolveSnapshotVersionState: resolver.resolveSnapshotVersionState,
      },
    )
    expect(result?.data).toEqual([
      { namespace: 'PLAND:TPU', identifier: '101', canonicalId: 'd1' },
    ])
  } finally {
    sqlite.close()
  }
})
