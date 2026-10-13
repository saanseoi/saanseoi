import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import {
  extractIdentityMappings,
  type IdentityBridgeQuery,
  identityBridgePage,
  listIdentityBridge,
} from './identityBridge'

const query: IdentityBridgeQuery = {
  resourceType: 'division',
  region: 'hk',
  domain: 'planning',
  releaseSet: 'release-old',
  limit: 1,
}

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
    sqlite.exec(`CREATE TABLE divisions (id TEXT, versionHash TEXT, identifiers TEXT, snapshotId TEXT, operation TEXT DEFAULT 'upsert', sourceReleaseId TEXT DEFAULT 'source');
      CREATE VIEW historyEvents AS SELECT snapshotId,'division' AS recordType,id AS recordId,'' AS locale,versionHash,operation,sourceReleaseId FROM divisions;
      INSERT INTO divisions(id,versionHash,identifiers,snapshotId) VALUES ('d1', 'old', '{"PLAND:TPU":"101"}','base'), ('d1', 'new', '{"PLAND:TPU":"999"}','sibling'), ('deleted', 'gone', '{"PLAND:TPU":"102"}','base');
      INSERT INTO divisions(id,snapshotId,operation) VALUES('deleted','selected','delete');`)
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
              {
                role: 'geometry',
                snapshotResourceType: 'divisionArea',
                snapshotId: 'geometry-without-identity-columns',
              },
            ],
          }) as never,
        resolveSnapshotReplayPlan: async (_db, snapshotId) => {
          expect(snapshotId).toBe('selected')
          return [
            { snapshotId: 'base', shards: [{ bindingName: 'history' }] },
            { snapshotId: 'selected', shards: [{ bindingName: 'history' }] },
          ] as never
        },
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

test('publisher-grouped Planning identifiers expose only their own level and retain New Town IDs', () => {
  expect(
    extractIdentityMappings(
      {
        'hkgov-pland': {
          ppu: '3',
          spu: '35',
          tpu: '351',
          subunit: '30',
          newTownId: 'town',
        },
        'hkgov-landsd': { geoNameId: '001' },
      },
      'd',
    ),
  ).toEqual([
    { namespace: 'hkgov-pland.subunit', identifier: '351-30', canonicalId: 'd' },
    { namespace: 'hkgov-pland.newTownId', identifier: 'town', canonicalId: 'd' },
    { namespace: 'hkgov-landsd.geoNameId', identifier: '001', canonicalId: 'd' },
  ])
})
