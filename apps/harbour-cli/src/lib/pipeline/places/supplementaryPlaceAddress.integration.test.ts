import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  ensureDraftSnapshotForRelease,
  resolveSnapshotReplayPlan,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import { getReplayedAddressVersionMap } from '@repo/core/pipeline/db/address'
import {
  type ReplayShard,
  resolveSnapshotVersionState,
} from '@repo/core/pipeline/db/snapshotReplay'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import { currentSchema, historySchema } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../../../libs/core/src/testing/metaFixtures'
import { buildPlacesResetSql, collectOwnedPlaces } from '../../commands/resetPlaces.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { prepareSupplementaryAddresses } from './processLocalPlaceSqlUpload.ts'
import { collectPublishedSupplementaryRevocations } from './processLocalPlaceSqlUploadSupplementary.ts'
import { addressFingerprint } from './supplementaryPlaceAddress.ts'
import policy from './testFixtures/supplementaryAddressPolicy.json'

test('published supplementary retry recovers revocations from immutable history', async () => {
  const first = new Database(':memory:')
  const second = new Database(':memory:')
  try {
    for (const db of [first, second])
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
          ['history'],
        ).replaceAll('--> statement-breakpoint', ''),
      )
    first.exec(`INSERT INTO address2d(snapshotId,id,operation) VALUES
      ('published-snapshot','ss-opa-stale-a','delete'),('other-snapshot','ss-opa-other','delete');
      INSERT INTO address2d(snapshotId,id,operation,versionHash,granularity,sourceReleaseId) VALUES('published-snapshot','ss-opa-current','upsert','hash','building','source');`)
    second.exec(`INSERT INTO address2d(snapshotId,id,operation) VALUES('published-snapshot','ss-opa-stale-b','delete');
      INSERT INTO address2dI18n(snapshotId,addressId,locale,operation) VALUES('published-snapshot','ss-opa-locale','en','delete');`)
    expect(
      await collectPublishedSupplementaryRevocations(
        [first, second].map((db, index) => ({
          db: drizzle({ client: db, schema: historySchema }),
          bindingName: `DB_HISTORY_${index}`,
          databaseId: null,
          databaseName: `history-${index}`,
          year: String(2025 + index),
        })),
        'published-snapshot',
      ),
    ).toEqual(['ss-opa-stale-a', 'ss-opa-stale-b'])
  } finally {
    first.close()
    second.close()
  }
})

