import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { withSqlDeliveryCapture } from '../local/sqlDeliveryCapture.ts'
import { captureResolvedSqlPlan } from '../local/resolvedSqlPlan.ts'
import { executeNativeSqlStatements } from '../local/nativeSqlStatements.ts'
import type { NetStatement } from '../local/netSqlitePlanTypes.ts'
import { generateGeometryReplaySql } from './processLocalDivisionGeometrySqlUploadReplay.ts'

const tables = {
  snapshotLineages: 'id TEXT PRIMARY KEY, variant TEXT, versionHash TEXT',
  snapshots:
    'id TEXT PRIMARY KEY, snapshotLineageId TEXT REFERENCES snapshotLineages(id), status TEXT, geometryStatus TEXT, updatedAt TEXT',
  snapshotSources:
    'snapshotId TEXT REFERENCES snapshots(id), resourceReleaseId TEXT, selectionMode TEXT, PRIMARY KEY(snapshotId,resourceReleaseId)',
  snapshotAssembly: 'id TEXT PRIMARY KEY, versionHash TEXT',
  snapshotAssemblySources:
    'snapshotAssemblyId TEXT REFERENCES snapshotAssembly(id), datasetId TEXT, PRIMARY KEY(snapshotAssemblyId,datasetId)',
  snapshotAssemblyRuns:
    'id TEXT PRIMARY KEY, snapshotId TEXT REFERENCES snapshots(id), snapshotAssemblyId TEXT REFERENCES snapshotAssembly(id), status TEXT, selectionSummaryJson TEXT, anchorReleaseId TEXT',
  releaseShardAssignments:
    'releaseId TEXT, dataShardId TEXT, PRIMARY KEY(releaseId,dataShardId)',
  snapshotShardAssignments:
    'snapshotId TEXT REFERENCES snapshots(id), dataShardId TEXT, PRIMARY KEY(snapshotId,dataShardId)',
  releaseProcessingActions:
    'releaseId TEXT, action TEXT, status TEXT, error TEXT, updatedAt TEXT, PRIMARY KEY(releaseId,action)',
  releaseProcessingActionChunks:
    'releaseId TEXT, action TEXT, chunk INTEGER, status TEXT, PRIMARY KEY(releaseId,action,chunk)',
  stats: 'releaseId TEXT PRIMARY KEY, count INTEGER, properties TEXT',
}

function schema(db: Database) {
  db.exec('PRAGMA foreign_keys=ON')
  for (const [table, columns] of Object.entries(tables))
    db.exec(`CREATE TABLE "${table}"(${columns})`)
}

function populate(db: Database) {
  db.exec(`INSERT INTO releaseShardAssignments VALUES('release','history'),('release','source');
    INSERT INTO releaseProcessingActions VALUES('release','normalise','completed',NULL,'first');
    INSERT INTO releaseProcessingActionChunks VALUES('release','normalise',0,'completed');
    INSERT INTO stats VALUES('release',12,NULL);`)
  for (const variant of ['exact', 'simplified'])
    db.exec(`INSERT INTO snapshotLineages VALUES('${variant}','${variant}','lineage-hash');
      INSERT INTO snapshots VALUES('${variant}','${variant}','draft','complete','first');
      INSERT INTO snapshotSources VALUES('${variant}','release','contributed_geometry');
      INSERT INTO snapshotAssembly VALUES('${variant}','recipe-hash');
      INSERT INTO snapshotAssemblySources VALUES('${variant}','dataset');
      INSERT INTO snapshotAssemblyRuns VALUES('${variant}','${variant}','${variant}','selected','{"materialisationHash":"retained"}',NULL);
      INSERT INTO snapshotShardAssignments VALUES('${variant}','history');`)
}

function contents(db: Database) {
  return Object.fromEntries(
    Object.keys(tables).map(table => [
      table,
      db.query(`SELECT * FROM "${table}" ORDER BY 1,2`).all(),
    ]),
  )
}

function changes(db: Database) {
  return db.query<{ count: number }, []>('SELECT total_changes() AS count').get()?.count
}

async function fixture(
  run: (input: {
    local: Database
    remote: Database
    capture: (variant: 'exact' | 'simplified') => Promise<string>
    remotePath: string
  }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'geometry-meta-replay-'))
  const local = new Database(join(root, 'DB_META.sqlite'))
  const remotePath = join(root, 'remote.sqlite')
  const remote = new Database(remotePath)
  try {
    schema(local)
    schema(remote)
    populate(local)
    const context = {
      state: {
        target: 'local',
        dbCacheDir: root,
        bindings: { DB_META: { databaseId: 'meta' } },
      },
    } as unknown as LocalAddressDbContext
    const capture = async (variant: 'exact' | 'simplified') => {
      const statements: string[] = []
      await withSqlDeliveryCapture(
        async (target, bytes) => {
          expect(target.databaseId).toBe('meta')
          statements.push(new TextDecoder().decode(bytes))
        },
        () =>
          generateGeometryReplaySql(
            { remote: true, environment: 'preview' },
            context,
            {
              regionCode: 'hk',
              source: 'hkgov-pland-pu',
              sourceVersion: '2026-01',
              releaseCode: 'release-code',
              cohortKey: '2026',
              rowCount: 12,
              theme: 'divisions',
              resourceType: 'divisionArea',
              ...(variant === 'simplified' ? { transform: 'simplified' as const } : {}),
            },
            'release',
            variant,
            true,
            async (_subject, operation) => operation(),
            'prepared-hash',
            'release-code',
          ),
      )
      expect(statements).toHaveLength(1)
      return statements.join('\n')
    }
    await run({ local, remote, capture, remotePath })
  } finally {
    local.close()
    remote.close()
    await rm(root, { recursive: true, force: true })
  }
}

