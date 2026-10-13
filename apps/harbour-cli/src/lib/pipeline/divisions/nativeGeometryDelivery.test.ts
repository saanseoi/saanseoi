import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase.ts'
import {
  nativeGeometryDeliveryPhase,
  readNativeGeometryVersion,
  writeGeometryRowsDurably,
} from './nativeGeometryDelivery.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'

test('uses cohort-specific delivery phases for annual snapshots in one release', () => {
  expect(
    nativeGeometryDeliveryPhase('divisionArea', undefined, '2016', '2026-Q2'),
  ).toBe('native-geometry-divisionarea-exact-2016')
  expect(
    nativeGeometryDeliveryPhase('divisionArea', 'simplified', '2025', '2026-Q2'),
  ).toBe('native-geometry-divisionarea-simplified-2025')
  expect(
    nativeGeometryDeliveryPhase('divisionArea', undefined, '2026', '2026-Q2'),
  ).toBe('native-geometry-divisionarea-exact')
})

test('uses payload-specific phases when a source release is rebuilt', () => {
  expect(
    nativeGeometryDeliveryPhase(
      'divisionArea',
      undefined,
      '2026-09-01.4',
      '2026-09-01.4',
      'a'.repeat(64),
    ),
  ).toBe('native-geometry-divisionarea-exact-aaaaaaaaaaaaaaaa')
})

