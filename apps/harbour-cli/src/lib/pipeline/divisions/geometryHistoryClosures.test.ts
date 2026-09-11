import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import {
  hashDivisionGeometryRow,
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows'

type ResourceType = Parameters<typeof writeGeometryRows>[1]
type Version = Parameters<typeof writeGeometryRows>[3]
type Scope = Pick<Version, 'source' | 'variant' | 'cohortKey' | 'transform'>
const exact: Scope = {
  source: 'overture',
  variant: 'overture',
  cohortKey: '2026',
}
const simplified: Scope = {
  ...exact,
  variant: 'overture-simplified',
  transform: 'simplified',
}

function fixture(resourceType: ResourceType) {
  const current = new Database(':memory:')
  const source = new Database(':memory:')
  const meta = new Database(':memory:')
  const histories = new Map([
    ['2025', new Database(':memory:')],
    ['2026', new Database(':memory:')],
  ])
  for (const [db, family] of [
    [current, 'current'],
    [source, 'source'],
    [meta, 'meta'],
    ...[...histories.values()].map(db => [db, 'history'] as const),
  ] as const)
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        family,
      ]),
    )
  const historyTargets = [...histories].map(([year, db]) => ({
    bindingName: `DB_HISTORY_HK_${year}`,
    databaseId: `history-${year}`,
    databaseName: `history-${year}`,
    db: drizzle({ client: db, schema: historySchema }),
    year,
  }))
  const history = (year = '2026') => {
    const db = histories.get(year)
    if (!db) throw new Error(`Missing geometry history fixture for ${year}`)
    return db
  }
  const table = resourceType === 'divisionArea' ? 'divisionAreas' : 'divisionBoundaries'
  const publicationTable =
    resourceType === 'divisionArea'
      ? 'divisionAreaPublicationState'
      : 'divisionBoundaryPublicationState'
  for (const target of historyTargets)
    meta
      .query(
        `INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
        VALUES(?,'history','hk',?,'preview',?,?,?,'active','hash')`,
      )
      .run(
        target.databaseId,
        target.year,
        target.databaseName,
        target.databaseId,
        target.bindingName,
      )
  const context = (year = '2026') => {
    const target = historyTargets.find(value => value.year === year)
    if (!target) throw new Error(`Missing geometry history target for ${year}`)
    return {
      currentDb: drizzle({ client: current, schema: currentSchema }),
      sourceDb: drizzle({ client: source, schema: sourceSchema }),
      historyDb: target.db,
      historyTargets,
      metaDb: drizzle({ client: meta, schema: metaSchema }),
    } as unknown as LocalAddressDbContext
  }
  const row = (id: string, edge = 115, scope: Scope = exact) => {
    const raw = {
      id,
      division_id: 'division',
      division_ids: ['left', 'right'],
      class: 'land',
      geometry:
        resourceType === 'divisionArea'
          ? {
              type: 'Polygon',
              coordinates: [
                [
                  [114, 22],
                  [edge, 22],
                  [edge, 23],
                  [114, 22],
                ],
              ],
            }
          : {
              type: 'LineString',
              coordinates: [
                [114, 22],
                [edge, 23],
              ],
            },
    }
    const result =
      resourceType === 'divisionArea'
        ? normaliseDivisionAreaGeometryRow(
            { ...raw, source_properties: { name: id }, source_geometry: raw.geometry },
            scope.source,
            { variant: scope.variant },
          )
        : normaliseDivisionBoundaryGeometryRow(raw, scope.source, {
            variant: scope.variant,
          })
    if (!result) throw new Error(`Invalid geometry fixture: ${id}`)
    return result
  }
  const lineage = (scope: Scope) => `${resourceType}:${scope.variant}`
  const scopeId = (scope: Scope) => JSON.stringify([lineage(scope), scope.cohortKey])
  let revision = 0
  const write = async (
    snapshotId: string,
    parentSnapshotId: string | null,
    rows: ReturnType<typeof row>[],
    options: {
      scope?: Scope
      year?: string
      merge?: boolean
      onProgress?: Parameters<typeof writeGeometryRows>[4]
    } = {},
  ) => {
    const scope = options.scope ?? exact
    const year = options.year ?? '2026'
    meta
      .query(
        `INSERT OR IGNORE INTO snapshotLineages(id,code,regionCode,resourceType,variant,identityMode,versionHash)
        VALUES(?,?,'hk',?,?,'cohort_scoped','hash')`,
      )
      .run(lineage(scope), lineage(scope), resourceType, scope.variant)
    meta
      .query(
        `INSERT OR IGNORE INTO snapshots(id,snapshotLineageId,parentSnapshotId,resourceType,code,cohortKey,status,revision)
        VALUES(?,?,?,?,?,?,'draft',?)`,
      )
      .run(
        snapshotId,
        lineage(scope),
        parentSnapshotId,
        resourceType,
        snapshotId,
        scope.cohortKey,
        revision++,
      )
    meta
      .query(
        'INSERT OR IGNORE INTO snapshotShardAssignments(snapshotId,dataShardId) VALUES(?,?)',
      )
      .run(snapshotId, `history-${year}`)
    const result = await writeGeometryRows(
      context(year),
      resourceType,
      rows,
      {
        ...scope,
        snapshotId,
        parentSnapshotId,
        snapshotLineageId: lineage(scope),
        releaseId: `release-${snapshotId}`,
        releaseCode: snapshotId,
        sourceVersion: snapshotId,
        merge: options.merge,
      },
      options.onProgress,
    )
    meta.query("UPDATE snapshots SET status='published' WHERE id=?").run(snapshotId)
    return result
  }
  const retained = (year = '2026') =>
    history(year).query(`SELECT * FROM ${table} ORDER BY id,versionHash`).all()
  const journal = (snapshotId: string, year = '2026') =>
    history(year)
      .query(
        'SELECT recordId,operation,versionHash FROM snapshotVersionChanges WHERE snapshotId=? ORDER BY recordId',
      )
      .all(snapshotId)
  const replay = async (snapshotId: string) => {
    const plan = await resolveSnapshotReplayPlan(context().metaDb as never, snapshotId)
    const state = await resolveSnapshotVersionState(
      plan,
      new Map(historyTargets.map(target => [target.bindingName, target as never])),
      [resourceType],
    )
    return [...state.values()]
      .map(value => ({
        id: value.recordId,
        versionHash: value.versionHash,
        bindingName: value.shard.bindingName,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  return {
    current,
    meta,
    history,
    table,
    publicationTable,
    row,
    write,
    retained,
    journal,
    replay,
    scopeId,
    close() {
      for (const db of [current, source, meta, ...histories.values()]) db.close()
    },
  }
}

for (const resourceType of ['divisionArea', 'divisionBoundary'] as const) {
  test(`${resourceType} alternates exact, simplified and cohort scopes without closing unrelated histories`, async () => {
    const f = fixture(resourceType)
    try {
      const exactRows = [f.row('shared'), f.row('exact-only')]
      await f.write('exact-first', null, exactRows)
      const exactHistory = f.retained()
      await f.write('simplified-first', null, [f.row('shared', 116, simplified)], {
        scope: simplified,
      })
      expect(f.retained()).toEqual(expect.arrayContaining(exactHistory))
      expect(f.journal('simplified-first')).toEqual([
        {
          recordId: 'shared',
          operation: 'upsert',
          versionHash: await hashDivisionGeometryRow(
            f.row('shared', 116, simplified).canonical,
          ),
        },
      ])
      const beforeCohort = f.retained()
      const archiveScope = { ...exact, cohortKey: '2001' }
      await f.write('archive-first', null, [f.row('shared', 117, archiveScope)], {
        scope: archiveScope,
      })
      expect(f.retained()).toEqual(expect.arrayContaining(beforeCohort))
      const beforeReissue = f.retained()
      const reissue = await f.write('exact-reissue', 'exact-first', exactRows)
      expect(f.retained()).toEqual(beforeReissue)
      expect(reissue.churn.unchanged).toBe(2)
      expect(
        f.current.query(`SELECT count(DISTINCT snapshotId) AS n FROM ${f.table}`).get(),
      ).toEqual({ n: 3 })
    } finally {
      f.close()
    }
  })

  test(`${resourceType} journals same-scope removals while retaining the selected predecessor for replay`, async () => {
    const f = fixture(resourceType)
    try {
      const previous = [f.row('changed'), f.row('removed'), f.row('unchanged')]
      await f.write('parent', null, previous)
      const retainedParent = f.retained()
      const parentState = await f.replay('parent')
      const result = await f.write('child', 'parent', [
        f.row('changed', 116),
        f.row('unchanged'),
      ])
      expect(result.churn).toMatchObject({
        added: 0,
        changed: 1,
        removed: 1,
        unchanged: 1,
      })
      expect(f.journal('child')).toEqual([
        {
          recordId: 'changed',
          operation: 'upsert',
          versionHash: await hashDivisionGeometryRow(f.row('changed', 116).canonical),
        },
        { recordId: 'removed', operation: 'delete', versionHash: null },
      ])
      expect(await f.replay('parent')).toEqual(parentState)
      expect(f.retained()).toEqual(expect.arrayContaining(retainedParent))
      expect((await f.replay('child')).map(value => value.id)).toEqual([
        'changed',
        'unchanged',
      ])
    } finally {
      f.close()
    }
  })

  test(`${resourceType} retains a shared content version when one cohort removes it`, async () => {
    const f = fixture(resourceType)
    try {
      const shared = f.row('shared')
      await f.write('cohort-first', null, [shared])
      const otherCohort = { ...exact, cohortKey: '2021' }
      await f.write('cohort-other', null, [shared], { scope: otherCohort })
      const retainedBefore = f.retained()
      expect(retainedBefore).toHaveLength(1)
      await f.write('cohort-empty', 'cohort-first', [])
      expect(f.retained()).toEqual(retainedBefore)
      expect(f.journal('cohort-empty')).toEqual([
        { recordId: 'shared', operation: 'delete', versionHash: null },
      ])
      expect(await f.replay('cohort-empty')).toEqual([])
      expect((await f.replay('cohort-other')).map(value => value.id)).toEqual([
        'shared',
      ])
      expect(f.current.query(`SELECT snapshotId,id FROM ${f.table}`).all()).toEqual([
        { snapshotId: f.scopeId(otherCohort), id: 'shared' },
      ])
    } finally {
      f.close()
    }
  })

  test(`${resourceType} compares a historical parent with its replay state rather than the newer scope projection`, async () => {
    const f = fixture(resourceType)
    try {
      const shared = f.row('shared')
      await f.write('historical', null, [shared, f.row('historical-only')])
      await f.write('latest', 'historical', [
        f.row('shared', 116),
        f.row('latest-only'),
      ])
      const retainedBefore = f.retained()
      const latestReplay = await f.replay('latest')
      const fork = await f.write('historical-fork', 'historical', [shared])
      expect(fork.churn).toMatchObject({
        added: 0,
        changed: 0,
        removed: 1,
        unchanged: 1,
      })
      expect(f.journal('historical-fork')).toEqual([
        { recordId: 'historical-only', operation: 'delete', versionHash: null },
      ])
      expect(f.retained()).toEqual(retainedBefore)
      expect(await f.replay('latest')).toEqual(latestReplay)
      expect((await f.replay('historical-fork')).map(value => value.id)).toEqual([
        'shared',
      ])
    } finally {
      f.close()
    }
  })

  test(`${resourceType} keeps the predecessor shard immutable across a year boundary`, async () => {
    const f = fixture(resourceType)
    try {
      await f.write('december', null, [f.row('changed'), f.row('removed')], {
        year: '2025',
      })
      const retainedDecember = f.retained('2025')
      const decemberState = await f.replay('december')
      const january = await f.write('january', 'december', [f.row('changed', 116)])
      expect(january.churn).toMatchObject({ changed: 1, removed: 1 })
      expect(f.retained('2025')).toEqual(retainedDecember)
      expect(f.journal('january', '2025')).toEqual([])
      expect(f.journal('january')).toEqual([
        {
          recordId: 'changed',
          operation: 'upsert',
          versionHash: await hashDivisionGeometryRow(f.row('changed', 116).canonical),
        },
        { recordId: 'removed', operation: 'delete', versionHash: null },
      ])
      expect(await f.replay('december')).toEqual(decemberState)
      expect(await f.replay('january')).toEqual([
        {
          id: 'changed',
          versionHash: await hashDivisionGeometryRow(f.row('changed', 116).canonical),
          bindingName: 'DB_HISTORY_HK_2026',
        },
      ])
    } finally {
      f.close()
    }
  })

  test(`${resourceType} merges a historical parent across shards and restores its own inherited values`, async () => {
    const f = fixture(resourceType)
    try {
      const parentRows = [f.row('shared'), f.row('inherited')]
      await f.write('historical', null, parentRows, { year: '2025' })
      const retainedParent = f.retained('2025')
      await f.write('latest', 'historical', [
        f.row('shared', 116),
        f.row('latest-only'),
      ])
      const latestState = await f.replay('latest')
      const result = await f.write('merged', 'historical', [f.row('companion')], {
        merge: true,
      })
      expect(result.churn).toMatchObject({ added: 1, removed: 0, changed: 0 })
      expect(f.retained('2025')).toEqual(retainedParent)
      expect(f.journal('merged')).toEqual([
        {
          recordId: 'companion',
          operation: 'upsert',
          versionHash: await hashDivisionGeometryRow(f.row('companion').canonical),
        },
      ])
      const expected = await Promise.all(
        [...parentRows, f.row('companion')].map(async row => ({
          id: row.canonical.id,
          versionHash: await hashDivisionGeometryRow(row.canonical),
          bindingName:
            row.canonical.id === 'companion'
              ? 'DB_HISTORY_HK_2026'
              : 'DB_HISTORY_HK_2025',
        })),
      )
      expect(await f.replay('merged')).toEqual(
        expected.sort((a, b) => a.id.localeCompare(b.id)),
      )
      expect(await f.replay('latest')).toEqual(latestState)
      const projected = f.current
        .query(`SELECT id,geometry FROM ${f.table} WHERE snapshotId=? ORDER BY id`)
        .all(f.scopeId(exact)) as Array<{ id: string; geometry: string }>
      expect(projected).toEqual(
        [...parentRows, f.row('companion')]
          .map(row => ({
            id: row.canonical.id,
            geometry: JSON.stringify(row.canonical.geometry),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      )
    } finally {
      f.close()
    }
  })

  for (const problem of [
    'unassigned shard',
    'unavailable shard',
    'missing content',
  ] as const)
    test(`${resourceType} rejects historical ${problem} before changing the current scope`, async () => {
      const f = fixture(resourceType)
      try {
        const old = f.row('shared')
        await f.write('historical', null, [old], { year: '2025' })
        await f.write('latest', 'historical', [f.row('shared', 116)])
        if (problem === 'unassigned shard')
          f.meta
            .query("DELETE FROM snapshotShardAssignments WHERE snapshotId='historical'")
            .run()
        else if (problem === 'unavailable shard')
          f.meta
            .query(
              "UPDATE dataShards SET bindingName='DB_HISTORY_HK_MISSING' WHERE year='2025'",
            )
            .run()
        else
          f.history('2025')
            .query(`DELETE FROM ${f.table} WHERE id=? AND versionHash=?`)
            .run('shared', await hashDivisionGeometryRow(old.canonical))
        const currentChanges = f.current.query('SELECT total_changes() AS n').get()
        const currentRows = f.current.query(`SELECT * FROM ${f.table}`).all()
        const historyBefore = f.retained()
        await expect(f.write('invalid-fork', 'historical', [])).rejects.toThrow(
          problem === 'unassigned shard'
            ? 'no assigned history shards'
            : problem === 'unavailable shard'
              ? 'requires unavailable history binding DB_HISTORY_HK_MISSING'
              : 'is missing retained',
        )
        expect(f.current.query('SELECT total_changes() AS n').get()).toEqual(
          currentChanges,
        )
        expect(f.current.query(`SELECT * FROM ${f.table}`).all()).toEqual(currentRows)
        expect(f.retained()).toEqual(historyBefore)
        expect(f.journal('invalid-fork')).toEqual([])
      } finally {
        f.close()
      }
    })

  test(`${resourceType} retries interruption after removal journalling without publishing partial membership`, async () => {
    const f = fixture(resourceType)
    try {
      await f.write('parent', null, [f.row('changed'), f.row('removed')])
      const retainedParent = f.retained()
      const parentState = await f.replay('parent')
      await expect(
        f.write('interrupted', 'parent', [f.row('changed', 116)], {
          onProgress(stage) {
            if (stage === 'close source rows') throw new Error('Fixture interruption')
          },
        }),
      ).rejects.toThrow('Fixture interruption')
      expect(f.retained()).toEqual(retainedParent)
      expect(await f.replay('parent')).toEqual(parentState)
      expect(
        f.current
          .query(`SELECT snapshotId,status,preparedAt FROM ${f.publicationTable}`)
          .get(),
      ).toEqual({ snapshotId: 'interrupted', status: 'publishing', preparedAt: null })
      await expect(f.write('invalid-child', 'interrupted', [])).rejects.toThrow(
        'no complete',
      )
      await f.write('interrupted', 'parent', [f.row('changed', 116)])
      expect(f.retained()).toEqual(expect.arrayContaining(retainedParent))
      expect((await f.replay('interrupted')).map(value => value.id)).toEqual([
        'changed',
      ])
      expect(f.journal('interrupted')).toEqual([
        {
          recordId: 'changed',
          operation: 'upsert',
          versionHash: await hashDivisionGeometryRow(f.row('changed', 116).canonical),
        },
        { recordId: 'removed', operation: 'delete', versionHash: null },
      ])
      expect(
        f.current
          .query(
            `SELECT snapshotId,preparedAt IS NOT NULL AS prepared FROM ${f.publicationTable}`,
          )
          .get(),
      ).toEqual({ snapshotId: 'interrupted', prepared: 1 })
    } finally {
      f.close()
    }
  })
}

test('Planning Area ingestion preserves unrelated C&SD HMA history in the shared shard', async () => {
  const f = fixture('divisionArea')
  try {
    const censtatd: Scope = {
      source: 'hkgov-censtatd',
      variant: 'hkgov-censtatd-hma',
      cohortKey: '2021',
    }
    const planning: Scope = {
      source: 'hkgov-pland-pu',
      variant: 'hkgov-pland-pu',
      cohortKey: '2001',
    }
    await f.write(
      'hma',
      null,
      [f.row('CENSTATD:housing-market-area:HMA001', 115, censtatd)],
      {
        scope: censtatd,
      },
    )
    const retainedHma = f.retained()
    await f.write('planning', null, [f.row('PLAND:TPU001', 116, planning)], {
      scope: planning,
    })
    expect(f.retained()).toEqual(expect.arrayContaining(retainedHma))
    expect(
      f.journal('planning').map(value => (value as { recordId: string }).recordId),
    ).toEqual(['PLAND:TPU001'])
  } finally {
    f.close()
  }
})
