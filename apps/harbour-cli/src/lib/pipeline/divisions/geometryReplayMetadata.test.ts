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
import {
  generateGeometryReplaySql,
  geometryBuildUpsertSql,
} from './processLocalDivisionGeometrySqlUploadReplay.ts'
import { MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES } from './processLocalDivisionGeometrySqlUploadConfig.ts'
import {
  AUDIT_MAX_BLOB_BYTES,
  decodeAuditChunkParts,
  encodeAuditGroup,
  type AuditChunk,
  type AuditSummary,
} from '@repo/core/pipeline/db/processingActionCodec.ts'

const tables = {
  snapshotLineages: 'id TEXT PRIMARY KEY, variant TEXT, versionHash TEXT',
  snapshots:
    'id TEXT PRIMARY KEY, snapshotLineageId TEXT REFERENCES snapshotLineages(id), status TEXT, geometryStatus TEXT, updatedAt TEXT',
  snapshotResourceReleases:
    'snapshotId TEXT REFERENCES snapshots(id), resourceReleaseId TEXT, selectionMode TEXT, PRIMARY KEY(snapshotId,resourceReleaseId)',
  snapshotRecipes: 'id TEXT PRIMARY KEY, versionHash TEXT',
  snapshotRecipeInputs:
    'snapshotRecipeId TEXT REFERENCES snapshotRecipes(id), datasetId TEXT, PRIMARY KEY(snapshotRecipeId,datasetId)',
  snapshotAssemblies:
    'id TEXT PRIMARY KEY, snapshotId TEXT REFERENCES snapshots(id), snapshotRecipeId TEXT REFERENCES snapshotRecipes(id), status TEXT, anchorReleaseId TEXT',
  snapshotDependencies:
    'snapshotId TEXT REFERENCES snapshots(id), dependencySnapshotId TEXT REFERENCES snapshots(id), role TEXT, PRIMARY KEY(snapshotId,role)',
  releaseShardAssignments:
    'resourceReleaseId TEXT, dataShardId TEXT, PRIMARY KEY(resourceReleaseId,dataShardId)',
  snapshotShardAssignments:
    'snapshotId TEXT REFERENCES snapshots(id), dataShardId TEXT, PRIMARY KEY(snapshotId,dataShardId)',
  releaseProcessingActions:
    'id TEXT PRIMARY KEY, resourceReleaseId TEXT, action TEXT, mode TEXT, generation TEXT, decisionCount INTEGER, affectedRecordCount INTEGER, createdAt TEXT, updatedAt TEXT',
  releaseProcessingActionChunks:
    'id TEXT PRIMARY KEY, resourceReleaseId TEXT, actionId TEXT, generation TEXT, firstOrdinal INTEGER, decisionCount INTEGER, part INTEGER, parts INTEGER, encoding TEXT, checksum TEXT, payload BLOB CHECK(length(payload)<=32768)',
  stats:
    'id TEXT PRIMARY KEY, resourceReleaseId TEXT, apiReleaseSetId TEXT, category TEXT, measure TEXT, unit TEXT, value REAL, dimension TEXT, dimensionValue TEXT, createdAt TEXT, updatedAt TEXT',
}

function schema(db: Database) {
  db.exec('PRAGMA foreign_keys=ON')
  for (const [table, columns] of Object.entries(tables))
    db.exec(`CREATE TABLE "${table}"(${columns})`)
}

async function populate(db: Database) {
  db.exec(`INSERT INTO releaseShardAssignments VALUES('release','history'),('release','source');
    INSERT INTO stats VALUES('count','release',NULL,'divisionArea','count','records',12,NULL,NULL,'first','first');`)
  await updateReport(db, 'first', 12)
  for (const variant of ['exact', 'simplified'])
    db.exec(`INSERT INTO snapshotLineages VALUES('${variant}','${variant}','lineage-hash');
      INSERT INTO snapshots VALUES('${variant}','${variant}','draft','complete','first');
      INSERT INTO snapshotResourceReleases VALUES('${variant}','release','contributed_geometry');
      INSERT INTO snapshotRecipes VALUES('${variant}','recipe-hash');
      INSERT INTO snapshotRecipeInputs VALUES('${variant}','dataset');
      INSERT INTO snapshotAssemblies VALUES('${variant}','${variant}','${variant}','selected',NULL);
      INSERT INTO snapshotShardAssignments VALUES('${variant}','history');`)
  db.exec(
    "INSERT INTO snapshotDependencies VALUES ('simplified','lookup','divisionArea')",
  )
}

