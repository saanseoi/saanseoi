import { requireDefined } from '@repo/core/requireDefined'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { currentSchema } from '@repo/db'
import { createLocalHarbourDb } from '../../../../libs/core/src/testing/localDb'
import {
  insertFixtureRelease,
  loadMigrationSql,
  seedFixtureCatalog,
} from '../../../../libs/core/src/testing/metaFixtures'
import {
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  publishReleaseArtefacts,
  getDatasetRecordByReleaseId,
  publishSnapshot,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import {
  getAddressDetail,
  getAddressUnits,
  listAddresses,
  searchAddresses,
} from './addresses'
import { AddressUnitsResponseSchema } from '../schema/addresses'
import { AddressSearchQuerySchema, AddressesListQuerySchema } from '../schema/addresses'

test('publishes and serves a curated Address union with dataset filtering, global pagination and distinct bilingual search', async () => {
  const meta = new Database(':memory:')
  const current = new Database(':memory:')
  try {
    for (const [database, family] of [
      [meta, 'meta'],
      [current, 'current'],
    ] as const)
      database.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../libs/db/migrations'), [
          family,
        ]).replaceAll('--> statement-breakpoint', ''),
      )
    seedFixtureCatalog(meta)
    const db = createLocalHarbourDb(meta)
    const currentDb = createLocalHarbourDb(current)
    meta.exec(`INSERT INTO datasets (id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, versionHash)
      SELECT 'overture-hk-place', publisherId, 'ds-hk-overture-place', 'hk', 'static', 'monthly', 'places', 'fixture'
      FROM datasets WHERE id = 'overture-hk-division';
      UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'place') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'place');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');`)
    const cohort = '2025-09-24.0'
    const members = [
      {
        id: 'division',
        type: 'division',
        source: 'overture',
        datasetId: 'overture-hk-division',
        datasetCode: 'ds-hk-overture-division',
        variant: 'overture',
      },
      {
        id: 'als',
        type: 'address',
        source: 'hkgov-dpo',
        datasetId: 'hkgov-dpo-hk-address',
        datasetCode: 'ds-hk-hkgov-dpo-address',
        variant: 'default',
      },
      {
        id: 'supplementary',
        type: 'address',
        source: 'overture',
        datasetId: 'overture-hk-place',
        datasetCode: 'ds-hk-overture-place',
        variant: 'overture-places',
      },
    ] as const
    const snapshots = new Map<string, string>()
    for (const member of members) {
      insertFixtureRelease(meta, {
        releaseId: member.id,
        datasetCode: member.datasetCode,
        releaseCode: `release-${member.id}`,
        source: member.source,
        regionCode: 'hk',
        rawObjectKey: 'fixture.json',
        originalFileName: 'fixture.json',
        ingestedAt: '2025-09-25T00:00:00Z',
        type: member.type,
        cohortKey: cohort,
        sourceVersion: cohort,
        status: 'published',
        createdAt: '2025-09-25T00:00:00Z',
        updatedAt: '2025-09-25T00:00:00Z',
      })
      const snapshot = await ensureDraftSnapshotForRelease(db, member.type, {
        cohortKey: cohort,
        datasetCode: member.datasetCode,
        datasetId: member.datasetId,
        sourceReleaseId: member.id,
        regionCode: 'hk',
        variant: member.variant,
      })
      await upsertSnapshotSource(
        db,
        snapshot.id,
        member.datasetId,
        member.id,
        'primary',
      )
      await publishSnapshot(db, snapshot.id)
      snapshots.set(member.id, snapshot.id)
    }
    // Publishing the supplementary resource must accept its snapshot variant,
    // even though its shared publisher dataset has the Places theme.
    const releaseSet = await ensureDraftReleaseSetForRelease(
      db,
      'address',
      { cohortKey: cohort, regionCode: 'hk' },
      { domainCode: 'saanseoi' },
    )
    const dataset = await getDatasetRecordByReleaseId(db, 'supplementary')
    if (!dataset) throw new Error('Missing fixture release')
    const publication = await publishReleaseArtefacts(db, {
      dataset,
      currentRelease: null,
      currentReleaseIsCorrected: false,
      releaseSetId: releaseSet.id,
      snapshotId: requireDefined(snapshots.get('supplementary')),
      snapshotVariant: 'overture-places',
      type: 'address',
      publishedAt: '2025-09-25T00:00:00Z',
      updateDatasetRelease: false,
      carriedSnapshots: [
        {
          resourceType: 'address',
          variant: 'default',
          snapshotId: requireDefined(snapshots.get('als')),
        },
        {
          resourceType: 'division',
          variant: 'overture',
          snapshotId: requireDefined(snapshots.get('division')),
        },
      ],
    })
    expect(publication?.code).toBeDefined()
    const divisionSnapshotId = requireDefined(snapshots.get('division'))
    currentDb
      .insert(currentSchema.divisions)
      .values({ snapshotId: divisionSnapshotId, id: 'hk', type: 'country' })
      .run()
    for (const [id, member, countryId] of [
      ['a', 'als', 'hk'],
      ['b', 'supplementary', 'hk'],
      ['c', 'als', 'hk'],
      ['d', 'supplementary', null],
      ['outside', 'outside', 'hk'],
    ] as const) {
      const snapshotId = snapshots.get(member) ?? 'unselected-snapshot'
      currentDb
        .insert(currentSchema.address2d)
        .values({
          id,
          snapshotId,
          divisionSnapshotId,
          countryId,
          parentAddressId: id === 'b' ? 'a' : null,
          granularity: id === 'a' ? 'complex' : id === 'b' ? 'unit' : 'unknown',
        })
        .run()
      for (const locale of ['en', 'zh-hant', 'zh-hans']) {
        currentDb
          .insert(currentSchema.address2dI18n)
          .values({
            snapshotId,
            addressId: id,
            locale,
            formattedAddress: `Harbour ${id}`,
            buildingName: 'Harbour',
            buildingNumberExpression: '20',
            buildingNumberFrom: '20',
          })
          .run()
      }
      currentDb
        .insert(currentSchema.address2dBuildingNumberLookup)
        .values({
          snapshotId,
          addressId: id,
          buildingNumber: '20',
          evidence: 'source_endpoint',
        })
        .run()
    }
    // Use the production FTS table's indexed columns with one row per locale.
    current.exec(
      await Bun.file(
        resolve(
          import.meta.dir,
          '../../../../libs/db/scripts/sql/rebuild-addresses-fts.sql',
        ),
      ).text(),
    )
    const args = {
      currentDb: currentDb as never,
      metaDb: db as never,
      requestUrl: 'https://api.saanseoi.hk/addresses/v0.1',
      requestedVersionPath: 'addresses/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-addresses-v0.1',
    } as const
    const all = await listAddresses({ ...args, query: {} })
    expect(all.status).toBe(200)
    if (all.status !== 200) throw new Error(JSON.stringify(all.body))
    expect(all.body.data.map(row => row.id)).toEqual(['a', 'b', 'c', 'd'])
    for (const region of ['hk', 'gba'] as const) {
      const regional = await listAddresses({ ...args, query: { region } })
      expect(regional.status).toBe(200)
      if (regional.status === 200) expect(regional.body.data).toEqual(all.body.data)
    }
    expect((await listAddresses({ ...args, query: { region: 'mo' } })).status).toBe(503)
    expect(all.body.meta.domain).toBe('saanseoi')
    expect(all.body.meta.page?.total).toBe(4)
    expect(all.body.data[1]?.attributes.datasetCode).toBe('ds-hk-overture-place')
    expect(all.body.data[0]?.attributes.parentAddressId).toBeNull()
    expect(all.body.data[1]?.attributes.parentAddressId).toBe('a')
    expect(all.body.data[0]?.attributes.granularity).toBe('complex')
    expect(all.body.data[1]?.attributes.granularity).toBe('unit')
    expect(all.body.data[2]?.attributes.granularity).toBe('unknown')
    const full = await getAddressDetail({
      ...args,
      id: 'b',
      query: { profile: 'full' },
    })
    expect(full.status === 200 && full.body.data.attributes.granularity).toBe('unit')
    expect(full.status === 200 && full.body.data.attributes).not.toHaveProperty(
      'granularityProvenance',
    )
    const compact = await getAddressDetail({
      ...args,
      id: 'b',
      query: { profile: 'compact' },
    })
    expect(compact.status === 200 && compact.body.data.attributes.granularity).toBe(
      'unit',
    )
    expect(compact.status === 200 && compact.body.data.attributes).not.toHaveProperty(
      'granularityProvenance',
    )
    const page = await listAddresses({
      ...args,
      query: { 'page[limit]': 2, 'page[offset]': 1 },
    })
    expect(page.status === 200 && page.body.data.map(row => row.id)).toEqual(['b', 'c'])
    for (const [dataset, expected] of [
      ['ds-hk-overture-place', ['b', 'd']],
      ['ds-hk-hkgov-dpo-address', ['a', 'c']],
      ['unknown', []],
    ] as const) {
      const result = await listAddresses({
        ...args,
        requestUrl: `${args.requestUrl}?filter%5Bdataset%5D=${dataset}`,
        query: { 'filter[dataset]': dataset },
      })
      expect(result.status).toBe(200)
      if (result.status !== 200) throw new Error(JSON.stringify(result.body))
      expect(result.body.data.map(row => row.id)).toEqual([...expected])
      expect(result.body.meta.page?.total).toBe(expected.length)
      expect(result.body.meta.filters?.dataset).toBe(dataset)
      expect(
        new URL(requireDefined(result.body.links.permalink)).searchParams.get(
          'filter[dataset]',
        ),
      ).toBe(dataset)
    }
    const detail = await getAddressDetail({ ...args, id: 'b', query: {} })
    expect(detail.status === 200 && detail.body.data.attributes.datasetCode).toBe(
      'ds-hk-overture-place',
    )
    expect((await getAddressDetail({ ...args, id: 'outside', query: {} })).status).toBe(
      404,
    )
    for (const match of [
      'full-text',
      'prefix',
      'component',
      'exact',
      'range',
    ] as const) {
      const query = {
        match,
        q: match === 'exact' || match === 'range' ? '20' : 'Harbour',
        ...(match === 'component' ? { component: 'building' as const } : {}),
        'page[limit]': 2,
        'page[offset]': 1,
      }
      const result = await searchAddresses({ ...args, query })
      expect(result.status).toBe(200)
      expect(result.status === 200 && result.body.data.map(row => row.id)).toEqual([
        'b',
        'c',
      ])
      expect(result.status === 200 && result.body.meta.page?.total).toBe(4)
      const filtered = await searchAddresses({
        ...args,
        query: {
          ...query,
          'page[offset]': 0,
          'filter[dataset]': 'ds-hk-overture-place',
          'filter[country]': 'hk',
        },
      })
      expect(filtered.status === 200 && filtered.body.data.map(row => row.id)).toEqual([
        'b',
      ])
      expect(filtered.status === 200 && filtered.body.meta.page?.total).toBe(1)
    }
    expect(
      AddressesListQuerySchema.safeParse({
        domain: 'saanseoi',
        'filter[dataset]': 'ds-hk-overture-place',
      }).success,
    ).toBe(true)
    expect(AddressesListQuerySchema.safeParse({ domain: 'official' }).success).toBe(
      false,
    )
    expect(
      AddressSearchQuerySchema.safeParse({
        match: 'full-text',
        q: 'Harbour',
        'filter[dataset]': '',
      }).success,
    ).toBe(false)
    const unit = {
      id: 'unit',
      unitRef: '01',
      unitType: 'F' as const,
      floorRef: '1',
      floorType: 'F' as const,
      unitPortion: null,
    }
    const alsSnapshotId = snapshots.get('als')
    if (!alsSnapshotId) throw new Error('Missing ALS fixture snapshot')
    current
      .query(
        'INSERT INTO address3d(snapshotId,id,address2dId,units,unitCount,contentHash,unresolvedSectionIds) VALUES (?,?,?,?,?,?,?)',
      )
      .run(alsSnapshotId, 'collection', 'a', JSON.stringify([unit]), 1, 'hash', '[]')
    for (const [locale, unitExpression, floorExpression] of [
      ['en', 'FLAT 01', '1/F'],
      ['zh-hant', '01室', '1樓'],
    ] as const)
      current
        .query(
          'INSERT INTO address3dI18n(snapshotId,address3dId,locale,units) VALUES (?,?,?,?)',
        )
        .run(
          alsSnapshotId,
          'collection',
          locale,
          JSON.stringify({ unit: { unitExpression, floorExpression } }),
        )
    const ordinary = await getAddressDetail({ ...args, id: 'a', query: {} })
    expect(ordinary.status === 200 && ordinary.body.data.attributes).not.toHaveProperty(
      'units',
    )
    const inventory = await getAddressUnits({
      ...args,
      id: 'a',
      query: { locales: 'en' },
    })
    expect(inventory.status).toBe(200)
    expect(AddressUnitsResponseSchema.safeParse(inventory.body).success).toBe(true)
    if (
      inventory.status !== 200 ||
      !inventory.body.data ||
      inventory.body.data.type !== 'address3d'
    )
      throw new Error('Missing inventory')
    expect(inventory.body.data.attributes.units).toEqual([unit])
    expect(Object.keys(inventory.body.data.attributes.i18n)).toEqual(['en'])
    expect(inventory.body.meta.address3dCoverage).toEqual({
      kind: 'direct',
      ownerAddress2dId: 'a',
      address3dId: 'collection',
      membership: 'established',
    })
    const absent = await getAddressUnits({ ...args, id: 'b', query: {} })
    expect(absent.status === 200 && absent.body.data).toBeNull()
  } finally {
    meta.close()
    current.close()
  }
})
