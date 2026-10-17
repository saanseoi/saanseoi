import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { historyEventsSqlForTables, historySchema, metaSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { isApiReleaseSetStatsReady } from './apiReleaseSetStats'
import {
  buildDivisionStatsFromSnapshots,
  type DivisionStatsSnapshot,
  previousDivisionStatsRelease,
  readDivisionStatsSnapshot,
} from './divisionApiReleaseSetStats'

const division = (id: string, extra = {}) =>
  ({
    id,
    class: 'district',
    category: 'administrative',
    hierarchies: { administrative: [], locality: [], landform: [], full: [] },
    level: 2,
    ...extra,
  }) as unknown as DivisionStatsSnapshot['divisions'][number]
const name = (id: string, value: string, extra = {}) =>
  ({
    divisionId: id,
    locale: 'en',
    name: value,
    meta: { fields: { name: { origin: 'provided' } } },
    ...extra,
  }) as unknown as DivisionStatsSnapshot['names'][number]
const totals = (rows: ReturnType<typeof buildDivisionStatsFromSnapshots>) =>
  Object.fromEntries(
    rows
      .filter(row => row.category === 'changes' && !row.dimension)
      .map(row => [row.measure, row.value]),
  )

test('waits for required companion snapshots before calculating API stats', () => {
  const result = {
    phase: null,
    releaseCode: 'source',
    resourceReleaseId: 'source-id',
    status: 'current',
    apiReleaseSetId: 'api',
    snapshotId: 'snapshot',
  }
  expect(isApiReleaseSetStatsReady(undefined)).toBe(false)
  expect(isApiReleaseSetStatsReady({ ...result, apiReleaseSetStatus: 'draft' })).toBe(
    false,
  )
  expect(isApiReleaseSetStatsReady({ ...result, snapshotId: undefined })).toBe(false)
  expect(isApiReleaseSetStatsReady({ ...result, apiReleaseSetStatus: 'current' })).toBe(
    true,
  )
  expect(
    isApiReleaseSetStatsReady({ ...result, apiReleaseSetStatus: 'archived' }),
  ).toBe(true)
})

test('churn counts name and hierarchy changes, additions and removals, excluding provenance and geometry', () => {
  const previous = {
    divisions: [
      division('same'),
      division('renamed'),
      division('parent'),
      division('removed'),
    ],
    names: [name('renamed', 'Old')],
  }
  const current = {
    divisions: [
      division('same', {
        sources: [{ release: 'new' }],
        geometry: 'different',
        versionHash: 'new',
      }),
      division('renamed'),
      division('parent', {
        hierarchies: {
          administrative: [[{ id: 'new-parent', class: 'region', name: 'Parent' }]],
          locality: [],
          full: [[{ id: 'new-parent', class: 'region', name: 'Parent' }]],
        },
      }),
      division('added'),
    ],
    names: [name('renamed', 'New')],
  }
  const rows = buildDivisionStatsFromSnapshots(current, previous)
  expect(totals(rows)).toEqual({
    count: 4,
    added_count: 1,
    removed_count: 1,
    changed_count: 2,
    unchanged_count: 1,
  })
  expect(
    rows.find(
      row =>
        row.category === 'changes' &&
        row.measure === 'changed_count' &&
        row.dimension === 'divisionType',
    )?.value,
  ).toBe(2)
  expect(
    rows.find(
      row =>
        row.category === 'changes' &&
        row.measure === 'removed_count' &&
        row.dimension === 'level',
    )?.value,
  ).toBe(1)
  expect(totals(buildDivisionStatsFromSnapshots(current))).toEqual({
    count: 4,
    added_count: 4,
    removed_count: 0,
    changed_count: 0,
    unchanged_count: 0,
  })
})

test('name ordering and provenance do not create content churn', () => {
  const before = {
    divisions: [division('a')],
    names: [name('a', 'A'), name('a', '甲', { locale: 'zh-hant' })],
  }
  const after = {
    divisions: [division('a')],
    names: [
      name('a', '甲', { locale: 'zh-hant' }),
      name('a', 'A', {
        meta: {
          fields: { name: { origin: 'human-translated' } },
        },
      }),
    ],
  }
  expect(totals(buildDivisionStatsFromSnapshots(after, before)).unchanged_count).toBe(1)
})

test('comparison stays within region, domain and API version, including filtered backfills', () => {
  const release = (id: string, extra = {}) => ({
    id,
    regionCode: 'hk',
    domainCode: 'pu',
    apiVersionId: 'v1',
    ...extra,
  })
  const rows = [
    release('first'),
    release('other-domain', { domainCode: 'new-town' }),
    release('other-region', { regionCode: 'mo' }),
    release('other-version', { apiVersionId: 'v2' }),
    release('last'),
  ]
  expect(previousDivisionStatsRelease(rows, 'last')?.id).toBe('first')
  expect(previousDivisionStatsRelease(rows, 'first')).toBeUndefined()
  expect(() => previousDivisionStatsRelease(rows, 'missing')).toThrow('not found')
})

function createTables(sqlite: Database, tables: SQLiteTable[]) {
  for (const table of tables) {
    const config = getTableConfig(table)
    sqlite.exec(
      `CREATE TABLE "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}${column.name === 'operation' ? " DEFAULT 'upsert'" : ''}`).join(',')})`,
    )
  }
}

test('replay loads inherited content across shards, respects deletes, and rejects missing content', async () => {
  const meta = new Database(':memory:')
  const older = new Database(':memory:')
  const newer = new Database(':memory:')
  try {
    createTables(meta, [
      metaSchema.metaSnapshotResourceReleases,
      metaSchema.metaSnapshots,
      metaSchema.metaSnapshotLineages,
      metaSchema.metaDataShards,
      metaSchema.metaSnapshotShardAssignments,
    ])
    for (const db of [older, newer])
      createTables(db, [historySchema.divisions, historySchema.divisionsI18n])
    for (const db of [older, newer])
      db.exec(
        `CREATE VIEW historyEvents AS ${historyEventsSqlForTables(new Set(['divisions', 'divisionsI18n']))}`,
      )
    meta.exec(`INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'root','fixture-lineage-' || 'root','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'root' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'leaf','fixture-lineage-' || 'leaf','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='fixture-lineage-' || 'leaf' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, parentSnapshotId) VALUES
