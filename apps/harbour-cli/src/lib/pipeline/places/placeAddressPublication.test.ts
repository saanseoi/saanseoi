import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  insertFixtureSnapshot,
  insertSnapshotProducerFixture,
} from '../../../../../../libs/core/src/testing/snapshotFixtures'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes'
import { sqlDeliveryPhaseDirectory } from '../local/sqlDeliveryPhase'
import { ensurePlaceAddressPublication } from './placeAddressPublication'

test('restores a cleaned official dependency with evidence while preserving latest serving rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-address-dependency-'))
  const clients: Record<string, Database> = {}
  const files: Record<string, string> = {}
  const release = `place-dependency-test-${crypto.randomUUID()}`
  let delivery: string | undefined
  try {
    for (const [binding, family] of [
      ['DB_CURRENT', 'current'],
      ['DB_META', 'meta'],
      ['DB_HISTORY', 'history'],
    ] as const) {
      files[binding] = join(root, `${binding}.sqlite`)
      const db = new Database(files[binding])
      clients[binding] = db
      db.exec(
        loadMigrationSql(
          join(import.meta.dir, '../../../../../../libs/db/migrations'),
          [family],
        ),
      )
    }
    const current = clients.DB_CURRENT!
    const meta = clients.DB_META!
    for (const [id, resourceType] of [
      ['old-address', 'address'],
      ['division', 'division'],
    ] as const) {
      insertFixtureSnapshot(meta, {
        id,
        code: id,
        resourceType,
        cohortKey: '2025',
        status: 'published',
      })
      insertSnapshotProducerFixture(meta, id)
    }
    const { lineage } = meta
      .query<{ lineage: string }, []>(
        "SELECT snapshotLineageId AS lineage FROM snapshots WHERE id='old-address'",
      )
      .get()!
    meta.exec(`INSERT INTO dataShards(id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
      VALUES('history','history','hk','2025','preview','history','history','DB_HISTORY','active','hash');
      INSERT INTO snapshotShardAssignments VALUES('old-address','history');
      INSERT INTO snapshotDependencies VALUES('old-address','division','division');`)
    current.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('division','division','current','division-token','ready');
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,divisionSnapshotId) VALUES('latest-scope','latest-address','current','latest-token','ready','division');
      INSERT INTO address2d(scopeId,id,divisionSnapshotId) VALUES('latest-scope','latest-row','division');`)
    const context = {
      currentDb: createLocalHarbourDb(current),
      metaDb: createLocalHarbourDb(meta),
      historyTargets: [
        { bindingName: 'DB_HISTORY', db: createLocalHarbourDb(clients.DB_HISTORY!) },
      ],
      state: {
        target: 'local',
        files,
        dbCacheDir: root,
        bindings: Object.fromEntries(
          Object.keys(files).map(key => [key, { databaseId: key }]),
        ),
      },
    } as unknown as LocalAddressDbContext
    const input = { context, resourceReleaseId: release, snapshotId: 'old-address' }
    delivery = dirname(
      sqlDeliveryPhaseDirectory({
        ...input,
        phase: 'places-address-dependency-old-address',
        inputs: {},
      }),
    )
    await expect(ensurePlaceAddressPublication(input)).rejects.toThrow()
    expect(
      current.query('SELECT count(*) AS n FROM addressPublicationState').get(),
    ).toEqual({ n: 1 })
    const path = join(root, 'address-membership', lineage, 'old-address.json')
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(
      path,
      JSON.stringify({
        schemaVersion: 1,
        sourceVersion: '2025',
        addresses: [
          { id: 'historical-row', parentId: null, level: 'building', sourceIds: [] },
        ],
        collections: [],
        sources: [],
        aliases: [],
      }),
    )
    await expect(ensurePlaceAddressPublication(input)).rejects.toThrow()
    expect(
      current.query('SELECT count(*) AS n FROM addressPublicationState').get(),
    ).toEqual({ n: 1 })
    clients.DB_HISTORY!.exec(`INSERT INTO address2d(snapshotId,id,versionHash,isCurrent,createdAt)
      VALUES('old-address','historical-row','old-content',0,'2025-01-01');
      INSERT INTO address2dI18n(snapshotId,addressId,locale,formattedAddress,versionHash,isCurrent,createdAt)
      VALUES('old-address','historical-row','en','Historical building','old-locale',0,'2025-01-01');`)
    await ensurePlaceAddressPublication(input)
    expect(
      current
        .query(
          "SELECT publicationToken FROM addressPublicationState WHERE snapshotId='latest-address'",
        )
        .get(),
    ).toEqual({ publicationToken: 'latest-token' })
    expect(
      current
        .query("SELECT scopeId,id FROM address2d WHERE scopeId='latest-scope'")
        .all(),
    ).toEqual([{ scopeId: 'latest-scope', id: 'latest-row' }])
    expect(
      current
        .query(
          "SELECT id FROM address2d WHERE scopeId=(SELECT scopeId FROM addressPublicationState WHERE snapshotId='old-address')",
        )
        .all(),
    ).toEqual([{ id: 'historical-row' }])
    expect(
      current
        .query(
          "SELECT preparedAt IS NOT NULL AS ready,divisionSnapshotId FROM addressPublicationState WHERE snapshotId='old-address'",
        )
        .get(),
    ).toEqual({ ready: 1, divisionSnapshotId: 'division' })
    const receipts = current
      .query('SELECT * FROM addressPublicationState ORDER BY scopeId')
      .all()
    await ensurePlaceAddressPublication(input)
    expect(
      current.query('SELECT * FROM addressPublicationState ORDER BY scopeId').all(),
    ).toEqual(receipts)
    expect(current.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    for (const db of Object.values(clients)) db.close()
    await rm(root, { recursive: true, force: true })
    if (delivery) await rm(delivery, { recursive: true, force: true })
  }
})