async function updateReport(
  db: Database,
  generation: string,
  affectedRecordCount: number,
) {
  const summary: AuditSummary = {
    id: 'normalise',
    resourceReleaseId: 'release',
    action: 'normalise',
    mode: 'automatic',
    generation,
    decisionCount: 1,
    affectedRecordCount,
    createdAt: 'first',
    updatedAt: generation,
  }
  const chunks = await encodeAuditGroup(summary, [
    {
      action: summary.action,
      mode: summary.mode,
      affectedRecordCount,
      summary: 'Normalised source geometry',
      evidence: { release: 'release', generation },
    },
  ])
  executeNativeSqlStatements(
    db,
    geometryBuildUpsertSql('releaseProcessingActions', [summary]),
  )
  executeNativeSqlStatements(
    db,
    geometryBuildUpsertSql('releaseProcessingActionChunks', chunks),
  )
}

async function report(db: Database) {
  const chunks = db
    .query<AuditChunk, []>(`SELECT chunk.* FROM releaseProcessingActionChunks chunk
    JOIN releaseProcessingActions action ON action.id=chunk.actionId AND action.generation=chunk.generation
    ORDER BY chunk.firstOrdinal,chunk.part`)
    .all()
  return decodeAuditChunkParts(chunks)
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
    for (const db of [local, remote])
      db.exec(
        "INSERT INTO snapshots VALUES ('lookup',NULL,'published','complete','first')",
      )
    await populate(local)
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
        expect((changes(remote) ?? 0) - before).toBe(
          (variant === order[0] ? 12 : 7) + (variant === 'simplified' ? 1 : 0),
        )
        const after = changes(remote)
        executeNativeSqlStatements(remote, sql)
        expect(changes(remote)).toBe(after)
      }
      expect(contents(remote)).toEqual(contents(local))
      expect(await report(remote)).toEqual(await report(local))

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
    remote.exec(`CREATE TRIGGER interrupted_variant BEFORE INSERT ON snapshotResourceReleases
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
    expect((changes(remote) ?? 0) - beforeResume).toBe(6)
    expect(contents(remote)).toEqual(contents(local))

    await updateReport(local, 'second', 13)
    local.exec(`UPDATE stats SET value=13,dimension='type',dimensionValue='land';
      UPDATE snapshotResourceReleases SET selectionMode='verified_identical_geometry' WHERE snapshotId='simplified';
      UPDATE snapshotAssemblies SET anchorReleaseId='release' WHERE snapshotId='simplified';`)
    const beforeChanges = changes(remote) ?? 0
    executeNativeSqlStatements(remote, await capture('simplified'))
    expect((changes(remote) ?? 0) - beforeChanges).toBe(5)
    expect(contents(remote)).toEqual(contents(local))
    expect(await report(remote)).toEqual(await report(local))

    local.exec(`UPDATE releaseProcessingActions SET updatedAt='recovered';
      UPDATE stats SET dimension=NULL,dimensionValue=NULL;
      UPDATE snapshots SET status='published',updatedAt='published' WHERE id='exact';
      UPDATE snapshotAssemblies SET status='completed' WHERE snapshotId='exact';`)
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

test('oversized metadata replay retains complete content when the existing chunk placeholder matches', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE testPayloads(id TEXT PRIMARY KEY,snapshotId TEXT,payload TEXT);
    INSERT INTO testPayloads VALUES('run','snapshot','');`)
  const row = {
    id: 'run',
    snapshotId: 'snapshot',
    payload: JSON.stringify({
      evidence: '香港'.repeat(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES),
    }),
  }
  try {
    const sql = geometryBuildUpsertSql('testPayloads', [row], {
      skipUnchanged: true,
    })
    for (const statement of sql.split('\n'))
      expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    executeNativeSqlStatements(db, sql)
    expect(db.query('SELECT * FROM testPayloads').get()).toEqual(row)
    executeNativeSqlStatements(db, sql)
    expect(db.query('SELECT * FROM testPayloads').get()).toEqual(row)
  } finally {
    db.close()
  }
})

test('maximum-size audit chunks skip identical BLOBs and replay changed evidence', () => {
  const db = new Database(':memory:')
  schema(db)
  const row: AuditChunk = {
    id: 'chunk',
    resourceReleaseId: 'release',
    actionId: 'action',
    generation: 'generation',
    firstOrdinal: 0,
    decisionCount: 1,
    part: 0,
    parts: 1,
    encoding: 'gzip-json-v1',
    checksum: 'checksum',
    payload: new Uint8Array(AUDIT_MAX_BLOB_BYTES).fill(0xab),
  }
  const replay = () => {
    const sql = geometryBuildUpsertSql('releaseProcessingActionChunks', [row], {
      skipUnchanged: true,
    })
    expect(Buffer.byteLength(sql)).toBeLessThanOrEqual(
      MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
    )
    executeNativeSqlStatements(db, sql)
  }
  try {
    replay()
    expect(changes(db)).toBe(1)
    replay()
    expect(changes(db)).toBe(1)
    row.payload[0] = 0xcd
    row.checksum = 'changed'
    replay()
    expect(changes(db)).toBe(2)
    expect(db.query('SELECT * FROM releaseProcessingActionChunks').get()).toEqual(row)
    replay()
    expect(changes(db)).toBe(2)
  } finally {
    db.close()
  }
})
