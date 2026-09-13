import { Database } from 'bun:sqlite'
import { test, expect } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, historySchema } from '@repo/db'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import {
  loadMigrationSql,
  seedFixtureCatalog,
  insertFixtureRelease,
} from '../../../../../../libs/core/src/testing/metaFixtures'
import {
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import { prepareSupplementaryAddresses } from './processLocalPlaceSqlUpload.ts'
import policy from './testFixtures/supplementaryAddressPolicy.json'
import { buildPlacesResetSql, collectOwnedPlaces } from '../../commands/resetPlaces.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { getReplayedAddressVersionMap } from '@repo/core/pipeline/db/address'
import {
  resolveSnapshotVersionState,
  type ReplayShard,
} from '@repo/core/pipeline/db/snapshotReplay'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { addressFingerprint } from './supplementaryPlaceAddress.ts'
import { collectPublishedSupplementaryRevocations } from './processLocalPlaceSqlUploadSupplementary.ts'

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
    first.exec(`
      INSERT INTO snapshotVersionChanges
        (snapshotId,recordType,recordId,locale,versionHash,operation)
      VALUES
        ('published-snapshot','address2d','opa-stale-a','',NULL,'delete'),
        ('published-snapshot','address2d','opa-current','', 'hash','upsert'),
        ('other-snapshot','address2d','opa-other','',NULL,'delete');
    `)
    second.exec(`
      INSERT INTO snapshotVersionChanges
        (snapshotId,recordType,recordId,locale,versionHash,operation)
      VALUES
        ('published-snapshot','address2d','opa-stale-b','',NULL,'delete'),
        ('published-snapshot','address2dI18n','opa-locale','en',NULL,'delete');
    `)
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
    ).toEqual(['opa-stale-a', 'opa-stale-b'])
  } finally {
    first.close()
    second.close()
  }
})