for (const sourceKind of ['overture', 'saanseoi'] as const)
  for (const target of ['local', 'preview'] as const)
    test(`${sourceKind}: ${target} geometry planning resumes membership changes and source closures without mutating retained geometry`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'native-geometry-'))
      const files = {
        DB_CURRENT: join(root, 'current.sqlite'),
        DB_HISTORY: join(root, 'history.sqlite'),
        DB_SOURCE: join(root, 'source.sqlite'),
        DB_META: join(root, 'meta.sqlite'),
      }
      const current = new Database(files.DB_CURRENT)
      const history = new Database(files.DB_HISTORY)
      const source = new Database(files.DB_SOURCE)
      const meta = new Database(files.DB_META)
      meta.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY,parentSnapshotId TEXT);
      CREATE TABLE dataShards(id TEXT PRIMARY KEY,bindingName TEXT);
      CREATE TABLE snapshotShardAssignments(snapshotId TEXT,dataShardId TEXT);
      INSERT INTO snapshots VALUES('old',NULL);
      INSERT INTO dataShards VALUES('history','DB_HISTORY');
      INSERT INTO snapshotShardAssignments VALUES('old','history');`)
      const sourceTable =
        sourceKind === 'saanseoi' ? 'ssDivisionArea' : 'overtureDivisionAreas'
      const resourceReleaseId = `native-geometry-test-${crypto.randomUUID()}`
      const historyDb = drizzle({ client: history, schema: historySchema })
      const context = {
        currentDb: drizzle({ client: current, schema: currentSchema }),
        historyDb,
        historyTargets: [{ bindingName: 'DB_HISTORY', db: historyDb }],
        metaDb: drizzle({ client: meta }),
        sourceDb: drizzle({ client: source, schema: sourceSchema }),
        currentBinding: createLocalExecBinding(current, 'DB_CURRENT'),
        historyBinding: createLocalExecBinding(history, 'DB_HISTORY'),
        sourceBinding: createLocalExecBinding(source, 'DB_SOURCE'),
        state: { target, files, dbCacheDir: root },
      } as unknown as LocalAddressDbContext
      const directory = sqlDeliveryPhaseDirectory({
        context,
        resourceReleaseId,
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
          result.canonical.id = id
          return result
        }
        const version = {
          source: sourceKind,
          variant: sourceKind,
          resourceReleaseId,
          releaseCode: 'dr-hk-overture-division-area-2026-02-18.0',
          sourceVersion: '2026-02-18.0',
          snapshotId: 'new',
          snapshotLineageId: 'geometry-lineage',
          parentSnapshotId: 'old',
          cohortKey: '2026',
        }
        await writeGeometryRows(
          context,
          'divisionArea',
          [row('changed', 115), row('removed', 115)],
          {
            ...version,
            resourceReleaseId: 'old',
            releaseCode: 'dr-hk-overture-division-area-2026-01-21.0',
            sourceVersion: '2026-01-21.0',
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
        expect(
          current
            .query(
              "SELECT status, preparedAt FROM divisionAreaPublicationState WHERE snapshotId='new'",
            )
            .get(),
        ).toEqual({ status: 'publishing', preparedAt: null })
        expect(
          await readNativeGeometryVersion(context, resourceReleaseId, 'divisionArea'),
        ).toEqual(version)
        expect(await completeSqlDeliveryRelease(root, resourceReleaseId)).toBe(false)
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
          current
            .query(
              "SELECT status, preparedAt IS NOT NULL AS prepared FROM divisionAreaPublicationState WHERE snapshotId='new'",
            )
            .get(),
        ).toEqual({ status: 'publishing', prepared: 1 })
        expect(
          history
            .query(
              "SELECT count(*) AS n FROM divisionAreas WHERE sourceReleaseId='old' AND isCurrent=1",
            )
            .get(),
        ).toEqual({ n: 2 })
        expect(
          source
            .query(
              `SELECT count(*) AS n FROM ${sourceTable} WHERE resourceReleaseId='old' AND validFromRelease='2026-01-21.0' AND validToRelease='2026-02-18.0'`,
            )
            .get(),
        ).toEqual({ n: 2 })
        expect(
          source
            .query(
              `SELECT count(*) AS n FROM ${sourceTable} WHERE resourceReleaseId=? AND validFromRelease=? AND validToRelease IS NULL`,
            )
            .get(resourceReleaseId, '2026-02-18.0'),
        ).toEqual({ n: 2 })
        expect(
          history
            .query(
              "SELECT count(*) AS n FROM historyEvents WHERE snapshotId='new' AND operation='delete' AND recordId='removed'",
            )
            .get(),
        ).toEqual({ n: 1 })
        expect(
          source
            .query(
              `SELECT count(*) AS n FROM ${sourceTable} WHERE resourceReleaseId='old' AND isCurrent=1`,
            )
            .get(),
        ).toEqual({ n: 0 })
        expect(
          current
            .query('SELECT count(*) AS n FROM divisionAreas WHERE snapshotId=?')
            .get(JSON.stringify(['geometry-lineage', '2026'])),
        ).toEqual({ n: 2 })
        const again = await writeGeometryRowsDurably(
          context,
          'divisionArea',
          rows,
          version,
        )
        expect(again).toEqual(result)
        expect(await completeSqlDeliveryRelease(root, resourceReleaseId)).toBe(true)
        // Identical records can be materialised into a new snapshot revision.
        // Its delivery must not collide with the completed predecessor's plan.
        meta.exec(
          "INSERT INTO snapshots VALUES('new','old'); INSERT INTO snapshotShardAssignments VALUES('new','history')",
        )
        const revision = await writeGeometryRowsDurably(context, 'divisionArea', rows, {
          ...version,
          snapshotId: 'revision',
          parentSnapshotId: 'new',
        })
        expect(revision.churn).toMatchObject({
          count: 2,
          unchanged: 2,
          added: 0,
          changed: 0,
          removed: 0,
        })
        expect(
          current
            .query(
              'SELECT snapshotId FROM divisionAreaPublicationState WHERE scopeId=?',
            )
            .get(JSON.stringify(['geometry-lineage', '2026'])),
        ).toEqual({ snapshotId: 'revision' })
        expect(await completeSqlDeliveryRelease(root, resourceReleaseId)).toBe(true)
        if (sourceKind === 'overture') {
          meta.exec(
            "INSERT INTO snapshots VALUES('revision','new'); INSERT INTO snapshotShardAssignments VALUES('revision','history')",
          )
          // A -> B -> A, including a removed record returning with identical content.
          const recurrence = {
            ...version,
            resourceReleaseId: `${resourceReleaseId}-recurrence`,
            sourceVersion: '2026-03-18.0',
            snapshotId: 'recurrence',
            parentSnapshotId: 'revision',
          }
          const original = [row('changed', 115), row('removed', 115)]
          await writeGeometryRowsDurably(context, 'divisionArea', original, recurrence)
          expect(
            source
              .query(
                `SELECT validFromRelease, validToRelease FROM ${sourceTable} WHERE sourceRecordId='changed' ORDER BY validFromRelease`,
              )
              .all(),
          ).toEqual([
            { validFromRelease: '2026-01-21.0', validToRelease: '2026-02-18.0' },
            { validFromRelease: '2026-02-18.0', validToRelease: '2026-03-18.0' },
            { validFromRelease: '2026-03-18.0', validToRelease: null },
          ])
          expect(
            source
              .query(
                `SELECT COUNT(*) AS n FROM ${sourceTable} WHERE sourceRecordId='removed'`,
              )
              .get(),
          ).toEqual({ n: 2 })
          expect(
            await completeSqlDeliveryRelease(root, recurrence.resourceReleaseId),
          ).toBe(true)
          meta.exec(
            "INSERT INTO snapshots VALUES('recurrence','revision'); INSERT INTO snapshotShardAssignments VALUES('recurrence','history')",
          )
          await writeGeometryRowsDurably(context, 'divisionArea', original, {
            ...recurrence,
            resourceReleaseId: `${resourceReleaseId}-unchanged`,
            sourceVersion: '2026-04-15.0',
            snapshotId: 'unchanged',
            parentSnapshotId: 'recurrence',
          })
          expect(
            source
              .query(
                `SELECT COUNT(*) AS n FROM ${sourceTable} WHERE sourceRecordId='changed'`,
              )
              .get(),
          ).toEqual({ n: 3 })
          expect(
            source
              .query(
                `SELECT COUNT(DISTINCT versionHash) AS n FROM ${sourceTable} WHERE sourceRecordId='changed'`,
              )
              .get(),
          ).toEqual({ n: 2 })
        }
      } finally {
        current.close()
        history.close()
        source.close()
        meta.close()
        await rm(root, { recursive: true, force: true })
        await rm(dirname(directory), { recursive: true, force: true })
        await rm(`${dirname(directory)}-recurrence`, { recursive: true, force: true })
        await rm(`${dirname(directory)}-unchanged`, { recursive: true, force: true })
      }
    })

test('canonical replacement retains only real publisher geometry and resolves it to the replacement', async () => {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const source = new Database(':memory:')
  try {
    for (const [db, family] of [
      [current, 'current'],
      [history, 'history'],
      [source, 'source'],
    ] as const)
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations', family),
        ),
      )
    const makeRow = (id: string, edge: number) => {
      const row = normaliseDivisionAreaGeometryRow(
        {
          id,
          division_id: 'kowloon-city',
          class: 'land',
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
      if (!row) throw new Error('Missing test geometry')
      row.canonical.id = id
      return row
    }
    const publisher = makeRow('publisher-area', 115)
    const canonical = makeRow('district-union', 116)
    await writeGeometryRows(
      {
        currentDb: drizzle({ client: current, schema: currentSchema }),
        historyDb: drizzle({ client: history, schema: historySchema }),
        sourceDb: drizzle({ client: source, schema: sourceSchema }),
      } as unknown as LocalAddressDbContext,
      'divisionArea',
      [canonical],
      {
        source: 'overture',
        variant: 'overture',
        resourceReleaseId: 'release',
        releaseCode: 'release',
        sourceVersion: '2026-01-21.0',
        snapshotId: 'snapshot',
        snapshotLineageId: 'geometry-lineage',
        parentSnapshotId: null,
        cohortKey: '2026',
        publisherRows: [publisher],
      },
    )
    expect(
      source.query('SELECT sourceRecordId FROM overtureDivisionAreas').all(),
    ).toEqual([{ sourceRecordId: 'publisher-area' }])
    expect(current.query('SELECT id FROM divisionAreas').all()).toEqual([
      { id: 'district-union' },
    ])
    expect(publisher.canonical.geometry).not.toEqual(canonical.canonical.geometry)
  } finally {
    current.close()
    history.close()
    source.close()
  }
})
