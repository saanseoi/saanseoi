import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
} from '../local/snapshotPublication.ts'
import { buildPublicationRowCountSql } from '@repo/core/pipeline/services/publication/sql.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { deliverStreetWorkflow } from './streetDelivery.ts'

test('Street delivery resumes a sealed interrupted publication and accepts empty snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'street-publication-'))
  const bindings = ['DB_CURRENT', 'DB_META', 'DB_HISTORY', 'DB_SOURCE']
  const files = Object.fromEntries(
    bindings.map(name => [name, join(root, `${name}.sqlite`)]),
  )
  const databases = Object.fromEntries(
    bindings.map(name => [name, new Database(files[name]!)]),
  )
  const current = databases.DB_CURRENT!
  const releaseId = `street-publication-${crypto.randomUUID()}`
  const context = {
    currentDb: drizzle({ client: current }),
    metaDb: drizzle({ client: databases.DB_META! }),
    historyDb: drizzle({ client: databases.DB_HISTORY! }),
    sourceDb: drizzle({ client: databases.DB_SOURCE! }),
    historyBinding: createLocalExecBinding(databases.DB_HISTORY!, 'DB_HISTORY'),
    sourceBinding: createLocalExecBinding(databases.DB_SOURCE!, 'DB_SOURCE'),
    state: { target: 'local', files, dbCacheDir: root, bindings: {} },
  } as unknown as LocalAddressDbContext
  const phaseDirectory = sqlDeliveryPhaseDirectory({
    context,
    releaseId,
    phase: 'street-data',
    inputs: {},
  })
  try {
    current.exec(
      'CREATE TABLE streets(snapshotId TEXT, id TEXT); CREATE TABLE streetPublicationState(scopeId TEXT PRIMARY KEY, snapshotId TEXT UNIQUE, publicationToken TEXT, status TEXT, preparedAt TEXT, createdAt TEXT, updatedAt TEXT);',
    )
    const publication = {
      table: 'streetPublicationState' as const,
      scopeId: 'lineage',
      snapshotId: 'snapshot',
      publicationToken: releaseId,
      timestamp: '2026-09-11',
    }
    let generated = 0
    const generate = async (copy: LocalAddressDbContext) => {
      generated += 1
      await beginSnapshotPublication(copy.currentDb, publication)
      await completeSnapshotPublication(
        copy.currentDb,
        publication,
        buildPublicationRowCountSql('streets', 'snapshot', 0),
      )
      current.exec(
        "CREATE TRIGGER interrupt_street BEFORE INSERT ON streetPublicationState BEGIN SELECT RAISE(ABORT, 'street interrupted'); END",
      )
      return { importedRows: 0, changedRows: 0, sourceRowsChanged: 0 }
    }
    await expect(
      deliverStreetWorkflow(context, releaseId, {}, generate),
    ).rejects.toThrow('street interrupted')
    expect(current.query('SELECT * FROM streetPublicationState').all()).toEqual([])
    current.exec('DROP TRIGGER interrupt_street')
    expect(await deliverStreetWorkflow(context, releaseId, {}, generate)).toEqual({
      importedRows: 0,
      changedRows: 0,
      sourceRowsChanged: 0,
    })
    expect(generated).toBe(1)
    expect(
      current.query('SELECT status, preparedAt FROM streetPublicationState').get(),
    ).toEqual({ status: 'publishing', preparedAt: '2026-09-11' })
    current.query("UPDATE streetPublicationState SET status = 'current'").run()
    await deliverStreetWorkflow(context, releaseId, {}, generate)
    expect(generated).toBe(1)
    expect(current.query('SELECT status FROM streetPublicationState').get()).toEqual({
      status: 'current',
    })
  } finally {
    for (const db of Object.values(databases)) db.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(phaseDirectory), { recursive: true, force: true })
  }
})
