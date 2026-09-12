import { expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runNativeSqlDelivery } from '../pipeline/local/nativeSqlDelivery.ts'
import {
  readDeliveryPlan,
  readBoundDeliveryStatements,
  readDeliveryProgress,
} from '../pipeline/local/sqlDeliveryFiles.ts'
import { readPendingSqlDelivery } from '../pipeline/local/sqlDeliveryPending.ts'
import { verifyRollbackTerminal } from './reconstructRollback.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'
import type { NetSqlitePlanSummary } from '../pipeline/local/netSqlitePlanTypes.ts'

import { fixture } from './reconstructRollback.fixtures.ts'

test('reconstructed rollback writes only the changed locale and updates FTS while preserving unrelated scopes and rowids', async () => {
  const f = await fixture()
  try {
    const baseRows = f.current
      .query('SELECT rowid,* FROM divisions ORDER BY snapshotId')
      .all()
    const retainedLocales = f.current
      .query(
        "SELECT rowid,* FROM divisionsI18n WHERE snapshotId='other' OR locale='zh-hant' ORDER BY snapshotId,locale",
      )
      .all()
    const retainedFts = f.current
      .query(
        "SELECT rowid,* FROM divisionSearchFts WHERE scopeId='search-other' ORDER BY locale",
      )
      .all()
    const plan = await f.prepare()
    const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
    if (!terminal) throw new Error('Expected rollback completion contract')
    const summary = plan.outputs?.mutationSummary as NetSqlitePlanSummary
    expect(summary.tables.DB_CURRENT?.divisions?.updated).toBe(0)
    expect(summary.tables.DB_CURRENT?.divisionsI18n?.updated).toBe(1)
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'New Name' })
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current.query('SELECT rowid,* FROM divisions ORDER BY snapshotId').all(),
    ).toEqual(baseRows)
    expect(
      f.current
        .query(
          "SELECT rowid,* FROM divisionsI18n WHERE snapshotId='other' OR locale='zh-hant' ORDER BY snapshotId,locale",
        )
        .all(),
    ).toEqual(retainedLocales)
    expect(
      f.current
        .query(
          "SELECT rowid,* FROM divisionSearchFts WHERE scopeId='search-other' ORDER BY locale",
        )
        .all(),
    ).toEqual(retainedFts)
    expect(
      f.current
        .query(
          "SELECT nameText FROM divisionSearchFts WHERE scopeId='search-main' AND locale='en'",
        )
        .get(),
    ).toEqual({ nameText: 'Old Name' })
    expect(
      f.meta.query("SELECT status FROM releases WHERE id='release-new'").get(),
    ).toEqual({ status: 'revoked' })
    expect(f.meta.query('SELECT count(*) AS n FROM snapshots').get()).toEqual({ n: 3 })
    expect(
      f.meta
        .query(
          'SELECT apiReleaseSetId FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId=? ORDER BY apiReleaseSetId',
        )
        .all(terminal.catalogId),
    ).toEqual([{ apiReleaseSetId: 'set-old' }, { apiReleaseSetId: 'set-other' }])
    expect(f.history.query('SELECT isCurrent FROM divisions').get()).toEqual({
      isCurrent: 0,
    })
  } finally {
    await f.close()
  }
})

test('initial publication rollback removes only its own serving projection and search selection', async () => {
  const f = await fixture(false)
  try {
    const unrelated = f.current
      .query("SELECT rowid,* FROM divisions WHERE snapshotId='other'")
      .all()
    const plan = await f.prepare()
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current.query("SELECT 1 FROM divisions WHERE snapshotId='lineage'").get(),
    ).toBeNull()
    expect(
      f.current.query("SELECT rowid,* FROM divisions WHERE snapshotId='other'").all(),
    ).toEqual(unrelated)
    expect(
      f.current
        .query("SELECT 1 FROM divisionPublicationState WHERE scopeId='lineage'")
        .get(),
    ).toBeNull()
    expect(f.current.query('SELECT scopeId FROM divisionSearchScopes').all()).toEqual([
      { scopeId: 'search-other' },
    ])
    expect(
      f.current.query('SELECT DISTINCT scopeId FROM divisionSearchFts').all(),
    ).toEqual([{ scopeId: 'search-other' }])
  } finally {
    await f.close()
  }
})

