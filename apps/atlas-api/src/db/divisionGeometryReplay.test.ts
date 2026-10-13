import { Database } from 'bun:sqlite'
import { expect, mock, test } from 'bun:test'
import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  type ResolvedSnapshotVersion,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import { compressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import { currentSchema, historySchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  type DivisionServiceDependencies,
  getDivisionDetail,
  listDivisions,
} from '../services/divisions'
import {
  hasCurrentDivisionGeometrySnapshot,
  listReplayedDivisionAreasByDivisionIds,
  listReplayedDivisionBoundariesByDivisionIds,
} from './divisionGeometryReplay'
import {
  type DivisionRecord,
  listDivisionAreasCurrentByDivisionIds,
  listDivisionBoundariesCurrentByDivisionIds,
} from './divisions'

function createDb(history = false) {
  const sqlite = new Database(':memory:')
  const parameterCounts: number[] = []
  for (const kind of ['divisionAreas', 'divisionBoundaries']) {
    sqlite.exec(`CREATE TABLE ${kind} (
      snapshotId TEXT NOT NULL, id TEXT NOT NULL, variant TEXT,
      bbox TEXT, geometry BLOB, sources TEXT, type TEXT,
      isLand INTEGER, isTerritorial INTEGER, createdAt TEXT, updatedAt TEXT,
      ${kind === 'divisionAreas' ? 'divisionId TEXT' : 'leftDivisionId TEXT, rightDivisionId TEXT'}
      ${history ? ", operation TEXT DEFAULT 'upsert', versionHash TEXT, sourceReleaseId TEXT, isCurrent INTEGER" : ''}
    )`)
  }
  if (!history) {
    for (const [family, snapshotId] of [
      ['division', 'division-current'],
      ['divisionArea', 'area-leaf'],
      ['divisionBoundary', 'boundary-leaf'],
    ]) {
      sqlite.exec(`CREATE TABLE ${family}PublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
        INSERT INTO ${family}PublicationState VALUES ('scope:${snapshotId}','${snapshotId}','current','token','2026-01-01','2026-01-01')`)
    }
  }
  if (history)
    sqlite.exec(
      `CREATE VIEW historyEvents AS SELECT snapshotId,'divisionArea' AS recordType,id AS recordId,'' AS locale,versionHash,operation,sourceReleaseId,createdAt,updatedAt FROM divisionAreas UNION ALL SELECT snapshotId,'divisionBoundary',id,'',versionHash,operation,sourceReleaseId,createdAt,updatedAt FROM divisionBoundaries`,
    )
  const db = drizzle({
    client: sqlite,
    logger: {
      logQuery(_query, parameters) {
        parameterCounts.push(parameters.length)
        if (parameters.length > 100) throw new Error('D1 parameter limit exceeded')
      },
    },
  }) as unknown as HarbourReadableDb & HarbourWritableDb
  return { sqlite, db, parameterCounts }
}

function createFixture() {
  const current = createDb()
  const root = createDb(true)
  const leaf = createDb(true)
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ],
  }
  const line = {
    type: 'LineString',
    coordinates: [
      [0, 0],
      [1, 0],
    ],
  }
  const common = {
    variant: 'overture',
    bbox: [0, 0, 1, 1],
    sources: null,
    type: 'land',
    isLand: true,
    isTerritorial: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
  const area = {
    ...common,
    id: 'area-a',
    divisionId: 'division-a',
    geometry: compressJsonBrotli(polygon),
  }
  const unchanged = { ...area, id: 'area-unchanged' }
  const boundary = {
    ...common,
    id: 'boundary-a',
    leftDivisionId: 'division-a',
    rightDivisionId: 'division-b',
    geometry: compressJsonBrotli(line),
  }
  const rightBoundary = {
    ...boundary,
    id: 'boundary-right',
    leftDivisionId: 'division-other',
    rightDivisionId: 'division-a',
  }
  function insertHistory(
    owner: typeof root,
    kind: 'divisionArea' | 'divisionBoundary',
    row: Record<string, unknown>,
    hash: string,
  ) {
    owner.db
      .insert(
        kind === 'divisionArea'
          ? historySchema.divisionAreas
          : historySchema.divisionBoundaries,
      )
      .values({
        ...row,
        snapshotId: `${kind === 'divisionArea' ? 'area' : 'boundary'}-${owner === root ? 'root' : 'leaf'}`,
        versionHash: hash,
        sourceReleaseId: 'source',
        isCurrent: false,
      } as never)
      .run()
  }
  insertHistory(root, 'divisionArea', { ...area, geometry: null }, 'old')
  insertHistory(root, 'divisionArea', unchanged, 'unchanged')
  insertHistory(root, 'divisionArea', { ...area, id: 'area-deleted' }, 'deleted')
  // Same hash on another record must not make that record a snapshot member.
  insertHistory(root, 'divisionArea', { ...area, id: 'area-unselected' }, 'unchanged')
  root.sqlite.exec(
    "UPDATE divisionAreas SET snapshotId='sibling' WHERE id='area-unselected'",
  )
  leaf.sqlite.exec(
    "INSERT INTO divisionAreas(id,snapshotId,operation) VALUES('area-deleted','area-leaf','delete')",
  )
  insertHistory(leaf, 'divisionArea', area, 'new')
  insertHistory(
    leaf,
    'divisionArea',
    { ...area, id: 'area-other-variant', variant: 'other' },
    'other',
  )
  for (const row of [boundary, rightBoundary]) {
    insertHistory(root, 'divisionBoundary', row, row.id)
    current.db
      .insert(currentSchema.divisionBoundaries)
      .values({ ...row, snapshotId: 'scope:boundary-leaf' })
      .run()
  }
  for (const row of [area, unchanged]) {
    current.db
      .insert(currentSchema.divisionAreas)
      .values({ ...row, snapshotId: 'scope:area-leaf' })
      .run()
  }
  const plans: Record<string, SnapshotReplayStep[]> = Object.fromEntries(
    ['area', 'boundary'].map(kind => [
      `${kind}-leaf`,
      [
        {
          snapshotId: `${kind}-root`,
          parentSnapshotId: null,
          shards: [{ dataShardId: 'root', bindingName: 'DB_HISTORY_HK_2025' }],
        },
        {
          snapshotId: `${kind}-leaf`,
          parentSnapshotId: `${kind}-root`,
          shards: [{ dataShardId: 'leaf', bindingName: 'DB_HISTORY_HK_2026' }],
        },
      ],
    ]),
  )
  const historyDbsByBinding = {
    DB_HISTORY_HK_BEFORE: root.db,
    DB_HISTORY_HK_2025: root.db,
    DB_HISTORY_HK_2026: leaf.db,
  } as never
  const shards = new Map([
    ['DB_HISTORY_HK_2025', { bindingName: 'DB_HISTORY_HK_2025', db: root.db as never }],
    ['DB_HISTORY_HK_2026', { bindingName: 'DB_HISTORY_HK_2026', db: leaf.db as never }],
  ])
  return {
    current,
    root,
    leaf,
    plans,
    plan(snapshotId: string) {
      const plan = plans[snapshotId]
      if (!plan) throw new Error(`Missing fixture plan ${snapshotId}`)
      return plan
    },
    shards,
    historyDbsByBinding,
    close() {
      current.sqlite.close()
      root.sqlite.close()
      leaf.sqlite.close()
    },
  }
}

