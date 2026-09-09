import { Database } from 'bun:sqlite'
import { test, expect } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema } from '@repo/db'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
  insertFixtureRelease,
} from '../../../../../libs/core/src/testing/metaFixtures'
import {
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import { prepareSupplementaryAddresses } from './processLocalPlaceSqlUpload.ts'
import policy from './testFixtures/supplementaryAddressPolicy.json'
import { buildPlacesResetSql, collectOwnedPlaces } from '../commands/resetPlaces.ts'
import { completeSqlDeliveryRelease } from '../localPipeline/sqlDeliveryPending.ts'

test('materialises a supplementary snapshot in SQLite, retries immutably, and blocks changed evidence before Place writes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'place-address-integration-'))
  const releaseId = `place-release-${crypto.randomUUID()}`
  let withdrawnPlaceReleaseId: string | null = null
  const files = {
    DB_META: resolve(root, 'meta.sqlite'),
    DB_CURRENT: resolve(root, 'current.sqlite'),
    DB_HISTORY: resolve(root, 'history.sqlite'),
  }
  const meta = new Database(files.DB_META)
  const current = new Database(files.DB_CURRENT)
  const history = new Database(files.DB_HISTORY)
  try {
    for (const [db, profile] of [
      [meta, 'meta'],
      [current, 'current'],
      [history, 'history'],
    ] as const) {
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../libs/db/migrations'),
          [profile],
        ).replaceAll('--> statement-breakpoint', ''),
      )
    }
    seedFixtureCatalog(meta)
    const db = createLocalHarbourDb(meta)
    meta.exec(`INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, versionHash)
      SELECT 'overture-hk-place', publisherId, 'ds-hk-overture-place', 'hk', 'static', 'monthly', 'places', 'fixture'
      FROM datasets WHERE id = 'overture-hk-division';
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'place') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'place');`)
    insertFixtureRelease(meta, {
      releaseId,
      source: 'overture',
      regionCode: 'hk',
      rawObjectKey: 'places.parquet',
      originalFileName: 'places.parquet',
      ingestedAt: '2026-08-19T00:00:00Z',
      type: 'place',
      cohortKey: '2026-08',
      sourceVersion: '2026-08-19.0',
      status: 'processing',
      createdAt: '2026-08-19T00:00:00Z',
      updatedAt: '2026-08-19T00:00:00Z',
    })
    insertFixtureRelease(meta, {
      releaseId: 'als-release',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      rawObjectKey: 'als.parquet',
      originalFileName: 'als.parquet',
      ingestedAt: '2026-08-19T00:00:00Z',
      type: 'address',
      cohortKey: '2026-08',
      sourceVersion: '2026-08-01',
      status: 'published',
      createdAt: '2026-08-19T00:00:00Z',
      updatedAt: '2026-08-19T00:00:00Z',
    })
    const official = await ensureDraftSnapshotForRelease(db, 'address', {
      cohortKey: '2026-08',
      datasetCode: 'ds-hk-hkgov-dpo-address',
      datasetId: 'hkgov-dpo-hk-address',
      regionCode: 'hk',
      sourceReleaseId: 'als-release',
    })
    await upsertSnapshotSource(
      db,
      official.id,
      'hkgov-dpo-hk-address',
      'als-release',
      'primary',
    )
    const placeSnapshot = await ensureDraftSnapshotForRelease(db, 'place', {
      cohortKey: '2026-08',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'overture-hk-place',
      regionCode: 'hk',
      sourceReleaseId: releaseId,
    })
    const currentDb = drizzle({ client: current, schema: currentSchema })
    currentDb
      .insert(currentSchema.divisions)
      .values({ snapshotId: 'division', id: 'hk', type: 'country' })
      .run()
    currentDb
      .insert(currentSchema.address2d)
      .values({
        snapshotId: official.id,
        id: 'als-citygate',
        geometry: Buffer.from('01010000004e621058397c5c400ad7a3703d4a3640', 'hex'),
        divisionSnapshotId: 'division',
        countryId: 'hk',
      })
      .run()
    currentDb
      .insert(currentSchema.address2dI18n)
      .values({
        snapshotId: official.id,
        addressId: 'als-citygate',
        locale: 'en',
        formattedAddress: 'Citygate, 20 Tat Tung Road',
        buildingName: 'Citygate',
        streetName: 'Tat Tung Road',
        buildingNumberExpression: '20',
        buildingNumberFrom: '20',
      })
      .run()
    const curationPath = resolve(root, 'curation.json')
    const entryLedgerPath = resolve(root, 'entries.json')
    await writeFile(curationPath, JSON.stringify(policy))
    const target = (database: Database, name: 'current' | 'history' | 'meta') => ({
      name,
      databaseId: null,
      binding: {
        bindingName: `DB_${name.toUpperCase()}`,
        prepare: (sql: string) => ({ run: async () => database.exec(sql) }),
      },
    })
    const place = normaliseOverturePlace(
      {
        id: 'citygate-place',
        geometry: { type: 'Point', coordinates: [113.941, 22.29] },
        addresses: [{ freeform: 'Citygate Outlets, Tat Tung Road', country: 'HK' }],
      },
      '2026-08-19.0',
    )
    if (!place) throw new Error('Expected the Place fixture to normalise.')
    const auditHashes: Array<string | undefined> = []
    const input = {
      retainAudit: async (
        _releaseId: string,
        _datasetCode: string,
        audit: import('./placeProvenance').PlaceAddressAuditInput,
      ) => {
        auditHashes.push(audit.materialisationHash)
      },
      curationPath,
      entryLedgerPath,
      context: {
        state: { target: 'local', dbCacheDir: root, files },
        currentDb,
        historyTargets: [
          {
            db: drizzle({ client: history, schema: historySchema }),
            bindingName: 'history',
          },
        ],
      },
      metaDb: db,
      snapshots: {
        snapshotId: placeSnapshot.id,
        addressSnapshotId: official.id,
        divisionSnapshotId: 'division',
      },
      places: [place],
      historyRows: [],
      releaseRoot: root,
      releaseId,
      datasetId: 'overture-hk-place',
      plan: {
        datasetCode: 'ds-hk-overture-place',
        cohortKey: '2026-08',
        regionCode: 'hk',
        releaseCode: 'place-release',
        rowCount: 1,
        source: 'overture',
        sourceVersion: '2026-08-19.0',
        theme: 'places',
        type: 'place',
      },
      targets: {
        current: target(current, 'current'),
        history: target(history, 'history'),
        meta: target(meta, 'meta'),
        historyByBinding: new Map([['history', target(history, 'history')]]),
        environment: 'preview',
      },
      importOptions: { isLocal: true },
      actions: [],
    } as unknown as Parameters<typeof prepareSupplementaryAddresses>[0]
    await writeFile(
      resolve(root, 'entries.json.lock'),
      JSON.stringify({ pid: process.pid + 1_000_000, releaseId: 'interrupted-run' }),
    )
    history.exec(
      "CREATE TRIGGER fail_import BEFORE INSERT ON address2d BEGIN SELECT RAISE(ABORT, 'simulated history import failure'); END;",
    )
    await expect(prepareSupplementaryAddresses(input)).rejects.toThrow(
      'simulated history import failure',
    )
    expect(
      meta
        .query(
          "SELECT count(*) AS n FROM snapshots s JOIN snapshotLineages l ON l.id = s.snapshotLineageId WHERE l.variant = 'overture-places' AND s.status = 'published'",
        )
        .get(),
    ).toEqual({ n: 0 })
    history.exec('DROP TRIGGER fail_import;')
    await expect(
      prepareSupplementaryAddresses({
        ...input,
        retainAudit: async auditReleaseId => {
          expect(
            meta.query('SELECT status FROM releases WHERE id = ?').get(auditReleaseId),
          ).toEqual({ status: 'processing' })
          throw new Error('simulated provenance registration failure')
        },
      }),
    ).rejects.toThrow('simulated provenance registration failure')
    expect(
      meta
        .query(
          "SELECT count(*) AS n FROM snapshots s JOIN snapshotLineages l ON l.id = s.snapshotLineageId WHERE l.variant = 'overture-places' AND s.status = 'published'",
        )
        .get(),
    ).toEqual({ n: 0 })
    const progressEvents: string[] = []
    const first = await prepareSupplementaryAddresses({
      ...input,
      onProgress: current => progressEvents.push(`progress:${current}`),
      onStage: stage => progressEvents.push(`stage:${stage}`),
    })
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        'stage:official Address definitions',
        'stage:Place Address candidates',
        'progress:1',
        'stage:materialise supplementary Addresses',
      ]),
    )
    expect(
      meta
        .query('SELECT datasetId, sourceReleaseId FROM releases WHERE id = ?')
        .get(first.releaseId),
    ).toEqual({
      datasetId: 'overture-hk-place',
      sourceReleaseId: `source-${releaseId}`,
    })
    expect(
      meta
        .query('SELECT count(*) AS n FROM sourceReleases WHERE datasetId = ?')
        .get('overture-hk-place'),
    ).toEqual({ n: 1 })
    expect(
      meta
        .query('SELECT status FROM sourceReleases WHERE id = ?')
        .get(`source-${releaseId}`),
    ).toEqual({ status: 'processing' })
    expect(first.addresses).toHaveLength(1)
    expect(first.addresses[0]?.canonical.granularity).toBe('unknown')
    expect(first.addresses[0]?.canonical).not.toHaveProperty('granularityProvenance')
    expect(JSON.parse(await readFile(curationPath, 'utf8'))).not.toHaveProperty(
      'entries',
    )
    expect(JSON.parse(await readFile(entryLedgerPath, 'utf8')).entries).toHaveLength(1)
    expect(
      current
        .query('SELECT countryId FROM address2d WHERE snapshotId = ?')
        .get(first.snapshotId),
    ).toEqual({ countryId: 'hk' })
    expect(
      meta.query('SELECT status FROM snapshots WHERE id = ?').get(first.snapshotId),
    ).toEqual({ status: 'published' })
    expect(
      history
        .query('SELECT count(*) AS n FROM snapshotVersionChanges WHERE snapshotId = ?')
        .get(first.snapshotId),
    ).toEqual({ n: 2 })
    expect(current.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })
    const retry = await prepareSupplementaryAddresses(input)
    expect(auditHashes).toHaveLength(2)
    expect(auditHashes[0]).toBeDefined()
    expect(auditHashes[1]).toBe(auditHashes[0])
    expect(retry.snapshotId).toBe(first.snapshotId)
    const dataset = meta
      .query("SELECT resourceTypes FROM datasets WHERE id = 'overture-hk-place'")
      .get() as { resourceTypes: string }
    expect(JSON.parse(dataset.resourceTypes)).toEqual(['place', 'address'])
    expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 1 })
    // The parent Places workflow normally finalises this retained receipt after
    // both outputs succeed. This focused test invokes only the Address stage.
    await completeSqlDeliveryRelease(root, releaseId)
    withdrawnPlaceReleaseId = `place-release-${crypto.randomUUID()}`
    insertFixtureRelease(meta, {
      releaseId: withdrawnPlaceReleaseId,
      source: 'overture',
      regionCode: 'hk',
      rawObjectKey: 'places-withdrawn.parquet',
      originalFileName: 'places-withdrawn.parquet',
      ingestedAt: '2026-09-16T00:00:00Z',
      type: 'place',
      cohortKey: '2026-09',
      sourceVersion: '2026-09-16.0',
      status: 'processing',
      createdAt: '2026-09-16T00:00:00Z',
      updatedAt: '2026-09-16T00:00:00Z',
    })
    const withdrawnPlaceSnapshot = await ensureDraftSnapshotForRelease(db, 'place', {
      cohortKey: '2026-09',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'overture-hk-place',
      regionCode: 'hk',
      sourceReleaseId: withdrawnPlaceReleaseId,
    })
    const withdrawn = await prepareSupplementaryAddresses({
      ...input,
      places: [],
      releaseId: withdrawnPlaceReleaseId,
      plan: {
        ...input.plan,
        cohortKey: '2026-09',
        releaseCode: 'place-release-withdrawn',
        rowCount: 0,
        sourceVersion: '2026-09-16.0',
      },
      snapshots: { ...input.snapshots, snapshotId: withdrawnPlaceSnapshot.id },
    })
    const generatedAddressId = first.addresses[0]?.current.id
    expect(generatedAddressId).toBeDefined()
    expect(withdrawn.addresses).toEqual([])
    expect(JSON.parse(await readFile(entryLedgerPath, 'utf8')).entries).toEqual([
      expect.objectContaining({
        firstSeen: '2026-08-19.0',
        revokedAt: '2026-09-16.0',
      }),
    ])
    expect(
      history
        .query(
          "SELECT recordType, recordId, operation, versionHash FROM snapshotVersionChanges WHERE snapshotId = ? AND recordType = 'address2d'",
        )
        .get(withdrawn.snapshotId),
    ).toEqual({
      recordType: 'address2d',
      recordId: generatedAddressId,
      operation: 'delete',
      versionHash: null,
    })
    expect(
      history
        .query('SELECT isCurrent FROM address2d WHERE id = ?')
        .get(generatedAddressId),
    ).toEqual({ isCurrent: 0 })
    const changed = {
      ...place,
      raw: { ...place.raw, addresses: [{ freeform: 'Citygate Annex, Tat Tung Road' }] },
    }
    const additionalAccepted = {
      ...place,
      id: 'citygate-place-2',
      raw: { ...place.raw, id: 'citygate-place-2' },
    }
    const curationBeforeReview = await readFile(curationPath, 'utf8')
    const entriesBeforeReview = await readFile(entryLedgerPath, 'utf8')
    await expect(
      prepareSupplementaryAddresses({
        ...input,
        places: [changed, additionalAccepted],
      }),
    ).rejects.toThrow('require explicit curation')
    expect(await readFile(curationPath, 'utf8')).toBe(curationBeforeReview)
    expect(await readFile(entryLedgerPath, 'utf8')).toBe(entriesBeforeReview)
    const review = JSON.parse(
      await readFile(resolve(root, 'overture-place-address-review.json'), 'utf8'),
    )
    expect(review.reviewRequired).toBe(1)
    expect(review.results).toHaveLength(1)
    expect(review.results[0].tier).toBe('review')
    expect(review.results[0].previous.addressId).toBe(first.addresses[0]?.current.id)
    expect(current.query('SELECT count(*) AS n FROM places').get()).toEqual({ n: 0 })

    const resolutionBeforeFailure = await readFile(
      resolve(root, 'overture-place-address.jsonl'),
      'utf8',
    )
    await expect(
      prepareSupplementaryAddresses({
        ...input,
        places: (async function* () {
          yield place
          throw new Error('source stream interrupted')
        })(),
      }),
    ).rejects.toThrow('source stream interrupted')
    expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect(await readFile(resolve(root, 'overture-place-address.jsonl'), 'utf8')).toBe(
      resolutionBeforeFailure,
    )

    const reset = buildPlacesResetSql(await collectOwnedPlaces(db))
    current.exec('PRAGMA foreign_keys = ON;')
    current.exec(reset.currentSql)
    history.exec(reset.historySql)
    expect(current.query('SELECT id FROM address2d').all()).toEqual([
      { id: 'als-citygate' },
    ])
    expect(current.query('SELECT DISTINCT addressId FROM addressesFts').all()).toEqual([
      { addressId: 'als-citygate' },
    ])
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 0 })
    expect(history.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 0,
    })
    expect(
      history.query('SELECT count(*) AS n FROM snapshotVersionChanges').get(),
    ).toEqual({ n: 0 })
  } finally {
    meta.close()
    current.close()
    history.close()
    await rm(root, { recursive: true, force: true })
    await rm(
      resolve(
        import.meta.dir,
        '../../../../../.local/harbour-sql/deliveries/local',
        `release-${encodeURIComponent(releaseId)}`,
      ),
      { recursive: true, force: true },
    )
    if (withdrawnPlaceReleaseId)
      await rm(
        resolve(
          import.meta.dir,
          '../../../../../.local/harbour-sql/deliveries/local',
          `release-${encodeURIComponent(withdrawnPlaceReleaseId)}`,
        ),
        { recursive: true, force: true },
      )
  }
})
