import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveShardBindingName } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { withSqlDeliveryCapture } from '../local/sqlDeliveryCapture.ts'
import { executeNativeSqlStatements } from '../local/nativeSqlStatements.ts'
import { replayGeometryIntoRemote } from './processLocalDivisionGeometrySqlUploadReplay.ts'

for (const sourceName of ['overture', 'hkgov-censtatd'] as const)
  test(`remote geometry capture retains ${sourceName} closures and derivative versions`, async () => {
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
          'CREATE TABLE divisionAreas(snapshotId,id,geometry,PRIMARY KEY(snapshotId,id));',
        )
      for (const db of [local[historyBinding], remote.history])
        db?.exec(
          "CREATE TABLE divisionAreas(snapshotId,id,versionHash,isCurrent,updatedAt,geometry,PRIMARY KEY(id,versionHash)); INSERT INTO divisionAreas VALUES('old','changed','v1',1,'old',X'00FF'),('old','removed','v1',1,'old',X'01'),('other','unrelated','v1',1,'old',X'02'); CREATE TABLE snapshotVersionChanges(snapshotId,recordType,recordId,operation,PRIMARY KEY(snapshotId,recordType,recordId));",
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
        "INSERT INTO divisionAreas VALUES('new','changed',X'AAFF')",
      )
      local[historyBinding]?.exec(
        "UPDATE divisionAreas SET isCurrent=0,updatedAt='new' WHERE id IN ('changed','removed'); INSERT INTO divisionAreas VALUES('new','changed','v2',1,'new',X'AAFF'); INSERT INTO snapshotVersionChanges VALUES('new','divisionArea','changed','upsert'),('new','divisionArea','removed','delete');",
      )
      local[sourceBinding]?.exec(
        `UPDATE "${sourceTable}" SET isCurrent=0,validToRelease='new-code',updatedAt='new'; INSERT INTO "${sourceTable}" VALUES('new-release','changed','v2',1,NULL,'new',X'AAFF');`,
      )
      if (sourceName === 'hkgov-censtatd')
        local[sourceBinding]?.exec(
          "UPDATE hkgovCenstatdDivisionAreaDerivatives SET isCurrent=0,validToRelease='new-code',updatedAt='new' WHERE inputVersionHash='exact'; INSERT INTO hkgovCenstatdDivisionAreaDerivatives VALUES('new-release','changed','exact','simplified','d2',1,NULL,'new');",
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
          replayGeometryIntoRemote(
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
          ),
      )
      for (let repeat = 0; repeat < 2; repeat++)
        for (const payload of payloads) {
          const db = remote[payload.target as keyof typeof remote]
          if (db) executeNativeSqlStatements(db, payload.sql)
        }
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