const sortRecords = <T extends { id: string }>(rows: T[]) =>
  rows.sort((a, b) => a.id.localeCompare(b.id))

test('replays geometry changes, deletions and owning shards with current-table parity', async () => {
  const fixture = createFixture()
  try {
    const lookup = { divisionIds: ['division-a', 'division-b'], variant: 'overture' }
    const areas = await resolveSnapshotVersionState(
      fixture.plan('area-leaf'),
      fixture.shards,
      ['divisionArea'],
    )
    const boundaries = await resolveSnapshotVersionState(
      fixture.plan('boundary-leaf'),
      fixture.shards,
      ['divisionBoundary'],
    )
    const expectedAreas = await listDivisionAreasCurrentByDivisionIds(
      fixture.current.db as never,
      { ...lookup, snapshotId: 'area-leaf' },
    )
    const expectedBoundaries = await listDivisionBoundariesCurrentByDivisionIds(
      fixture.current.db as never,
      { ...lookup, snapshotId: 'boundary-leaf' },
    )
    expect(
      sortRecords(await listReplayedDivisionAreasByDivisionIds(areas.values(), lookup)),
    ).toEqual(sortRecords(expectedAreas))
    expect(
      sortRecords(
        await listReplayedDivisionBoundariesByDivisionIds(boundaries.values(), lookup),
      ),
    ).toEqual(sortRecords(expectedBoundaries))
    expect(expectedAreas.map(row => row.id).sort()).toEqual([
      'area-a',
      'area-unchanged',
    ])
    expect(expectedBoundaries.map(row => row.id).sort()).toEqual([
      'boundary-a',
      'boundary-right',
    ])
    expect(
      await listReplayedDivisionAreasByDivisionIds(areas.values(), {
        divisionIds: ['absent'],
      }),
    ).toEqual([])
    expect(
      await listReplayedDivisionBoundariesByDivisionIds(boundaries.values(), {
        divisionIds: ['absent'],
      }),
    ).toEqual([])
  } finally {
    fixture.close()
  }
})

