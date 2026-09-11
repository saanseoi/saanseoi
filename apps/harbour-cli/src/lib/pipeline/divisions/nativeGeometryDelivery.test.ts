import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'
import {
  readNativeGeometryVersion,
  writeGeometryRowsDurably,
} from './nativeGeometryDelivery.ts'

test('native geometry resumes exact mutations including old history/source closures and retained churn', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-geometry-'))
  const files = {
    DB_CURRENT: join(root, 'current.sqlite'),
    DB_HISTORY: join(root, 'history.sqlite'),
    DB_SOURCE: join(root, 'source.sqlite'),
  }
  const current = new Database(files.DB_CURRENT)
  const history = new Database(files.DB_HISTORY)
  const source = new Database(files.DB_SOURCE)
  const releaseId = `native-geometry-test-${crypto.randomUUID()}`
  const context = {
    currentDb: drizzle({ client: current, schema: currentSchema }),
    historyDb: drizzle({ client: history, schema: historySchema }),
    sourceDb: drizzle({ client: source, schema: sourceSchema }),
    currentBinding: createLocalExecBinding(current, 'DB_CURRENT'),
    historyBinding: createLocalExecBinding(history, 'DB_HISTORY'),
    sourceBinding: createLocalExecBinding(source, 'DB_SOURCE'),
    state: { target: 'local', files, dbCacheDir: root },
  } as unknown as LocalAddressDbContext
  const directory = sqlDeliveryPhaseDirectory({
    context,
    releaseId,
    phase: 'native-geometry-divisionarea-exact',
    inputs: {},
  })
  try {
    for (const [db, family] of [
      [current, 'current'],
      [history, 'history'],
      [source, 'source'],
    ] as const)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    const row = (id: string, edge: number) => {
      const result = normaliseDivisionAreaGeometryRow(
        {
          id,
          class: 'land',
          division_id: 'division',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [114, 22],
                [edge, 22],
                [edge, 23],
                [114, 22],
              ],
            ],
          },
        },
        'overture',
      )
      if (!result) throw new Error('Invalid geometry fixture')
      return result
    }
    const version = {
      source: 'overture' as const,
      variant: 'overture',
      releaseId,
      releaseCode: 'new',
      snapshotId: 'new',
      parentSnapshotId: 'old',
      cohortKey: '2026',
    }
    await writeGeometryRows(
      context,
      'divisionArea',
      [row('changed', 115), row('removed', 115)],
      {
        ...version,
        releaseId: 'old',
        releaseCode: 'old',
        snapshotId: 'old',
        parentSnapshotId: null,
      },
    )
    let triggerCreated = false
    const rows = [row('changed', 116), row('added', 116)]
    await expect(
      writeGeometryRowsDurably(context, 'divisionArea', rows, version, label => {
        // Installed after backup: preparation succeeds, but live replay is interrupted.
        if (!triggerCreated && label === 'write source rows') {
          history.exec(
            "CREATE TRIGGER interrupt_geometry BEFORE INSERT ON divisionAreas BEGIN SELECT RAISE(ABORT, 'geometry interrupted'); END",
          )
          triggerCreated = true
        }
      }),
    ).rejects.toThrow('geometry interrupted')
    expect(triggerCreated).toBe(true)
    expect(await readNativeGeometryVersion(context, releaseId, 'divisionArea')).toEqual(
      version,
    )
    expect(await completeSqlDeliveryRelease(root, releaseId)).toBe(false)
    history.exec('DROP TRIGGER interrupt_geometry')
    const result = await writeGeometryRowsDurably(
      context,
      'divisionArea',
      rows,
      version,
      () => {
        throw new Error('must not regenerate')
      },
    )
    expect(result.churn).toMatchObject({
      added: 1,
      changed: 1,
      removed: 1,
      unchanged: 0,
      count: 2,
    })
    expect(result.churn.byType).toBeInstanceOf(Map)
    expect(
      history
        .query(
          "SELECT count(*) AS n FROM divisionAreas WHERE sourceReleaseId='old' AND isCurrent=1",
        )
        .get(),
    ).toEqual({ n: 0 })
    expect(
      source
        .query(
          "SELECT count(*) AS n FROM overtureDivisionAreas WHERE releaseId='old' AND validToRelease='new'",
        )
        .get(),
    ).toEqual({ n: 2 })
    expect(
      history
        .query(
          "SELECT count(*) AS n FROM snapshotVersionChanges WHERE snapshotId='new' AND operation='delete' AND recordId='removed'",
        )
        .get(),
    ).toEqual({ n: 1 })
    expect(
      source
        .query(
          "SELECT count(*) AS n FROM overtureDivisionAreas WHERE releaseId='old' AND isCurrent=1",
        )
        .get(),
    ).toEqual({ n: 0 })
    expect(
      current
        .query("SELECT count(*) AS n FROM divisionAreas WHERE snapshotId='new'")
        .get(),
    ).toEqual({ n: 2 })
    const again = await writeGeometryRowsDurably(context, 'divisionArea', rows, version)
    expect(again).toEqual(result)
    expect(await completeSqlDeliveryRelease(root, releaseId)).toBe(true)
  } finally {
    current.close()
    history.close()
    source.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(directory), { recursive: true, force: true })
  }
})
