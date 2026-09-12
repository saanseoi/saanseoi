import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb.ts'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { buildPlaceSearchSyncSql } from '@repo/core/pipeline/services/places/searchIndex'
import {
  getPlaceCurrent,
  listPlaceDivisions,
} from '../../../../../atlas-api/src/db/places.ts'
import { PlaceDependencyView } from './placeDependencyView.ts'
import { createPlaceSearchDependencies } from './placeSearchDependencies.ts'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { validateResolvedPlaces } from './resolvedPlaceValidation.ts'
import { resolvePlaceDivisionDependency } from './placeSnapshotDependencies.ts'
import { currentSchema } from '@repo/db'

const migrations = join(import.meta.dir, '../../../../../../libs/db/migrations')
const init = (family: 'meta' | 'history' | 'current') => {
  const db = new Database(':memory:')
  db.exec(loadMigrationSql(migrations, [family]))
  return db
}
const insert = (db: Database, table: string, row: Record<string, unknown>) => {
  db.query(
    `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object' ? JSON.stringify(value) : value,
    ) as never[]),
  )
}

test('empty exact Address dependencies resolve from metadata and reject missing or substituted Division selections', async () => {
  const meta = init('meta')
  const history = init('history')
  const current = init('current')
  let view: PlaceDependencyView | undefined
  try {
    for (const [id, resourceType] of [
      ['empty-address', 'address'],
      ['empty-division', 'division'],
      ['unrecorded-address', 'address'],
    ])
      insert(meta, 'snapshots', {
        id,
        code: id,
        resourceType,
        cohortKey: '2025',
        status: 'published',
      })
    insert(meta, 'dataShards', {
      id: 'history',
      shardType: 'history',
      regionCode: 'hk',
      year: '2025',
      environment: 'preview',
      databaseName: 'history',
      databaseId: 'history',
      bindingName: 'DB_HISTORY',
      status: 'active',
      versionHash: 'history',
    })
    for (const snapshotId of ['empty-address', 'empty-division'])
      insert(meta, 'snapshotShardAssignments', { snapshotId, dataShardId: 'history' })
    insert(meta, 'snapshotAssembly', {
      id: 'assembly',
      code: 'assembly',
      resourceType: 'address',
      version: 1,
      status: 'scoped',
      versionHash: 'assembly',
    })
    insert(meta, 'snapshotAssemblyRuns', {
      id: 'empty',
      snapshotId: 'empty-address',
      snapshotAssemblyId: 'assembly',
      status: 'selected',
      selectionSummaryJson: { lookupSnapshotIds: { division: 'empty-division' } },
    })
    const metaDb = createLocalHarbourDb(meta)
    view = await PlaceDependencyView.create({
      metaDb,
      historyTargets: [
        { bindingName: 'DB_HISTORY', db: createLocalHarbourDb(history) },
      ],
    })
    const dependencyDb = await view.prepare('empty-address')
    expect(
      await resolvePlaceDivisionDependency(metaDb, dependencyDb, 'empty-address'),
    ).toEqual({ id: 'empty-division' })
    expect(await dependencyDb.select().from(currentSchema.address2d).all()).toEqual([])
    await expect(view.prepare('unrecorded-address')).rejects.toThrow(
      'no recorded exact Division dependency',
    )
    insert(current, 'divisionPublicationState', {
      scopeId: 'division-scope',
      snapshotId: 'newer-division',
      status: 'current',
      publicationToken: 'new',
      preparedAt: 'complete',
    })
    await expect(
      resolvePlaceDivisionDependency(
        metaDb,
        createLocalHarbourDb(current),
        'empty-address',
      ),
    ).rejects.toThrow('complete exact Division projection empty-division')
    insert(current, 'addressPublicationState', {
      scopeId: 'address-scope',
      snapshotId: 'empty-address',
      status: 'current',
      publicationToken: 'old',
      preparedAt: 'complete',
    })
    current.exec("UPDATE divisionPublicationState SET snapshotId='empty-division'")
    insert(current, 'address2d', {
      snapshotId: 'address-scope',
      id: 'inconsistent',
      divisionSnapshotId: 'other-scope',
    })
    await expect(
      resolvePlaceDivisionDependency(
        metaDb,
        createLocalHarbourDb(current),
        'empty-address',
      ),
    ).rejects.toThrow('different Division dependency')
    current.exec("UPDATE address2d SET divisionSnapshotId='division-scope'")
    expect(
      await resolvePlaceDivisionDependency(
        metaDb,
        createLocalHarbourDb(current),
        'empty-address',
      ),
    ).toEqual({ id: 'empty-division' })
  } finally {
    await view?.close()
    meta.close()
    history.close()
    current.close()
  }
})

test('exact historical Place dependencies replay independent locale shards and survive fresh and incremental FTS', async () => {
  const meta = init('meta')
  const before = init('history')
  const after = init('history')
  const current = init('current')
  let view: PlaceDependencyView | undefined
  const staged = join(
    tmpdir(),
    `place-dependency-validation-${crypto.randomUUID()}.jsonl`,
  )
  try {
    for (const [id, kind, parent] of [
      ['a0', 'address', null],
      ['a1', 'address', 'a0'],
      ['a2', 'address', 'a1'],
      ['d', 'division', null],
    ])
      insert(meta, 'snapshots', {
        id,
        resourceType: kind,
        code: id,
        cohortKey: '2025',
        status: 'published',
        parentSnapshotId: parent,
      })
    for (const [id, binding] of [
      ['old', 'DB_HISTORY_HK_2024'],
      ['new', 'DB_HISTORY_HK_2025'],
    ])
      insert(meta, 'dataShards', {
        id,
        shardType: 'history',
        regionCode: 'hk',
        year: id === 'old' ? '2024' : '2025',
        environment: 'preview',
        databaseName: id,
        databaseId: id,
        bindingName: binding,
        status: 'active',
        versionHash: id,
      })
    for (const [id, shard] of [
      ['a0', 'old'],
      ['a1', 'new'],
      ['a2', 'new'],
      ['d', 'old'],
    ])
      insert(meta, 'snapshotShardAssignments', { snapshotId: id, dataShardId: shard })
    insert(meta, 'snapshotAssembly', {
      id: 'assembly',
      code: 'assembly',
      resourceType: 'address',
      version: 1,
      status: 'scoped',
      versionHash: 'assembly',
    })
    for (const snapshotId of ['a1', 'a2'])
      insert(meta, 'snapshotAssemblyRuns', {
        id: snapshotId,
        snapshotId,
        snapshotAssemblyId: 'assembly',
        status: 'selected',
        selectionSummaryJson: { lookupSnapshotIds: { division: 'd' } },
      })
    const history = (
      db: Database,
      table: string,
      snapshotId: string,
      id: string,
      values: Record<string, unknown>,
      locale = '',
      hash = `${snapshotId}:${table}`,
    ) => {
      const idColumn =
        table === 'address2dI18n'
          ? 'addressId'
          : table === 'address3dI18n'
            ? 'address3dId'
            : table === 'divisionsI18n'
              ? 'divisionId'
              : 'id'
      insert(db, table, {
        [idColumn]: id,
        ...values,
        ...(locale ? { locale } : {}),
        snapshotId,
        versionHash: hash,
        sourceReleaseId: 'release',
        isCurrent: 1,
      })
      const recordType =
        table === 'divisions'
          ? 'division'
          : table === 'divisionsI18n'
            ? 'divisionI18n'
            : table
      insert(db, 'snapshotVersionChanges', {
        snapshotId,
        recordType,
        recordId: id,
        locale,
        versionHash: hash,
        operation: 'upsert',
        sourceReleaseId: 'release',
      })
    }
    history(before, 'divisions', 'd', 'country', { class: 'country', hierarchies: [] })
    history(
      before,
      'divisionsI18n',
      'd',
      'country',
      { name: 'Historic country', isLocaleInferred: 0 },
      'en',
    )
    history(before, 'address2d', 'a0', 'building', {
      granularity: 'building',
      countryId: 'country',
    })
    history(
      before,
      'address2dI18n',
      'a0',
      'building',
      { formattedAddress: 'Initial address', streetName: 'Initial street' },
      'en',
    )
    const units = [
      { id: 'chosen', floorRef: '3', unitRef: '12', floorType: 'F', unitType: 'F' },
      { id: 'other', floorRef: '9', unitRef: '99', floorType: 'F', unitType: 'F' },
    ]
    history(before, 'address3d', 'a0', 'collection', {
      address2dId: 'building',
      units,
      unitCount: 2,
      contentHash: 'units',
      unresolvedSectionIds: [],
    })
    history(
      before,
      'address3dI18n',
      'a0',
      'collection',
      {
        units: {
          chosen: { formattedAddressPart: 'Initial unit' },
          other: { formattedAddressPart: 'Never selected' },
        },
      },
      'en',
    )
    history(
      after,
      'address2dI18n',
      'a1',
      'building',
      { formattedAddress: 'Pinned address', streetName: 'Pinned street' },
      'en',
    )
    history(
      after,
      'address3dI18n',
      'a1',
      'collection',
      {
        units: {
          chosen: { formattedAddressPart: 'Pinned unit' },
          other: { formattedAddressPart: 'Never selected' },
        },
      },
      'en',
    )
    history(
      after,
      'address2dI18n',
      'a2',
      'building',
      { formattedAddress: 'Latest address', streetName: 'Latest street' },
      'en',
    )
    insert(current, 'addressPublicationState', {
      scopeId: 'address-scope',
      snapshotId: 'a2',
      publicationToken: 'a2',
      preparedAt: 'now',
      status: 'current',
    })
    const beforeChanges = [meta, before, after, current].map(db =>
      db.query('SELECT total_changes() AS n').get(),
    )
    view = await PlaceDependencyView.create({
      metaDb: createLocalHarbourDb(meta),
      historyTargets: [
        { bindingName: 'DB_HISTORY_HK_2024', db: createLocalHarbourDb(before) },
        { bindingName: 'DB_HISTORY_HK_2025', db: createLocalHarbourDb(after) },
      ],
    })
    await view.prepare('a1')
    expect(
      [meta, before, after, current].map(db =>
        db.query('SELECT total_changes() AS n').get(),
      ),
    ).toEqual(beforeChanges)
    const resolve = createPlaceSearchDependencies(view.db)
    const input = {
      addressSnapshotId: 'a1',
      addressId: 'building',
      address3dId: 'collection',
      address3dUnitId: 'chosen',
      divisionSnapshotId: 'd',
      divisionIds: ['country'],
      locales: ['en'],
    }
    const dependencies = await resolve(input)
    expect(dependencies.searchDependencies.en).toEqual({
      addressSnapshotId: 'a1',
      addressText: 'Pinned address Pinned unit',
      divisionText: 'Historic country',
      streetText: 'Pinned street',
    })
    await view.prepare('a2')
    const next = await resolve({ ...input, addressSnapshotId: 'a2' })
    expect(next.addressDependencyHash).not.toBe(dependencies.addressDependencyHash)
    expect(next.searchDependencies.en?.addressText).toBe('Latest address Pinned unit')
    insert(current, 'placePublicationState', {
      scopeId: 'place-scope',
      snapshotId: 'p',
      status: 'current',
      publicationToken: 'p',
      preparedAt: 'now',
    })
    insert(current, 'places', {
      snapshotId: 'place-scope',
      id: 'shop',
      releaseId: 'release',
      addressSnapshotId: 'a1',
      address2dId: 'building',
      addressDependencyHash: dependencies.addressDependencyHash,
      address3dId: 'collection',
      address3dUnitId: 'chosen',
      address3dMembership: 'established',
      lng: 114,
      lat: 22,
      firstSeenMonth: '2025-01',
      lastSeenMonth: '2025-01',
    })
    insert(current, 'placesI18n', {
      snapshotId: 'place-scope',
      placeId: 'shop',
      locale: 'en',
      name: 'Shop',
      searchDependencyText: dependencies.searchDependencies.en,
    })
    insert(current, 'placesDivision', {
      placeSnapshotId: 'place-scope',
      placeId: 'shop',
      divisionSnapshotId: 'd',
      divisionId: 'country',
      definition: dependencies.divisionDefinitions.country,
    })
    expect(
      await listPlaceDivisions(createLocalHarbourDb(current) as never, {
        snapshotId: 'p',
        placeId: 'shop',
      }),
    ).toEqual([
      { divisionId: 'country', level: null, locale: 'en', name: 'Historic country' },
    ])
    await Bun.write(
      staged,
      JSON.stringify({
        place: { id: 'shop', i18n: [{ locale: 'en' }] },
        projection: { cells: [] },
        addressSnapshotId: 'a1',
        address2dId: 'building',
        address3dId: 'collection',
        address3dUnitId: 'chosen',
        divisionIds: ['country'],
        ...dependencies,
      }),
    )
    await validateResolvedPlaces(current, staged, 'place-scope', 1)
    current.exec(
      "UPDATE placesI18n SET searchDependencyText=json_set(searchDependencyText,'$.addressText','Wrong current text')",
    )
    await expect(
      validateResolvedPlaces(current, staged, 'place-scope', 1),
    ).rejects.toThrow('exact search dependency text')
    current
      .query('UPDATE placesI18n SET searchDependencyText=?')
      .run(JSON.stringify(dependencies.searchDependencies.en))
    current.exec(
      "UPDATE placesDivision SET definition=json_set(definition,'$.level',9)",
    )
    await expect(
      validateResolvedPlaces(current, staged, 'place-scope', 1),
    ).rejects.toThrow('exact Division definitions')
    current
      .query('UPDATE placesDivision SET definition=?')
      .run(JSON.stringify(dependencies.divisionDefinitions.country))
    insert(current, 'placeSearchScopes', { scopeId: 'search', snapshotId: 'p' })
    const rebuild = readFileSync(
      join(
        import.meta.dir,
        '../../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
      ),
      'utf8',
    )
    current.exec(rebuild)
    const docs = current.query('SELECT rowid,* FROM placeSearchFts').all()
    current.exec('DELETE FROM addressPublicationState')
    for (const statement of buildPlaceSearchSyncSql([
      { scopeId: 'search', snapshotId: 'p' },
    ]))
      current.exec(statement)
    expect(current.query('SELECT rowid,* FROM placeSearchFts').all()).toEqual(docs)
    current.exec(rebuild)
    expect(current.query('SELECT rowid,* FROM placeSearchFts').all()).toEqual(docs)
    expect(
      (
        await getPlaceCurrent(createLocalHarbourDb(current) as never, {
          snapshotId: 'p',
          placeId: 'shop',
        })
      )?.addressSnapshotId,
    ).toBe('a1')
    await expect(resolve({ ...input, address3dUnitId: 'missing' })).rejects.toThrow(
      'Missing exact Place Address unit',
    )
  } finally {
    rmSync(staged, { force: true })
    await view?.close()
    for (const db of [meta, before, after, current]) db.close()
  }
})