const divisionRecord: DivisionRecord = {
  division: {
    snapshotId: 'division-current',
    id: 'division-a',
    level: 2,
    class: 'district',
    category: 'administrative',
    geometry: null,
    hierarchies: { administrative: [], locality: [], landform: [], full: [] },
    cartography: null,
    sources: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  i18n: { en: { name: 'District A' } },
}

test.each([false, true])(
  'Divisions list and detail preserve pinned geometry when superseded=%s',
  async superseded => {
    const fixture = createFixture()
    const replay = mock(async (_db: unknown, snapshotId: string) =>
      fixture.plan(snapshotId),
    )
    const dependencies: Partial<DivisionServiceDependencies> = {
      hasCurrentDivisionSnapshot: async () => true,
      listDivisionRecordsCurrent: async () => [divisionRecord],
      countDivisionsCurrent: async () => 1,
      listDivisionRecordsCurrentByIds: async () => [divisionRecord],
      resolveSnapshotReplayPlan: replay,
      resolvePublishedSnapshotForResourceTypeRegionCohortKey: async () =>
        ({ id: 'area-leaf' }) as never,
      resolveApiReleaseSetSnapshotsForRequest: async (_db, _resource, selectors) =>
        ({
          releaseSet: {
            code: selectors?.releaseSet ? 'release' : 'latest-release',
            cohortKey: '2026-01',
            domainCode: 'geographic',
            schemaVersion: 'schema',
            rulesetVersion: 'rules',
            effectiveFrom: '2026-01-01',
            apiCatalogRevision: 'catalog',
            catalogPublishedAt: '2026-01-01',
          },
          snapshots: [
            {
              snapshotResourceType: 'division',
              snapshotId: 'division-current',
              role: 'primary',
              variant: 'overture',
            },
            {
              snapshotResourceType: 'divisionArea',
              snapshotId: 'area-leaf',
              role: 'supporting',
              variant: 'overture',
            },
            {
              snapshotResourceType: 'divisionBoundary',
              snapshotId: 'boundary-leaf',
              role: 'supporting',
              variant: 'overture',
            },
          ],
        }) as never,
    }
    const args = {
      currentDb: fixture.current.db as never,
      metaDb: fixture.current.db as never,
      historyDbsByBinding: fixture.historyDbsByBinding,
      requestUrl: 'http://localhost/divisions/v0.1',
      requestedVersionPath: 'divisions/v0.1' as const,
      requestedApiVersion: '0.1' as const,
      resolvedApiVersion: 'api-divisions-v0.1' as const,
      query: {
        include: superseded
          ? 'areas:overture,boundaries:overture'
          : 'areas:overture@2025-09,boundaries:overture',
        ...(superseded ? {} : { releaseSet: 'release' }),
      },
      dependencies,
    }
    try {
      const listBefore = await listDivisions(args)
      const detailBefore = await getDivisionDetail({ ...args, id: 'division-a' })
      expect(replay).not.toHaveBeenCalled()
      expect(listBefore.status).toBe(200)
      if (listBefore.status !== 200) return
      expect(listBefore.body.included).toHaveLength(4)
      if (superseded) {
        fixture.current.sqlite.exec(`CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
    CREATE TABLE snapshots(
      id TEXT,
      snapshotLineageId TEXT NOT NULL,
      cohortKey TEXT,
      status TEXT
    );
        INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('area-lineage','area-lineage','divisionArea','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionArea' WHERE id='area-lineage' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('boundary-lineage','boundary-lineage','divisionBoundary','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionBoundary' WHERE id='boundary-lineage' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, cohortKey, status) VALUES
('area-leaf', 'area-lineage', '2026-01', 'published'),
('boundary-leaf', 'boundary-lineage', '2026-01', 'published');
        UPDATE divisionAreaPublicationState SET scopeId='["area-lineage","2026-01"]',snapshotId='area-replacement',status='publishing';
        UPDATE divisionBoundaryPublicationState SET scopeId='["boundary-lineage","2026-01"]',snapshotId='boundary-replacement',status='publishing';`)
        expect((await listDivisions(args)).status).toBe(503)
        fixture.current.sqlite.exec(`UPDATE divisionAreaPublicationState SET status='current';
        UPDATE divisionBoundaryPublicationState SET status='current';
        DELETE FROM divisionAreas; DELETE FROM divisionBoundaries;`)
      } else {
        fixture.current.sqlite.exec(
          'DELETE FROM divisionAreas; DELETE FROM divisionBoundaries; DELETE FROM divisionAreaPublicationState; DELETE FROM divisionBoundaryPublicationState;',
        )
      }
      expect(await listDivisions(args)).toEqual(listBefore)
      expect(await getDivisionDetail({ ...args, id: 'division-a' })).toEqual(
        detailBefore,
      )
      expect(replay).toHaveBeenCalledTimes(4)
    } finally {
      fixture.close()
    }
  },
)

test('an existing sparse current geometry snapshot does not trigger history replay', async () => {
  const fixture = createFixture()
  try {
    const lookup = {
      snapshotId: 'area-leaf',
      divisionIds: ['absent'],
      variant: 'overture',
    }
    expect(
      await listDivisionAreasCurrentByDivisionIds(fixture.current.db as never, lookup),
    ).toEqual([])
    expect(
      await hasCurrentDivisionGeometrySnapshot(
        fixture.current.db as never,
        'area-leaf',
        'divisionArea',
      ),
    ).toBe(true)
    fixture.current.sqlite.exec(
      'DELETE FROM divisionAreas; DELETE FROM divisionAreaPublicationState',
    )
    expect(
      await hasCurrentDivisionGeometrySnapshot(
        fixture.current.db as never,
        'area-leaf',
        'divisionArea',
      ),
    ).toBe(false)
  } finally {
    fixture.close()
  }
})

test('batches immutable geometry tuples within D1 limits for large selections', async () => {
  const fixture = createDb(true)
  try {
    const versions: ResolvedSnapshotVersion[] = Array.from(
      { length: 120 },
      (_, index) => ({
        recordType: 'divisionBoundary',
        recordId: `boundary-${index}`,
        locale: '',
        versionHash: `hash-${index}`,
        sourceReleaseId: 'source',
        snapshotId: 'snapshot',
        shard: { bindingName: 'history', db: fixture.db as never },
      }),
    )
    await listReplayedDivisionBoundariesByDivisionIds(versions, {
      divisionIds: Array.from({ length: 200 }, (_, index) => `division-${index}`),
      variant: 'overture',
    })
    expect(fixture.parameterCounts).toHaveLength(3)
    expect(Math.max(...fixture.parameterCounts)).toBeLessThanOrEqual(100)
  } finally {
    fixture.sqlite.close()
  }
})