for (const order of [
  ['exact', 'simplified'],
  ['simplified', 'exact'],
] as const)
  test(`geometry metadata replay preserves shared rows in ${order.join(' then ')} order`, async () => {
    await fixture(async ({ local, remote, capture, remotePath }) => {
      for (const variant of order) {
        const sql = await capture(variant)
        const before = changes(remote) ?? 0
        executeNativeSqlStatements(remote, sql)
        // Seven snapshot/recipe rows per variant; five shared release rows only once.
        expect((changes(remote) ?? 0) - before).toBe(variant === order[0] ? 12 : 7)
        const after = changes(remote)
        executeNativeSqlStatements(remote, sql)
        expect(changes(remote)).toBe(after)
      }
      expect(contents(remote)).toEqual(contents(local))

      // DB_META retains SQL outside the data diff. Its emitted statements must
      // still leave an identical target untouched, while the diff reports equality.
      const sql = await capture(order[1])
      const batches: NetStatement[][] = []
      const result = await captureResolvedSqlPlan({
        targets: {
          DB_META: {
            path: remotePath,
            schema: {},
            tables: [],
            excludedTables: Object.keys(tables),
            retainSql: true,
          },
        },
        append: async (_target, bytes) => {
          batches.push(JSON.parse(new TextDecoder().decode(bytes)))
        },
        generate: async candidates => {
          candidates.DB_META?.execute(new TextEncoder().encode(sql))
        },
      })
      expect(result.mutationSummary.statements).toBe(0)
      expect(batches.length).toBeGreaterThan(0)
      const before = changes(remote)
      for (const batch of batches)
        for (const statement of batch)
          remote.query(statement.sql).run(...statement.params)
      expect(changes(remote)).toBe(before)
      expect(remote.query('PRAGMA foreign_key_check').all()).toEqual([])
    })
  })

test('geometry metadata replay resumes a partial second variant and carries real metadata changes', async () => {
  await fixture(async ({ local, remote, capture }) => {
    executeNativeSqlStatements(remote, await capture('exact'))
    const second = await capture('simplified')
    remote.exec(`CREATE TRIGGER interrupted_variant BEFORE INSERT ON snapshotSources
      WHEN NEW.snapshotId='simplified' BEGIN SELECT RAISE(ABORT,'interrupted variant'); END`)
    expect(() => executeNativeSqlStatements(remote, second)).toThrow(
      'interrupted variant',
    )
    expect(remote.query("SELECT status FROM snapshots WHERE id='exact'").get()).toEqual(
      {
        status: 'draft',
      },
    )
    remote.exec('DROP TRIGGER interrupted_variant')
    const beforeResume = changes(remote) ?? 0
    executeNativeSqlStatements(remote, second)
    expect((changes(remote) ?? 0) - beforeResume).toBe(5)
    expect(contents(remote)).toEqual(contents(local))

    local.exec(`UPDATE releaseProcessingActions SET status='error',error='retry',updatedAt='failed';
      UPDATE releaseProcessingActionChunks SET status='error';
      UPDATE stats SET count=13,properties='{"checked":true}';
      UPDATE snapshotSources SET selectionMode='verified_identical_geometry' WHERE snapshotId='simplified';
      UPDATE snapshotAssemblyRuns SET anchorReleaseId='release' WHERE snapshotId='simplified';`)
    const beforeChanges = changes(remote) ?? 0
    executeNativeSqlStatements(remote, await capture('simplified'))
    expect((changes(remote) ?? 0) - beforeChanges).toBe(5)
    expect(contents(remote)).toEqual(contents(local))

    local.exec(`UPDATE releaseProcessingActions SET status='completed',error=NULL,updatedAt='recovered';
      UPDATE releaseProcessingActionChunks SET status='completed';
      UPDATE stats SET properties=NULL;
      UPDATE snapshots SET status='published',updatedAt='published' WHERE id='exact';`)
    const beforeRecovery = changes(remote) ?? 0
    executeNativeSqlStatements(remote, await capture('exact'))
    expect((changes(remote) ?? 0) - beforeRecovery).toBe(4)
    expect(contents(remote)).toEqual(contents(local))
    const afterRecovery = changes(remote)
    executeNativeSqlStatements(remote, await capture('exact'))
    executeNativeSqlStatements(remote, await capture('simplified'))
    expect(changes(remote)).toBe(afterRecovery)
    expect(remote.query('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