test('supplementary editions reuse cross-year components, replay immutable provenance, and withdraw empty membership', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'place-address-integration-'))
  const resourceReleaseId = `place-release-${crypto.randomUUID()}`
  let withdrawnPlaceReleaseId: string | null = null
  const editionReleaseIds: string[] = []
  const files = {
    DB_META: resolve(root, 'meta.sqlite'),
    DB_CURRENT: resolve(root, 'current.sqlite'),
    DB_HISTORY_HK_2025: resolve(root, 'history.sqlite'),
    DB_HISTORY_HK_2026: resolve(root, 'history-next.sqlite'),
  }
  const meta = new Database(files.DB_META)
  const current = new Database(files.DB_CURRENT)
  const history = new Database(files.DB_HISTORY_HK_2025)
  const historyNext = new Database(files.DB_HISTORY_HK_2026)
  try {
    for (const [db, profile] of [
      [meta, 'meta'],
      [current, 'current'],
      [history, 'history'],
      [historyNext, 'history'],
    ] as const) {
      db.exec(
        loadMigrationSql(
          resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
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
      resourceReleaseId,
      source: 'overture',
      regionCode: 'hk',
      rawObjectKey: 'places.parquet',
      originalFileName: 'places.parquet',
      ingestedAt: '2025-08-19T00:00:00Z',
      resourceType: 'place',
      cohortKey: '2025-08',
      sourceVersion: '2025-08-19.0',
      status: 'processing',
      createdAt: '2025-08-19T00:00:00Z',
      updatedAt: '2025-08-19T00:00:00Z',
    })
    insertFixtureRelease(meta, {
      resourceReleaseId: 'als-release',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      rawObjectKey: 'als.parquet',
      originalFileName: 'als.parquet',
      ingestedAt: '2025-08-19T00:00:00Z',
      resourceType: 'address',
      cohortKey: '2025-08',
      sourceVersion: '2025-08-01',
      status: 'current',
      createdAt: '2025-08-19T00:00:00Z',
      updatedAt: '2025-08-19T00:00:00Z',
    })
    const official = await ensureDraftSnapshotForRelease(db, 'address', {
      variant: 'hkgov-dpo',
      cohortKey: '2025-08',
      datasetCode: 'ds-hk-hkgov-dpo-address',
      datasetId: 'hkgov-dpo-hk-address',
      regionCode: 'hk',
      sourceReleaseId: 'als-release',
    })
    await upsertSnapshotSource(db, official.id, 'als-release', 'primary')
    const placeSnapshot = await ensureDraftSnapshotForRelease(db, 'place', {
      variant: 'overture',
      cohortKey: '2025-08',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'overture-hk-place',
      regionCode: 'hk',
      sourceReleaseId: resourceReleaseId,
    })
    const currentDb = drizzle({ client: current, schema: currentSchema })
    meta.exec(`
      INSERT INTO snapshotLineages(id,code,regionCode,resourceType,identityMode,versionHash)
      VALUES ('division','division-dependency','hk','division','persistent','fixture');
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('division','division','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='division' AND resourceType IS NULL;
INSERT INTO snapshots(id, code, cohortKey, status, snapshotLineageId) VALUES
('division-selected', 'division-selected', '2025-08', 'published', 'division');`)
    currentDb
      .insert(currentSchema.divisionPublicationState)
      .values({
        scopeId: 'division',
        snapshotId: 'division-serving-newer',
        status: 'current',
        publicationToken: 'division-fixture',
        preparedAt: '2025-08-19T00:00:00Z',
      })
      .run()
    const officialScopeId = official.snapshotLineageId
    if (!officialScopeId) throw new Error('Expected an official Address lineage.')
    currentDb
      .insert(currentSchema.addressPublicationState)
      .values({
        scopeId: officialScopeId,
        snapshotId: official.id,
        status: 'current',
        publicationToken: 'official-fixture',
        preparedAt: '2025-08-19T00:00:00Z',
      })
      .run()
    currentDb
      .insert(currentSchema.divisions)
      .values({
        scopeId: 'division',
        id: 'hk',
        class: 'country',
        category: 'administrative',
        hierarchies: { administrative: [], locality: [], landform: [], full: [] },
      })
      .run()
    currentDb
      .insert(currentSchema.address2d)
      .values({
        scopeId: officialScopeId,
        id: 'als-citygate',
        geometry: Buffer.from('01010000004e621058397c5c400ad7a3703d4a3640', 'hex'),
        divisionSnapshotId: 'division',
        countryId: 'hk',
      })
      .run()
    currentDb
      .insert(currentSchema.address2dI18n)
      .values({
        scopeId: officialScopeId,
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
    const bindingNames = {
      current: 'DB_CURRENT',
      history: 'DB_HISTORY_HK_2025',
      meta: 'DB_META',
    }
    const target = (database: Database, name: keyof typeof bindingNames) => ({
      name,
      databaseId: null,
      binding: createLocalExecBinding(database, bindingNames[name]),
    })
    const place = normaliseOverturePlace(
      {
        id: 'citygate-place',
        geometry: { type: 'Point', coordinates: [113.941, 22.29] },
        addresses: [{ freeform: 'Citygate Outlets, 20 Tat Tung Road', country: 'HK' }],
      },
      '2025-08-19.0',
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
        state: {
          target: 'local',
          dbCacheDir: root,
          files,
          bindings: Object.fromEntries(
            Object.keys(files).map(bindingName => [
              bindingName,
              { databaseId: bindingName },
            ]),
          ),
        },
        currentDb,
        historyTargets: [
          {
            db: drizzle({ client: history, schema: historySchema }),
            bindingName: 'DB_HISTORY_HK_2025',
          },
          {
            db: drizzle({ client: historyNext, schema: historySchema }),
            bindingName: 'DB_HISTORY_HK_2026',
          },
        ],
      },
      metaDb: db,
      dependencyDb: currentDb,
      snapshots: {
        snapshotId: placeSnapshot.id,
        addressSnapshotId: official.id,
        divisionSnapshotId: 'division-selected',
      },
      places: [place],
      historyRows: [],
      releaseRoot: root,
      resourceReleaseId,
      datasetId: 'overture-hk-place',
      plan: {
        datasetCode: 'ds-hk-overture-place',
        cohortKey: '2025-08',
        regionCode: 'hk',
        releaseCode: 'place-release',
        rowCount: 1,
        source: 'overture',
        sourceVersion: '2025-08-19.0',
        theme: 'places',
        type: 'place',
      },
      targets: {
        current: target(current, 'current'),
        history: target(history, 'history'),
        meta: target(meta, 'meta'),
        historyByBinding: new Map([
          ['DB_HISTORY_HK_2025', target(history, 'history')],
          [
            'DB_HISTORY_HK_2026',
            {
              name: 'history',
              databaseId: null,
              binding: createLocalExecBinding(historyNext, 'DB_HISTORY_HK_2026'),
            },
          ],
        ]),
        environment: 'preview',
      },
      importOptions: { isLocal: true },
      actions: [],
    } as unknown as Parameters<typeof prepareSupplementaryAddresses>[0]
    const nextHistoryTarget = input.targets.historyByBinding.get('DB_HISTORY_HK_2026')
    if (!nextHistoryTarget) throw new Error('Expected the next history shard.')
    // Unresolved analysis must leave snapshot assembly and canonical stores untouched.
    const blockedPolicy = { ...structuredClone(policy), decisions: [] as unknown[] }
    blockedPolicy.decisions = [
      {
        placeId: place.id,
        sourceRelease: input.plan.sourceVersion,
        fingerprint: addressFingerprint(['Citygate Outlets, 20 Tat Tung Road']),
        previousAddressId: null,
        resolution: 'link_existing',
        addressId: 'missing-reviewed-address',
        reason: 'Selected address must be reproduced before assembly.',
      },
    ]
    await writeFile(curationPath, JSON.stringify(blockedPolicy))
    const assembliesBeforeReview = meta.query('SELECT * FROM snapshotAssemblies').all()
    await expect(prepareSupplementaryAddresses(input)).rejects.toThrow(
      'Address assembly blocked by 1 unresolved identity reviews',
    )
    expect(meta.query('SELECT * FROM snapshotAssemblies').all()).toEqual(
      assembliesBeforeReview,
    )
    expect(current.query('SELECT id FROM address2d').all()).toEqual([
      { id: 'als-citygate' },
    ])
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 0 })
    expect(auditHashes).toHaveLength(0)
    const blockedReview = JSON.parse(
      await readFile(resolve(root, 'overture-place-address-review.json'), 'utf8'),
    )
    expect(blockedReview.results[0]).toMatchObject({ tier: 'review', addressId: null })
    await writeFile(curationPath, JSON.stringify(policy))
    await writeFile(
      resolve(root, 'entries.json.lock'),
      JSON.stringify({
        pid: process.pid + 1_000_000,
        resourceReleaseId: 'interrupted-run',
      }),
    )
    history.exec(
      "CREATE TRIGGER fail_import BEFORE INSERT ON address2d BEGIN SELECT RAISE(ABORT, 'simulated history import failure'); END;",
    )
    await expect(prepareSupplementaryAddresses(input)).rejects.toThrow(
      'Net planning does not support triggers on address2d.',
    )
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 0 })
    expect(current.query('SELECT id FROM address2d').all()).toEqual([
      { id: 'als-citygate' },
    ])
    expect(
      current.query('SELECT scopeId, status FROM addressPublicationState').all(),
    ).toEqual([{ scopeId: officialScopeId, status: 'current' }])
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
            meta
              .query('SELECT status FROM resourceReleases WHERE id = ?')
              .get(auditReleaseId),
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
        .query(
          'SELECT datasetId, sourceReleaseId FROM resourceReleaseDetails AS resourceReleases WHERE id = ?',
        )
        .get(first.resourceReleaseId),
    ).toEqual({
      datasetId: 'overture-hk-place',
      sourceReleaseId: `source-${resourceReleaseId}`,
    })
    expect(
      meta
        .query('SELECT count(*) AS n FROM sourceReleases WHERE datasetId = ?')
        .get('overture-hk-place'),
    ).toEqual({ n: 1 })
    expect(
      meta
        .query('SELECT status FROM sourceReleases WHERE id = ?')
        .get(`source-${resourceReleaseId}`),
    ).toEqual({ status: 'processing' })
    expect(first.addresses).toHaveLength(1)
    expect(first.addresses[0]?.current.sources).toEqual([
      {
        publisher: 'overture',
        dataset: 'ds-hk-overture-place',
        recordId: 'citygate-place',
      },
    ])
    expect(first.addresses[0]?.canonical.granularity).toBe('unknown')
    expect(first.addresses[0]?.canonical).not.toHaveProperty('granularityProvenance')
    expect(JSON.parse(await readFile(curationPath, 'utf8'))).not.toHaveProperty(
      'entries',
    )
    expect(JSON.parse(await readFile(entryLedgerPath, 'utf8')).entries).toHaveLength(1)
    expect(
      current
        .query(
          'SELECT countryId FROM address2d WHERE scopeId = (SELECT scopeId FROM addressPublicationState WHERE snapshotId = ?)',
        )
        .get(first.snapshotId),
    ).toEqual({ countryId: 'hk' })
    expect(
      meta.query('SELECT status FROM snapshots WHERE id = ?').get(first.snapshotId),
    ).toEqual({ status: 'published' })
    expect(
      history
        .query('SELECT count(*) AS n FROM historyEvents WHERE snapshotId = ?')
        .get(first.snapshotId),
    ).toEqual({ n: 3 })
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
    const immutableLedgerText = await readFile(entryLedgerPath, 'utf8')
    const changedLedger = JSON.parse(immutableLedgerText)
    changedLedger.entries[0].values[0].formattedAddress =
      changedLedger.entries[0].values[0].formattedAddress.toLowerCase()
    await writeFile(entryLedgerPath, JSON.stringify(changedLedger))
    await expect(prepareSupplementaryAddresses(input)).rejects.toThrow(
      'Published supplementary snapshot differs from curation',
    )
    await writeFile(entryLedgerPath, immutableLedgerText)
    // The parent Places workflow normally finalises this retained receipt after
    // both outputs succeed. This focused test invokes only the Address stage.
    await completeSqlDeliveryRelease(root, resourceReleaseId)
    const generatedAddressId = first.addresses[0]?.current.id
    if (!generatedAddressId)
      throw new Error('Expected a generated supplementary Address.')
    const originalBase = history.query('SELECT * FROM address2d').all()
    const originalLocale = history.query('SELECT * FROM address2dI18n').all()
    const originalLookup = history
      .query('SELECT * FROM address2dBuildingNumberLookup')
      .all()
    expect(originalLookup).toHaveLength(1)
    const replayShards = new Map<string, ReplayShard>(
      input.context.historyTargets.map(target => [
        target.bindingName,
        {
          bindingName: target.bindingName,
          db: target.db as ReplayShard['db'],
        },
      ]),
    )
    const replay = (snapshotId: string) =>
      getReplayedAddressVersionMap(db, snapshotId, replayShards, {
        buildAddressBaseHashInput: base => base,
        normaliseAddressI18nSnapshotRow: locale => locale,
        buildMatchKey: () => null,
      })
    const firstReplay = await replay(first.snapshotId)
    const assertComponentsRetained = (newRoots: number) => {
      expect(history.query('SELECT * FROM address2d').all()).toEqual(originalBase)
      expect(history.query('SELECT * FROM address2dI18n').all()).toEqual(originalLocale)
      expect(
        history.query('SELECT * FROM address2dBuildingNumberLookup').all(),
      ).toEqual(originalLookup)
      for (const table of [
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
      ])
        expect(historyNext.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
          n: newRoots,
        })
    }
    const nextEdition = async (
      sourceVersion: string,
      places = [place],
      addressSnapshotId = official.id,
    ) => {
      const editionId = `place-edition-${crypto.randomUUID()}`
      editionReleaseIds.push(editionId)
      const cohortKey = sourceVersion.slice(0, 7)
      const timestamp = `${sourceVersion.slice(0, 10)}T00:00:00Z`
      insertFixtureRelease(meta, {
        resourceReleaseId: editionId,
        source: 'overture',
        regionCode: 'hk',
        rawObjectKey: 'places.parquet',
        originalFileName: 'places.parquet',
        ingestedAt: timestamp,
        resourceType: 'place',
        cohortKey,
        sourceVersion,
        status: 'processing',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      const placeSnapshot = await ensureDraftSnapshotForRelease(db, 'place', {
        variant: 'overture',
        cohortKey,
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'overture-hk-place',
        regionCode: 'hk',
        sourceReleaseId: editionId,
      })
      const result = await prepareSupplementaryAddresses({
        ...input,
        places,
        resourceReleaseId: editionId,
        snapshots: {
          ...input.snapshots,
          snapshotId: placeSnapshot.id,
          addressSnapshotId,
        },
        plan: {
          ...input.plan,
          sourceVersion,
          cohortKey,
          rowCount: places.length,
          releaseCode: editionId,
        },
        targets: {
          ...input.targets,
          history: nextHistoryTarget,
        },
      })
      await completeSqlDeliveryRelease(root, editionId)
      return result
    }
    const unchanged = await nextEdition('2026-01-21.0')
    assertComponentsRetained(1)
    expect(unchanged.addresses[0]?.current.id).toBe(generatedAddressId)
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    const unchangedReplay = await replay(unchanged.snapshotId)
    expect(unchangedReplay.get(generatedAddressId)?.base.sources).toEqual(
      unchanged.addresses[0]?.current.sources,
    )
    expect(unchangedReplay.get(generatedAddressId)?.base.sources).toEqual(
      firstReplay.get(generatedAddressId)?.base.sources,
    )
    const unchangedPlan = await resolveSnapshotReplayPlan(db, unchanged.snapshotId)
    expect(unchangedPlan).toHaveLength(1)
    expect(unchangedPlan[0]?.parentSnapshotId).toBeNull()
    const unchangedState = await resolveSnapshotVersionState(
      unchangedPlan,
      replayShards,
      ['address2d', 'address2dI18n'],
    )
    expect(
      [...unchangedState.values()].map(row => [row.recordType, row.shard.bindingName]),
    ).toEqual(
      expect.arrayContaining([
        ['address2d', 'DB_HISTORY_HK_2026'],
        ['address2dI18n', 'DB_HISTORY_HK_2026'],
      ]),
    )
    insertFixtureRelease(meta, {
      resourceReleaseId: 'als-release-next',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      rawObjectKey: 'als-next.parquet',
      originalFileName: 'als-next.parquet',
      ingestedAt: '2026-01-25T00:00:00Z',
      resourceType: 'address',
      cohortKey: '2026-01',
      sourceVersion: '2026-01-25',
      status: 'published',
      createdAt: '2026-01-25T00:00:00Z',
      updatedAt: '2026-01-25T00:00:00Z',
    })
    const officialNext = await ensureDraftSnapshotForRelease(db, 'address', {
      variant: 'hkgov-dpo',
      cohortKey: '2026-01',
      datasetCode: 'ds-hk-hkgov-dpo-address',
      datasetId: 'hkgov-dpo-hk-address',
      regionCode: 'hk',
      sourceReleaseId: 'als-release-next',
    })
    await upsertSnapshotSource(db, officialNext.id, 'als-release-next', 'primary')
    current
      .query('UPDATE addressPublicationState SET snapshotId = ? WHERE scopeId = ?')
      .run(officialNext.id, officialScopeId)
    const sourceOnly = await nextEdition('2026-01-28.0', [place], officialNext.id)
    assertComponentsRetained(2)
    expect(
      (await replay(sourceOnly.snapshotId)).get(generatedAddressId)?.base.sources,
    ).toEqual(sourceOnly.addresses[0]?.current.sources)
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    current
      .query('UPDATE addressPublicationState SET snapshotId = ? WHERE scopeId = ?')
      .run(official.id, officialScopeId)
    const anotherPlace = {
      ...place,
      id: 'citygate-place-2',
      raw: { ...place.raw, id: 'citygate-place-2' },
    }
    const supported = await nextEdition('2026-02-18.0', [place, anotherPlace])
    expect(
      (
        history
          .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
          .get(generatedAddressId) as { n: number }
      ).n +
        (
          historyNext
            .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
            .get(generatedAddressId) as { n: number }
        ).n,
    ).toBe(4)
    expect(supported.addresses).toHaveLength(1)
    expect(
      supported.addresses[0]?.current.sources.map(source => source.recordId),
    ).toEqual(['citygate-place', 'citygate-place-2'])
    const ledger = JSON.parse(await readFile(entryLedgerPath, 'utf8'))
    for (const entry of ledger.entries)
      for (const value of entry.values)
        value.formattedAddress = value.formattedAddress.toLowerCase()
    await writeFile(entryLedgerPath, JSON.stringify(ledger))
    const localised = await nextEdition('2026-03-18.0', [place, anotherPlace])
    expect(localised.addresses[0]?.current.id).toBe(generatedAddressId)
    expect(
      (
        history
          .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
          .get(generatedAddressId) as { n: number }
      ).n +
        (
          historyNext
            .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
            .get(generatedAddressId) as { n: number }
        ).n,
    ).toBe(5)
    expect(history.query('SELECT * FROM address2dBuildingNumberLookup').all()).toEqual(
      originalLookup,
    )
    expect(history.query('SELECT isCurrent FROM address2dI18n').get()).toEqual({
      isCurrent: 1,
    })
    expect(historyNext.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 4,
    })
    expect(
      (await replay(localised.snapshotId)).get(generatedAddressId)?.localisedRows[0]
        ?.formattedAddress,
    ).toBe(localised.addresses[0]?.i18n[0]?.formattedAddress)
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    const policyWithRevocation = {
      ...policy,
      decisions: [
        {
          placeId: anotherPlace.id,
          fingerprint: addressFingerprint(['Citygate Outlets, 20 Tat Tung Road']),
          sourceRelease: '2026-04-15.0',
          resolution: 'leave_unlinked',
          previousAddressId: generatedAddressId,
          addressId: null,
          reason: 'Withdraw this supporting Place',
        },
      ],
    }
    await writeFile(curationPath, JSON.stringify(policyWithRevocation))
    const revoked = await nextEdition('2026-04-15.0', [place, anotherPlace])
    expect(revoked.addresses).toHaveLength(1)
    expect(
      revoked.addresses[0]?.current.sources.map(source => source.recordId),
    ).toEqual(['citygate-place'])
    expect(
      (
        history
          .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
          .get(generatedAddressId) as { n: number }
      ).n +
        (
          historyNext
            .query('SELECT count(*) AS n FROM address2d WHERE id=? AND isCurrent=1')
            .get(generatedAddressId) as { n: number }
        ).n,
    ).toBe(6)
    expect(historyNext.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 5,
    })
    expect(
      (await replay(supported.snapshotId)).get(generatedAddressId)?.base.sources,
    ).toEqual(supported.addresses[0]?.current.sources)
    // Another lineage owns these active components. Withdrawing this scope must
    // leave their current flags and immutable payloads intact.
    historyNext.exec(`
      INSERT INTO address2d(id,versionHash,snapshotId,sourceReleaseId,isCurrent,granularity)
        VALUES('ss-opa-other-lineage','other-base','other-snapshot','other-release',1,'building');
      INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,snapshotId,sourceReleaseId,isCurrent)
        VALUES('ss-opa-other-lineage','other-locale','en','Another address','other-snapshot','other-release',1);
      INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,buildingNumber,numericStem,evidence,snapshotId,sourceReleaseId,isCurrent)
        VALUES('ss-opa-other-lineage','other-lookup','2',2,'source_endpoint','other-snapshot','other-release',1);
    `)
    const foreignComponents = () =>
      ['address2d', 'address2dI18n', 'address2dBuildingNumberLookup'].map(table =>
        historyNext
          .query(`SELECT * FROM ${table} WHERE snapshotId='other-snapshot'`)
          .all(),
      )
    const foreignBeforeWithdrawal = foreignComponents()
    await writeFile(curationPath, JSON.stringify(policy))
    withdrawnPlaceReleaseId = `place-release-${crypto.randomUUID()}`
    insertFixtureRelease(meta, {
      resourceReleaseId: withdrawnPlaceReleaseId,
      source: 'overture',
      regionCode: 'hk',
      rawObjectKey: 'places-withdrawn.parquet',
      originalFileName: 'places-withdrawn.parquet',
      ingestedAt: '2026-09-16T00:00:00Z',
      resourceType: 'place',
      cohortKey: '2026-09',
      sourceVersion: '2026-09-16.0',
      status: 'processing',
      createdAt: '2026-09-16T00:00:00Z',
      updatedAt: '2026-09-16T00:00:00Z',
    })
    const withdrawnPlaceSnapshot = await ensureDraftSnapshotForRelease(db, 'place', {
      variant: 'overture',
      cohortKey: '2026-09',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'overture-hk-place',
      regionCode: 'hk',
      sourceReleaseId: withdrawnPlaceReleaseId,
    })
    const withdrawn = await prepareSupplementaryAddresses({
      ...input,
      places: [],
      resourceReleaseId: withdrawnPlaceReleaseId,
      plan: {
        ...input.plan,
        cohortKey: '2026-09',
        releaseCode: 'place-release-withdrawn',
        rowCount: 0,
        sourceVersion: '2026-09-16.0',
      },
      snapshots: { ...input.snapshots, snapshotId: withdrawnPlaceSnapshot.id },
      targets: {
        ...input.targets,
        history: nextHistoryTarget,
      },
    })
    expect(withdrawn.addresses).toEqual([])
    expect(JSON.parse(await readFile(entryLedgerPath, 'utf8')).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placeId: place.id,
          firstSeen: '2025-08-19.0',
          revokedAt: '2026-09-16.0',
        }),
      ]),
    )
    expect(
      historyNext
        .query(
          "SELECT recordType, recordId, operation, versionHash FROM historyEvents WHERE snapshotId = ? AND recordType = 'address2d'",
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
    ).toEqual({ isCurrent: 1 })
    expect(await replay(withdrawn.snapshotId)).toEqual(new Map())
    expect(
      historyNext
        .query(
          'SELECT recordType FROM historyEvents WHERE snapshotId=? ORDER BY recordType',
        )
        .all(withdrawn.snapshotId),
    ).toEqual([{ recordType: 'address2d' }])
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    expect(historyNext.query('SELECT isCurrent FROM address2dI18n').get()).toEqual({
      isCurrent: 1,
    })
    expect(foreignComponents()).toEqual(foreignBeforeWithdrawal)
    await completeSqlDeliveryRelease(root, withdrawnPlaceReleaseId)
    const reappeared = await nextEdition('2026-10-21.0')
    expect(reappeared.addresses[0]?.current.id).toBe(generatedAddressId)
    const restoredBase = history
      .query('SELECT * FROM address2d WHERE id=?')
      .get(generatedAddressId)
    expect(restoredBase).toEqual(originalBase[0])
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    expect(
      (await replay(reappeared.snapshotId)).get(generatedAddressId)?.base.sources,
    ).toEqual(reappeared.addresses[0]?.current.sources)
    expect(await replay(withdrawn.snapshotId)).toEqual(new Map())
    expect(foreignComponents()).toEqual(foreignBeforeWithdrawal)
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
    ).rejects.toThrow('Address assembly blocked by 1 unresolved identity reviews')
    expect(await readFile(curationPath, 'utf8')).toBe(curationBeforeReview)
    expect(await readFile(entryLedgerPath, 'utf8')).toBe(entriesBeforeReview)
    const review = JSON.parse(
      await readFile(resolve(root, 'overture-place-address-review.json'), 'utf8'),
    )
    expect(review.unresolvedCount).toBe(1)
    expect(review.results).toHaveLength(1)
    expect(review.results[0]).toMatchObject({
      tier: 'review',
    })
    expect(review.version).toBe(2)
    expect(review.addressSnapshotId).toBe(official.id)
    expect(Array.isArray(review.results[0].candidateAddressIds)).toBe(true)
    for (const field of [
      'sourceTexts',
      'parsed',
      'candidates',
      'lng',
      'lat',
      'previous',
    ])
      expect(review.results[0]).not.toHaveProperty(field)
    expect(review.results[0].previousAddressId).toBe(first.addresses[0]?.current.id)
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
    expect(
      current
        .query(
          "SELECT name FROM sqlite_master WHERE name IN ('addressesFts','addressSearchFts')",
        )
        .all(),
    ).toEqual([])
    current
      .query('INSERT INTO addressSearchScopes(scopeId,snapshotId) VALUES (?,?)')
      .run('als', official.id)
    current.exec('PRAGMA foreign_keys = ON;')
    current.exec(reset.currentSql)
    history.exec(reset.historySql)
    historyNext.exec(reset.historySql)
    expect(current.query('SELECT id FROM address2d').all()).toEqual([
      { id: 'als-citygate' },
    ])
    expect(
      current.query('SELECT DISTINCT addressId FROM addressSearchFts').all(),
    ).toEqual([{ addressId: 'als-citygate' }])
    expect(history.query('SELECT count(*) AS n FROM address2d').get()).toEqual({ n: 0 })
    expect(history.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 0,
    })
    expect(history.query('SELECT count(*) AS n FROM historyEvents').get()).toEqual({
      n: 0,
    })
    expect(
      historyNext
        .query(
          "SELECT count(*) AS n FROM address2d WHERE snapshotId <> 'other-snapshot'",
        )
        .get(),
    ).toEqual({ n: 0 })
    expect(foreignComponents()).toEqual(foreignBeforeWithdrawal)
  } finally {
    meta.close()
    current.close()
    history.close()
    historyNext.close()
    await rm(root, { recursive: true, force: true })
    await rm(
      resolve(
        import.meta.dir,
        '../../../../../../.local/harbour-sql/deliveries/local',
        `release-${encodeURIComponent(resourceReleaseId)}`,
      ),
      { recursive: true, force: true },
    )
    if (withdrawnPlaceReleaseId)
      await rm(
        resolve(
          import.meta.dir,
          '../../../../../../.local/harbour-sql/deliveries/local',
          `release-${encodeURIComponent(withdrawnPlaceReleaseId)}`,
        ),
        { recursive: true, force: true },
      )
    for (const editionId of editionReleaseIds)
      await rm(
        resolve(
          import.meta.dir,
          '../../../../../../.local/harbour-sql/deliveries/local',
          `release-${encodeURIComponent(editionId)}`,
        ),
        { recursive: true, force: true },
      )
  }
})
