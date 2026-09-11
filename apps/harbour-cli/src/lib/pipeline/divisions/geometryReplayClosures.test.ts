import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveShardBindingName } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { withSqlDeliveryCapture } from '../local/sqlDeliveryCapture.ts'
import { executeNativeSqlStatements } from '../local/nativeSqlStatements.ts'
import {
  generateGeometryReplaySql,
  geometryBuildUpsertSql,
} from './processLocalDivisionGeometrySqlUploadReplay.ts'
import { MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES } from './processLocalDivisionGeometrySqlUploadConfig.ts'

for (const sourceName of ['overture', 'hkgov-censtatd'] as const)
  test(`remote geometry capture retains immutable ${sourceName} membership and source closures`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'geometry-closure-replay-'))
    const historyBinding = resolveShardBindingName('history', 'HK', '2026')
    const sourceBinding = resolveShardBindingName('source', 'HK', '2026')
    const local = Object.fromEntries(
      ['DB_META', 'DB_CURRENT', historyBinding, sourceBinding].map(name => [
        name,
        new Database(join(root, `${name}.sqlite`)),
      ]),
    )
    const remote = {
      current: new Database(':memory:'),
      history: new Database(':memory:'),
      source: new Database(':memory:'),
    }
    const sourceTable =
      sourceName === 'overture' ? 'overtureDivisionAreas' : 'hkgovCenstatdDivisionAreas'
    try {
      const meta = local.DB_META
      if (!meta) throw new Error('Missing meta')
      meta.exec(
        "CREATE TABLE snapshots(id,snapshotLineageId); INSERT INTO snapshots VALUES('new',NULL); CREATE TABLE snapshotLineages(id); CREATE TABLE snapshotAssemblyRuns(snapshotId,snapshotAssemblyId); CREATE TABLE snapshotAssembly(id); CREATE TABLE snapshotAssemblySources(snapshotAssemblyId); CREATE TABLE snapshotSources(snapshotId); CREATE TABLE releaseShardAssignments(releaseId); CREATE TABLE snapshotShardAssignments(snapshotId); CREATE TABLE releaseProcessingActions(releaseId); CREATE TABLE releaseProcessingActionChunks(releaseId); CREATE TABLE stats(releaseId);",
      )
      for (const db of [local.DB_CURRENT, remote.current])
        db?.exec(
          'CREATE TABLE divisionAreas(snapshotId,id,geometry,PRIMARY KEY(snapshotId,id)); CREATE TABLE divisionAreaPublicationState(scopeId PRIMARY KEY,snapshotId UNIQUE,status,publicationToken,preparedAt,createdAt,updatedAt);',
        )
      for (const db of [local[historyBinding], remote.history])
        db?.exec(
          "CREATE TABLE divisionAreas(snapshotId,id,versionHash,isCurrent,updatedAt,geometry,PRIMARY KEY(id,versionHash)); INSERT INTO divisionAreas VALUES('old','changed','v1',1,'old',X'00FF'),('old','removed','v1',1,'old',X'01'),('other','unrelated','v1',1,'old',X'02'); CREATE TABLE snapshotVersionChanges(snapshotId,recordType,recordId,operation,versionHash,PRIMARY KEY(snapshotId,recordType,recordId));",
        )
      for (const db of [local[sourceBinding], remote.source]) {
        db?.exec(
          `CREATE TABLE "${sourceTable}"(releaseId,sourceRecordId,versionHash,isCurrent,validToRelease,updatedAt,geometry,PRIMARY KEY(sourceRecordId,versionHash)); INSERT INTO "${sourceTable}" VALUES('old','changed','v1',1,NULL,'old',X'00FF'),('old','removed','v1',1,NULL,'old',X'01');`,
        )
        if (sourceName === 'hkgov-censtatd')
          db?.exec(
            "CREATE TABLE hkgovCenstatdDivisionAreaDerivatives(releaseId,sourceRecordId,inputVersionHash,transform,versionHash,isCurrent,validToRelease,updatedAt,PRIMARY KEY(sourceRecordId,inputVersionHash,transform,versionHash)); INSERT INTO hkgovCenstatdDivisionAreaDerivatives VALUES('old','changed','exact','simplified','d1',1,NULL,'old'),('other','changed','other-exact','simplified','d1',1,NULL,'old');",
          )
      }
      local.DB_CURRENT?.exec(
        "INSERT INTO divisionAreas VALUES('scope','changed',X'AAFF'),('scope','reused',X'03'); INSERT INTO divisionAreaPublicationState VALUES('scope','new','publishing','new-release','new','old','new');",
      )
      remote.current.exec(
        "INSERT INTO divisionAreas VALUES('scope','changed',X'00FF'),('scope','removed',X'01'); INSERT INTO divisionAreaPublicationState VALUES('scope','old','current','old-release','old','old','old');",
      )
      local[historyBinding]?.exec(
        "INSERT INTO divisionAreas VALUES('new','changed','v2',1,'new',X'AAFF'),('original','reused','same',1,'original',X'03'); INSERT INTO snapshotVersionChanges VALUES('new','divisionArea','changed','upsert','v2'),('new','divisionArea','reused','upsert','same'),('new','divisionArea','removed','delete',NULL);",
      )
      remote.history.exec(
        "CREATE TABLE historyMutations(operation); CREATE TRIGGER history_update AFTER UPDATE ON divisionAreas BEGIN INSERT INTO historyMutations VALUES('update'); END; CREATE TRIGGER history_delete AFTER DELETE ON divisionAreas BEGIN INSERT INTO historyMutations VALUES('delete'); END;",
      )
      local[sourceBinding]?.exec(
        `UPDATE "${sourceTable}" SET isCurrent=0,validToRelease='2026-01',updatedAt='new'; INSERT INTO "${sourceTable}" VALUES('new-release','changed','v2',1,NULL,'new',X'AAFF');`,
      )
      if (sourceName === 'hkgov-censtatd')
        local[sourceBinding]?.exec(
          "UPDATE hkgovCenstatdDivisionAreaDerivatives SET isCurrent=0,validToRelease='2026-01',updatedAt='new' WHERE inputVersionHash='exact'; INSERT INTO hkgovCenstatdDivisionAreaDerivatives VALUES('new-release','changed','exact','simplified','d2',1,NULL,'new');",
        )
      if (sourceName === 'hkgov-censtatd')
        remote.source.exec(
          "INSERT INTO hkgovCenstatdDivisionAreaDerivatives VALUES('new-release','removed','exact','simplified','stale',1,NULL,'stale')",
        )
      const payloads: Array<{ target: string; sql: string }> = []
      // Local context selects generation only; explicit capture forbids network writes.
      const context = {
        state: {
          target: 'local',
          dbCacheDir: root,
          bindings: Object.fromEntries(
            [
              ['DB_META', 'meta'],
              ['DB_CURRENT', 'current'],
              [historyBinding, 'history'],
              [sourceBinding, 'source'],
            ].map(([binding, databaseId]) => [binding, { databaseId }]),
          ),
        },
      } as unknown as LocalAddressDbContext
      await withSqlDeliveryCapture(
        async (target, bytes) => {
          payloads.push({
            target: target.databaseId ?? '',
            sql: new TextDecoder().decode(bytes),
          })
        },
        () =>
          generateGeometryReplaySql(
            { remote: true, environment: 'preview' },
            context,
            {
              regionCode: 'hk',
              source: sourceName,
              sourceVersion: '2026-01',
              releaseCode: 'new-code',
              cohortKey: '2026',
              rowCount: 1,
              theme: 'divisions',
              resourceType: 'divisionArea',
              ...(sourceName === 'hkgov-censtatd'
                ? { transform: 'simplified' as const }
                : {}),
            },
            'new-release',
            'new',
            false,
            async (_subject, operation) => operation(),
            'prepared-hash',
            'new-code',
            {
              publication: {
                table: 'divisionAreaPublicationState',
                scopeId: 'scope',
                snapshotId: 'new',
                publicationToken: 'new-release',
                timestamp: 'new',
                previous: { snapshotId: 'old', publicationToken: 'old-release' },
              },
              changedCurrentIds: ['changed', 'reused'],
              removedCurrentIds: ['removed'],
            },
          ),
      )
      for (const payload of payloads) {
        const db = remote[payload.target as keyof typeof remote]
        if (db) executeNativeSqlStatements(db, payload.sql)
      }
      expect(
        remote.current.query('SELECT * FROM divisionAreas ORDER BY id').all(),
      ).toEqual([
        { snapshotId: 'scope', id: 'changed', geometry: new Uint8Array([0xaa, 0xff]) },
        { snapshotId: 'scope', id: 'reused', geometry: new Uint8Array([0x03]) },
      ])
      expect(remote.history.query('SELECT * FROM historyMutations').all()).toEqual([])
      expect(
        remote.history
          .query(
            'SELECT recordId,operation,versionHash FROM snapshotVersionChanges ORDER BY recordId',
          )
          .all(),
      ).toEqual([
        { recordId: 'changed', operation: 'upsert', versionHash: 'v2' },
        { recordId: 'removed', operation: 'delete', versionHash: null },
        { recordId: 'reused', operation: 'upsert', versionHash: 'same' },
      ])
      const localHistory = local[historyBinding]
      const localSource = local[sourceBinding]
      if (!localHistory || !localSource) throw new Error('Missing fixture databases')
      expect(
        remote.history
          .query('SELECT * FROM divisionAreas ORDER BY id,versionHash')
          .all(),
      ).toEqual(
        localHistory.query('SELECT * FROM divisionAreas ORDER BY id,versionHash').all(),
      )
      expect(
        remote.source
          .query(`SELECT * FROM "${sourceTable}" ORDER BY sourceRecordId,versionHash`)
          .all(),
      ).toEqual(
        localSource
          .query(`SELECT * FROM "${sourceTable}" ORDER BY sourceRecordId,versionHash`)
          .all(),
      )
      if (sourceName === 'hkgov-censtatd')
        expect(
          remote.source
            .query(
              'SELECT * FROM hkgovCenstatdDivisionAreaDerivatives ORDER BY inputVersionHash,versionHash',
            )
            .all(),
        ).toEqual(
          localSource
            .query(
              'SELECT * FROM hkgovCenstatdDivisionAreaDerivatives ORDER BY inputVersionHash,versionHash',
            )
            .all(),
        )
    } finally {
      for (const db of [...Object.values(local), ...Object.values(remote)]) db.close()
      await rm(root, { recursive: true, force: true })
    }
  })