('root', 'fixture-lineage-' || 'root', NULL),
('leaf', 'fixture-lineage-' || 'leaf', 'root');
      INSERT INTO dataShards (id, bindingName) VALUES ('old', 'old'), ('new', 'new');
      INSERT INTO snapshotShardAssignments (snapshotId, dataShardId) VALUES ('root', 'old'), ('leaf', 'new');`)
    older.exec(`INSERT INTO divisions (id, versionHash, class, level) VALUES ('keep', 'v1', 'district', 2), ('remove', 'v2', 'district', 2);
      INSERT INTO divisionsI18n (divisionId, locale, versionHash, name) VALUES ('keep', 'en', 'n1', 'Kept'), ('remove', 'en', 'n2', 'Removed');
      UPDATE divisions SET snapshotId='root';
      UPDATE divisionsI18n SET snapshotId='root' ;`)
    newer.exec(
      `INSERT INTO divisions (snapshotId,id,operation) VALUES ('leaf','remove','delete');`,
    )
    meta.exec(
      "INSERT INTO snapshotResourceReleases(snapshotId,resourceReleaseId,role) SELECT id,id,'primary' FROM snapshots",
    )
    const targets = [
      { bindingName: 'old', db: drizzle({ client: older }) },
      { bindingName: 'new', db: drizzle({ client: newer }) },
    ]
    const rows = await readDivisionStatsSnapshot(
      drizzle({ client: meta }) as never,
      targets,
      'leaf',
    )
    expect(rows.divisions.map(row => row.id)).toEqual(['keep'])
    expect(rows.names.map(row => row.name)).toEqual(['Kept'])
    older.exec("UPDATE divisions SET versionHash=NULL WHERE id = 'keep'")
    await expect(
      readDivisionStatsSnapshot(drizzle({ client: meta }) as never, targets, 'leaf'),
    ).rejects.toThrow('invalid content event')
  } finally {
    meta.close()
    older.close()
    newer.close()
  }
})