test('missing exact historical content produces no delivery payload or ownership marker', async () => {
  const f = await fixture()
  try {
    f.history.exec("DELETE FROM divisionsI18n WHERE locale='en'")
    await expect(f.prepare()).rejects.toThrow('Missing exact history component')
    expect(await readDeliveryPlan(f.directory)).toBeNull()
    expect(
      (await readdir(f.directory)).filter(name => /^\d+\.(json|sql)$/.test(name)),
    ).toEqual([])
    expect(await readPendingSqlDelivery(f.root)).toBeNull()
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'New Name' })
  } finally {
    await f.close()
  }
})

test('interrupted rollback resumes the identical sealed payload after content delivery without regenerating history', async () => {
  const f = await fixture()
  try {
    const plan = await f.prepare()
    const payloads = await Promise.all(
      plan.batches.map(batch => readFile(join(f.directory, batch.file))),
    )
    const changedBatch = plan.batches.find(batch =>
      readBoundDeliveryStatements(payloads[batch.index] ?? new Uint8Array()).some(
        statement => /(?:UPDATE|INSERT INTO)\s+"divisionsI18n"/.test(statement.sql),
      ),
    )
    expect(changedBatch).toBeDefined()
    if (!changedBatch) throw new Error('Expected changed locale payload')
    await expect(
      runNativeSqlDelivery(f.directory, {
        files: f.files,
        onProgress: completed => {
          if (completed === changedBatch.index + 1)
            throw new Error('simulated interruption')
        },
      }),
    ).rejects.toThrow('simulated interruption')
    expect(
      f.current
        .query("SELECT status FROM divisionPublicationState WHERE scopeId='lineage'")
        .get(),
    ).toEqual({ status: 'publishing' })
    expect(
      f.current
        .query(
          "SELECT name FROM divisionsI18n WHERE snapshotId='lineage' AND locale='en'",
        )
        .get(),
    ).toEqual({ name: 'Old Name' })
    f.history.exec('DELETE FROM divisionsI18n')
    expect((await f.prepare()).id).toBe(plan.id)
    expect(f.generations()).toBe(1)
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, plan.outputs?.terminal as RollbackTerminal)
    expect(
      f.current
        .query(
          "SELECT nameText FROM divisionSearchFts WHERE scopeId='search-main' AND locale='en'",
        )
        .get(),
    ).toEqual({ nameText: 'Old Name' })
    expect(
      await Promise.all(
        plan.batches.map(batch => readFile(join(f.directory, batch.file))),
      ),
    ).toEqual(payloads)
    expect(
      Object.keys((await readDeliveryProgress(f.directory, plan)).local),
    ).toHaveLength(plan.batches.length)
  } finally {
    await f.close()
  }
})

test('stale publication ownership stops sealed rollback before any canonical or search mutation', async () => {
  const f = await fixture()
  try {
    await f.prepare()
    f.current.exec(
      "UPDATE divisionPublicationState SET publicationToken='intervening-publication' WHERE scopeId='lineage'",
    )
    const before = f.current
      .query('SELECT rowid,* FROM divisionsI18n ORDER BY snapshotId,locale')
      .all()
    const ftsBefore = f.current
      .query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid')
      .all()
    await expect(
      runNativeSqlDelivery(f.directory, { files: f.files }),
    ).rejects.toThrow()
    expect(
      f.current
        .query('SELECT rowid,* FROM divisionsI18n ORDER BY snapshotId,locale')
        .all(),
    ).toEqual(before)
    expect(
      f.current.query('SELECT rowid,* FROM divisionSearchFts ORDER BY rowid').all(),
    ).toEqual(ftsBefore)
    expect(
      f.current
        .query(
          "SELECT publicationToken FROM divisionPublicationState WHERE scopeId='lineage'",
        )
        .get(),
    ).toEqual({ publicationToken: 'intervening-publication' })
    expect(
      f.meta.query("SELECT status FROM releases WHERE id='release-new'").get(),
    ).toEqual({ status: 'published' })
  } finally {
    await f.close()
  }
})