test('immutable oversized geometry replay preserves existing versions and provenance on repeat', () => {
  const db = new Database(':memory:')
  db.exec(
    "CREATE TABLE divisionAreas(snapshotId,id,versionHash,geometry,metadata,PRIMARY KEY(id,versionHash)); CREATE TABLE writes(operation); CREATE TRIGGER history_update AFTER UPDATE ON divisionAreas BEGIN INSERT INTO writes VALUES('update'); END;",
  )
  const row = {
    snapshotId: 'original',
    id: 'shared',
    versionHash: 'v1',
    geometry: new Uint8Array(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES * 2).fill(0xab),
    metadata: 'x'.repeat(MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES),
  }
  try {
    db.query('INSERT INTO divisionAreas VALUES(?,?,?,?,?)').run(
      'original',
      'shared',
      'other',
      new Uint8Array([1]),
      'other-version',
    )
    const sql = geometryBuildUpsertSql('divisionAreas', [row], { immutable: true })
    for (const statement of sql.split('\n'))
      expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(
        MAX_D1_GEOMETRY_SQL_STATEMENT_BYTES,
      )
    executeNativeSqlStatements(db, sql)
    expect(
      db.query("SELECT * FROM divisionAreas WHERE versionHash='v1'").get(),
    ).toEqual(row)
    expect(
      db
        .query("SELECT geometry,metadata FROM divisionAreas WHERE versionHash='other'")
        .get(),
    ).toEqual({ geometry: new Uint8Array([1]), metadata: 'other-version' })
    db.exec('DELETE FROM writes')
    executeNativeSqlStatements(
      db,
      geometryBuildUpsertSql('divisionAreas', [{ ...row, snapshotId: 'later' }], {
        immutable: true,
      }),
    )
    expect(
      db.query("SELECT * FROM divisionAreas WHERE versionHash='v1'").get(),
    ).toEqual(row)
    expect(db.query('SELECT * FROM writes').all()).toEqual([])
  } finally {
    db.close()
  }
})