test('supplementary editions reuse cross-year components, replay immutable provenance, and withdraw empty membership', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'place-address-integration-'))
  const releaseId = `place-release-${crypto.randomUUID()}`
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
      releaseId,
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
      releaseId: 'als-release',
      source: 'hkgov-dpo',
      regionCode: 'hk',
      rawObjectKey: 'als.parquet',
      originalFileName: 'als.parquet',
      ingestedAt: '2025-08-19T00:00:00Z',
      resourceType: 'address',
      cohortKey: '2025-08',
      sourceVersion: '2025-08-01',
      status: 'published',
      createdAt: '2025-08-19T00:00:00Z',
      updatedAt: '2025-08-19T00:00:00Z',
    })
    const official = await ensureDraftSnapshotForRelease(db, 'address', {
      cohortKey: '2025-08',
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
      cohortKey: '2025-08',
      datasetCode: 'ds-hk-overture-place',
      datasetId: 'overture-hk-place',
      regionCode: 'hk',
      sourceReleaseId: releaseId,
    })
    const currentDb = drizzle({ client: current, schema: currentSchema })
    meta.exec(`INSERT INTO snapshotLineages(id,code,regionCode,resourceType,identityMode,versionHash)
      VALUES ('division','division-dependency','hk','division','persistent','fixture');
      INSERT INTO snapshots(id,code,resourceType,cohortKey,status,snapshotLineageId)
      VALUES ('division-selected','division-selected','division','2025-08','published','division');`)
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
        snapshotId: 'division',
        id: 'hk',
        class: 'country',
        category: 'administrative',
        hierarchies: { administrative: [], locality: [], full: [] },
      })
      .run()
    currentDb
      .insert(currentSchema.address2d)
      .values({
        snapshotId: officialScopeId,
        id: 'als-citygate',
        geometry: Buffer.from('01010000004e621058397c5c400ad7a3703d4a3640', 'hex'),
        divisionSnapshotId: 'division',
        countryId: 'hk',
      })
      .run()
    currentDb
      .insert(currentSchema.address2dI18n)
      .values({
        snapshotId: officialScopeId,
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
      releaseId,
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
    await writeFile(
      resolve(root, 'entries.json.lock'),
      JSON.stringify({ pid: process.pid + 1_000_000, releaseId: 'interrupted-run' }),
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
        .query(
          'SELECT countryId FROM address2d WHERE snapshotId = (SELECT scopeId FROM addressPublicationState WHERE snapshotId = ?)',
        )
        .get(first.snapshotId),
    ).toEqual({ countryId: 'hk' })
    expect(
      meta.query('SELECT status FROM snapshots WHERE id = ?').get(first.snapshotId),
    ).toEqual({ status: 'published' })
    expect(
      history
        .query('SELECT count(*) AS n FROM snapshotVersionChanges WHERE snapshotId = ?')
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
    const changedEvidenceLedger = JSON.parse(immutableLedgerText)
    changedEvidenceLedger.entries[0].score += 1
    await writeFile(entryLedgerPath, JSON.stringify(changedEvidenceLedger))
    await expect(prepareSupplementaryAddresses(input)).rejects.toThrow(
      'Published supplementary snapshot differs from curation',
    )
    await writeFile(entryLedgerPath, immutableLedgerText)
    expect(history.query('SELECT count(*) AS n FROM address2dEvidence').get()).toEqual({
      n: 1,
    })
    // The parent Places workflow normally finalises this retained receipt after
    // both outputs succeed. This focused test invokes only the Address stage.
    await completeSqlDeliveryRelease(root, releaseId)
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
    const assertComponentsRetained = () => {
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
          n: 0,
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
        releaseId: editionId,
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
        cohortKey,
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'overture-hk-place',
        regionCode: 'hk',
        sourceReleaseId: editionId,
      })
      const result = await prepareSupplementaryAddresses({
        ...input,
        places,
        releaseId: editionId,
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
    assertComponentsRetained()
    expect(unchanged.addresses[0]?.current.id).toBe(generatedAddressId)
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    const unchangedReplay = await replay(unchanged.snapshotId)
    expect(unchangedReplay.get(generatedAddressId)?.base.sources).toEqual(
      unchanged.addresses[0]?.current.sources,
    )
    expect(unchangedReplay.get(generatedAddressId)?.base.sources).not.toEqual(
      firstReplay.get(generatedAddressId)?.base.sources,
    )
    const unchangedPlan = await resolveSnapshotReplayPlan(db, unchanged.snapshotId)
    expect(unchangedPlan).toHaveLength(1)
    expect(unchangedPlan[0]?.parentSnapshotId).toBeNull()
    const unchangedState = await resolveSnapshotVersionState(
      unchangedPlan,
      replayShards,
      ['address2d', 'address2dI18n', 'address2dEvidence'],
    )
    expect(
      [...unchangedState.values()].map(row => [row.recordType, row.shard.bindingName]),
    ).toEqual(
      expect.arrayContaining([
        ['address2d', 'DB_HISTORY_HK_2025'],
        ['address2dI18n', 'DB_HISTORY_HK_2025'],
        ['address2dEvidence', 'DB_HISTORY_HK_2026'],
      ]),
    )
    insertFixtureRelease(meta, {
      releaseId: 'als-release-next',
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
      cohortKey: '2026-01',
      datasetCode: 'ds-hk-hkgov-dpo-address',
      datasetId: 'hkgov-dpo-hk-address',
      regionCode: 'hk',
      sourceReleaseId: 'als-release-next',
    })
    await upsertSnapshotSource(
      db,
      officialNext.id,
      'hkgov-dpo-hk-address',
      'als-release-next',
      'primary',
    )
    current
      .query('UPDATE addressPublicationState SET snapshotId = ? WHERE scopeId = ?')
      .run(officialNext.id, officialScopeId)
    const sourceOnly = await nextEdition('2026-01-28.0', [place], officialNext.id)
    assertComponentsRetained()
    expect(
      sourceOnly.addresses[0]?.evidence.sources[0]?.selectedAlsBase?.snapshotId,
    ).toBe(officialNext.id)
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
    assertComponentsRetained()
    expect(supported.addresses).toHaveLength(1)
    expect(
      supported.addresses[0]?.evidence.sources.map(source => source.sourceRecordId),
    ).toEqual(['citygate-place', 'citygate-place-2'])
    const ledger = JSON.parse(await readFile(entryLedgerPath, 'utf8'))
    for (const entry of ledger.entries)
      for (const value of entry.values)
        value.formattedAddress = value.formattedAddress.toLowerCase()
    await writeFile(entryLedgerPath, JSON.stringify(ledger))
    const localised = await nextEdition('2026-03-18.0', [place, anotherPlace])
    expect(localised.addresses[0]?.current.id).toBe(generatedAddressId)
    expect(history.query('SELECT * FROM address2d').all()).toEqual(originalBase)
    expect(history.query('SELECT * FROM address2dBuildingNumberLookup').all()).toEqual(
      originalLookup,
    )
    expect(history.query('SELECT isCurrent FROM address2dI18n').get()).toEqual({
      isCurrent: 0,
    })
    expect(historyNext.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 1,
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
      revoked.addresses[0]?.evidence.sources.map(source => source.sourceRecordId),
    ).toEqual(['citygate-place'])
    expect(history.query('SELECT * FROM address2d').all()).toEqual(originalBase)
    expect(historyNext.query('SELECT count(*) AS n FROM address2dI18n').get()).toEqual({
      n: 1,
    })
    expect(
      (await replay(supported.snapshotId)).get(generatedAddressId)?.base.sources,
    ).toEqual(supported.addresses[0]?.current.sources)
    // Another lineage owns these active components. Withdrawing this scope must
    // leave their current flags and immutable payloads intact.
    historyNext.exec(`
      INSERT INTO address2d(id,versionHash,snapshotId,sourceReleaseId,isCurrent)
        VALUES('opa-other-lineage','other-base','other-snapshot','other-release',1);
      INSERT INTO address2dI18n(addressId,versionHash,locale,formattedAddress,snapshotId,sourceReleaseId,isCurrent)
        VALUES('opa-other-lineage','other-locale','en','Another address','other-snapshot','other-release',1);
      INSERT INTO address2dBuildingNumberLookup(addressId,versionHash,buildingNumber,numericStem,evidence,snapshotId,sourceReleaseId,isCurrent)
        VALUES('opa-other-lineage','other-lookup','2',2,'source_endpoint','other-snapshot','other-release',1);
      INSERT INTO address2dEvidence(addressId,versionHash,sources,snapshotId,sourceReleaseId,isCurrent)
        VALUES('opa-other-lineage','other-evidence','[]','other-snapshot','other-release',1);
    `)
    const foreignComponents = () =>
      [
        'address2d',
        'address2dI18n',
        'address2dBuildingNumberLookup',
        'address2dEvidence',
      ].map(table =>
        historyNext
          .query(`SELECT * FROM ${table} WHERE snapshotId='other-snapshot'`)
          .all(),
      )
    const foreignBeforeWithdrawal = foreignComponents()
    await writeFile(curationPath, JSON.stringify(policy))
    withdrawnPlaceReleaseId = `place-release-${crypto.randomUUID()}`
    insertFixtureRelease(meta, {
      releaseId: withdrawnPlaceReleaseId,
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
    expect(await replay(withdrawn.snapshotId)).toEqual(new Map())
    expect(
      historyNext
        .query(
          'SELECT recordType FROM snapshotVersionChanges WHERE snapshotId=? ORDER BY recordType',
        )
        .all(withdrawn.snapshotId),
    ).toEqual([
      { recordType: 'address2d' },
      { recordType: 'address2dEvidence' },
      { recordType: 'address2dI18n' },
    ])
    expect(await replay(first.snapshotId)).toEqual(firstReplay)
    expect(historyNext.query('SELECT isCurrent FROM address2dI18n').get()).toEqual({
      isCurrent: 0,
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
    ).rejects.toThrow('Published supplementary snapshot differs from curation')
    expect(await readFile(curationPath, 'utf8')).toBe(curationBeforeReview)
    expect(await readFile(entryLedgerPath, 'utf8')).toBe(entriesBeforeReview)
    const review = JSON.parse(
      await readFile(resolve(root, 'overture-place-address-review.json'), 'utf8'),
    )
    expect(review.reviewRequired).toBe(1)
    expect(review.results).toHaveLength(1)
    expect(review.results[0]).toMatchObject({
      tier: 'delayed',
      reviewDeferral: { reviewStatus: 'unreviewed' },
    })
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
    expect(
      history.query('SELECT count(*) AS n FROM snapshotVersionChanges').get(),
    ).toEqual({ n: 0 })
    expect(
      historyNext
        .query(
          "SELECT count(*) AS n FROM address2dEvidence WHERE snapshotId <> 'other-snapshot'",
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
        `release-${encodeURIComponent(releaseId)}`,
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
