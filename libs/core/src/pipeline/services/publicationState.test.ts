import { describe, expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { publicationScopeId } from './publication/scope'
import {
  finalisePublishedResources,
  publicationFamilies,
  type PublicationDatabase,
} from './publicationState'

function fixture() {
  const current = new Database(':memory:')
  const meta = new Database(':memory:')
  const migrations = resolve(import.meta.dir, '../../../../db/migrations')
  current.exec(loadMigrationSql(migrations, ['current']))
  meta.exec(loadMigrationSql(migrations, ['meta']))
  meta.exec('PRAGMA foreign_keys = OFF')
  const selected = Object.fromEntries(
    publicationFamilies.map(family => [family, new Set<string>()]),
  ) as Record<(typeof publicationFamilies)[number], Set<string>>
  let writes = 0
  let revision = 0
  let beforeRun: (() => void) | undefined
  const binding = {
    prepare(sql: string) {
      let values: SQLQueryBindings[] = []
      return {
        bind(...args: unknown[]) {
          values = args as SQLQueryBindings[]
          return this
        },
        async all() {
          return { results: current.query(sql).all(...values) }
        },
        async run() {
          beforeRun?.()
          beforeRun = undefined
          const result = current.query(sql).run(...values)
          writes += result.changes
          return result
        },
      }
    },
  } as PublicationDatabase
  function add(
    id: string,
    options: {
      prepared?: boolean
      status?: string
      family?: (typeof publicationFamilies)[number]
      selected?: boolean
      current?: boolean
      lineage?: string
      receipt?: boolean
    } = {},
  ) {
    const family = options.family ?? 'division'
    const lineage = options.lineage ?? id
    meta
      .query(
        `INSERT INTO snapshots(id, code, snapshotLineageId, resourceType, cohortKey, status, revision) VALUES (?, ?, ?, ?, '2026', ?, ?)`,
      )
      .run(id, id, lineage, family, options.status ?? 'published', revision++)
    if (options.receipt !== false)
      current
        .query(`INSERT INTO ${family}PublicationState(snapshotId, scopeId, status, publicationToken, preparedAt)
      VALUES (?, ?, ?, ?, ?)`)
        .run(
          id,
          publicationScopeId(family, lineage, '2026'),
          options.current ? 'current' : 'publishing',
          id,
          options.prepared === false ? null : 'complete',
        )
    if (options.selected !== false) selected[family].add(id)
  }
  const finalise = (options: Parameters<typeof finalisePublishedResources>[2] = {}) =>
    finalisePublishedResources(createLocalHarbourDb(meta), binding, options, {
      resolvePublicationSelections: async () => selected,
    })
  return {
    current,
    meta,
    selected,
    add,
    finalise,
    writes: () => writes,
    intercept: (fn: () => void) => {
      beforeRun = fn
    },
    close() {
      current.close()
      meta.close()
    },
  }
}

describe('publication completion', () => {
  test('publishing an API composition also completes its deferred geometry companions', async () => {
    const f = fixture()
    try {
      f.add('division')
      f.add('area', { family: 'divisionArea' })
      f.add('boundary', { family: 'divisionBoundary' })
      await f.finalise({ publishedFamilies: ['divisions'], snapshotIds: ['division'] })
      expect(f.writes()).toBe(3)
    } finally {
      f.close()
    }
  })

  test('Statistics bootstrap and scoped repair prepare geometry without requiring unrelated families', async () => {
    const f = fixture()
    try {
      f.add('area', { family: 'divisionArea' })
      f.selected.place.add('not-yet-ingested')
      f.selected.address.add('not-yet-ingested')
      await f.finalise({ publishedFamilies: ['stats'] })
      expect(f.writes()).toBe(1)
      await f.finalise({ publishedFamilies: ['stats'] })
      expect(f.writes()).toBe(1)
    } finally {
      f.close()
    }
  })

  test('a family publication does not require unrelated families to have been ingested', async () => {
    const f = fixture()
    try {
      f.add('division')
      f.selected.place.add('not-yet-ingested')
      await f.finalise({ publishedFamilies: ['divisions'], snapshotIds: [] })
      expect(f.writes()).toBe(1)
    } finally {
      f.close()
    }
  })

  test('serves completed empty snapshots and performs no writes on an unchanged reconciliation', async () => {
    const f = fixture()
    try {
      for (const family of publicationFamilies) f.add(family, { family })
      await f.finalise()
      expect(f.writes()).toBe(6)
      await f.finalise()
      expect(f.writes()).toBe(6)
      for (const family of publicationFamilies)
        expect(
          f.current.query(`SELECT status FROM ${family}PublicationState`).get(),
        ).toEqual({ status: 'current' })
    } finally {
      f.close()
    }
  })

  test('missing or interrupted delivery cannot become ready and drafts stay gated', async () => {
    const f = fixture()
    try {
      f.add('interrupted', { prepared: false })
      f.add('draft', { status: 'draft', selected: false })
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
      expect(f.writes()).toBe(0)
      f.current.exec(
        "DELETE FROM divisionPublicationState WHERE snapshotId = 'interrupted'",
      )
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
      expect(f.writes()).toBe(0)
    } finally {
      f.close()
    }
  })

  test('a competing delivery token prevents an old finaliser certifying replaced data', async () => {
    const f = fixture()
    try {
      f.add('snapshot')
      f.intercept(() =>
        f.current.exec(
          `UPDATE divisionPublicationState SET publicationToken = 'replacement', preparedAt = NULL`,
        ),
      )
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
      expect(
        f.current
          .query('SELECT status, preparedAt FROM divisionPublicationState')
          .get(),
      ).toEqual({ status: 'publishing', preparedAt: null })
    } finally {
      f.close()
    }
  })

  test('replacement gates one stable scope until its completed receipt is published', async () => {
    const f = fixture()
    try {
      f.add('old', { selected: false, receipt: false, lineage: 'scope' })
      f.add('new', { prepared: false, lineage: 'scope' })
      f.meta.exec("UPDATE snapshots SET parentSnapshotId='old' WHERE id='new'")
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
      expect(
        f.current
          .query(
            "SELECT snapshotId, status FROM divisionPublicationState WHERE scopeId='scope'",
          )
          .get(),
      ).toEqual({ snapshotId: 'new', status: 'publishing' })
      f.current.exec(
        "UPDATE divisionPublicationState SET preparedAt='complete' WHERE snapshotId='new'",
      )
      await f.finalise()
      expect(
        f.current
          .query('SELECT snapshotId, status FROM divisionPublicationState')
          .all(),
      ).toEqual([{ snapshotId: 'new', status: 'current' }])
    } finally {
      f.close()
    }
  })

  test('finalisation preserves independent scopes and active deliveries for guarded cleanup', async () => {
    const f = fixture()
    try {
      f.add('old', { current: true, selected: false })
      f.add('selected')
      f.add('future', { selected: false })
      f.add('independent', { selected: false, current: true })
      f.add('active', { selected: false, prepared: false })
      f.meta.exec("UPDATE snapshots SET parentSnapshotId='old' WHERE id='selected'")
      f.meta.exec("UPDATE snapshots SET parentSnapshotId='selected' WHERE id='future'")
      await f.finalise()
      expect(
        f.current
          .query('SELECT snapshotId FROM divisionPublicationState ORDER BY snapshotId')
          .all(),
      ).toEqual(
        ['active', 'future', 'independent', 'old', 'selected'].map(snapshotId => ({
          snapshotId,
        })),
      )
    } finally {
      f.close()
    }
  })

  test('a pinned geometry revision needs a ready selected replacement in the exact same scope', async () => {
    const f = fixture()
    try {
      f.add('old', { family: 'divisionArea', lineage: 'geometry', receipt: false })
      f.add('new', { family: 'divisionArea', lineage: 'geometry', prepared: false })
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
      f.current.exec(
        "UPDATE divisionAreaPublicationState SET preparedAt='complete' WHERE snapshotId='new'",
      )
      await f.finalise()
      expect(
        f.current
          .query('SELECT snapshotId, status FROM divisionAreaPublicationState')
          .all(),
      ).toEqual([{ snapshotId: 'new', status: 'current' }])
      f.meta.exec("UPDATE snapshots SET cohortKey='2025' WHERE id='old'")
      await expect(f.finalise()).rejects.toThrow('complete delivery receipts')
    } finally {
      f.close()
    }
  })
})
