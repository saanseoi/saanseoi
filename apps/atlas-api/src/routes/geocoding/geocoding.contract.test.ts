import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  currentSchema,
  metaSchema,
  emptyDivisionHierarchies,
  createMetaDb,
  createCurrentDb,
} from '@repo/db'
import app from '../../index'
import type { AppBindings } from '../../types'

function d1(sqlite: Database): D1Database {
  return {
    prepare(query: string) {
      let params: SQLQueryBindings[] = []
      const statement = {
        bind(...values: SQLQueryBindings[]) {
          params = values
          return statement
        },
        async all() {
          return { results: sqlite.query(query).all(...params), success: true }
        },
        async first() {
          return sqlite.query(query).get(...params)
        },
        async raw() {
          return sqlite.query(query).values(...params)
        },
        async run() {
          return { meta: sqlite.query(query).run(...params), success: true }
        },
      }
      return statement
    },
  } as unknown as D1Database
}
async function fixture() {
  const databases = ['meta', 'current', 'history'].map(family => {
    const db = new Database(':memory:')
    db.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        family,
      ]).replaceAll('--> statement-breakpoint', ''),
    )
    return db
  })
  const [meta, current, history] = databases as [Database, Database, Database]
  const m = createMetaDb(d1(meta))
  const c = createCurrentDb(d1(current))
  for (const family of ['addresses', 'divisions']) {
    await m
      .insert(metaSchema.metaApiVersions)
      .values({
        id: family,
        code: `api-${family}-v0.1`,
        familyType: family as 'addresses' | 'divisions',
        version: '0.1',
        status: 'current',
        versionHash: family,
      })
      .run()
    for (const cohort of ['2025-01-01.0', '2026-08-19.0']) {
      const id = `${family}-${cohort}`
      const snapshot = `${id}-snapshot`
      await m
        .insert(metaSchema.metaSnapshots)
        .values({
          id: snapshot,
          code: snapshot,
          resourceType: family === 'addresses' ? 'address' : 'division',
          status: 'published',
          cohortKey: cohort,
        })
        .run()
      await m
        .insert(metaSchema.metaApiReleaseSets)
        .values({
          id,
          code: id,
          apiVersionId: family,
          regionCode: 'hk',
          domainCode: family === 'addresses' ? 'saanseoi' : 'geographic',
          cohortKey: cohort,
          effectiveFrom: `${cohort.slice(0, 10)}T00:00:00.000Z`,
          schemaVersion: '1',
          rulesetVersion: '1',
          status: 'current',
          publishedAt: '2026-09-01T00:00:00.000Z',
          versionHash: id,
        })
        .run()
      await m
        .insert(metaSchema.metaApiReleaseSetSnapshots)
        .values({
          apiReleaseSetId: id,
          snapshotId: snapshot,
          role: 'primary',
          variant: 'overture',
          isRequired: true,
          cohortMatchingMode: 'exact_ref',
        })
        .run()
      if (family === 'addresses') {
        await m
          .insert(metaSchema.metaApiReleaseSetSnapshots)
          .values({
            apiReleaseSetId: id,
            snapshotId: `divisions-${cohort}-snapshot`,
            role: 'enrichment',
            variant: 'overture',
            isRequired: true,
            cohortMatchingMode: 'exact_ref',
          })
          .run()
        await c
          .insert(currentSchema.addressPublicationState)
          .values({
            scopeId: id,
            snapshotId: snapshot,
            status: 'current',
            publicationToken: id,
            preparedAt: '2026-09-01',
          })
          .run()
        await c
          .insert(currentSchema.address2d)
          .values({
            snapshotId: id,
            divisionSnapshotId: `divisions-${cohort}`,
            id: 'address',
            granularity: 'building',
            geometry: { type: 'Point', coordinates: [114, 22] },
          })
          .run()
        await c
          .insert(currentSchema.address2dI18n)
          .values({
            snapshotId: id,
            addressId: 'address',
            locale: 'en',
            formattedAddress: cohort === '2025-01-01.0' ? 'Old Harbour' : 'New Harbour',
            buildingName: 'Harbour',
          })
          .run()
      } else {
        await c
          .insert(currentSchema.divisionPublicationState)
          .values({
            scopeId: id,
            snapshotId: snapshot,
            status: 'current',
            publicationToken: id,
            preparedAt: '2026-09-01',
          })
          .run()
        await c
          .insert(currentSchema.divisions)
          .values({
            snapshotId: id,
            id: 'division',
            class: 'village',
            category: 'locality',
            level: 5,
            hierarchies: emptyDivisionHierarchies(),
          })
          .run()
        await c
          .insert(currentSchema.divisionsI18n)
          .values({
            snapshotId: id,
            divisionId: 'division',
            locale: 'en',
            isLocaleInferred: false,
            name: cohort === '2025-01-01.0' ? 'Old Village' : 'New Village',
          })
          .run()
      }
    }
    const catalog = `${family}-catalog`
    await m
      .insert(metaSchema.metaApiCatalogRevisions)
      .values({
        id: catalog,
        code: catalog,
        apiVersionId: family,
        regionCode: 'hk',
        publicationDate: '2026-09-01',
        revision: 0,
        status: 'current',
        publishedAt: '2026-09-01T00:00:00.000Z',
        versionHash: catalog,
      })
      .run()
    await m
      .insert(metaSchema.metaApiCatalogRevisionReleaseSets)
      .values({
        apiCatalogRevisionId: catalog,
        apiReleaseSetId: `${family}-2026-08-19.0`,
        domainCode: family === 'addresses' ? 'saanseoi' : 'geographic',
        cohortKey: '2026-08-19.0',
        isDefault: true,
      })
      .run()
  }
  const env = {
    DB_META: d1(meta),
    DB_CURRENT: d1(current),
    DB_HISTORY_HK_BEFORE: d1(history),
    DB_HISTORY_HK_2025: d1(history),
    DB_HISTORY_HK_2026: d1(history),
    AUTH_MODE: 'disabled',
    ATLAS_BASE_URL: 'http://localhost',
    PRODUCT_USAGE: { writeDataPoint() {} },
  } as unknown as AppBindings
  return {
    retireOldAddress() {
      current.exec(
        "DELETE FROM addressPublicationState WHERE snapshotId = 'addresses-2025-01-01.0-snapshot'",
      )
      meta.exec(`INSERT INTO dataShards (id,shardType,regionCode,year,environment,databaseName,databaseId,bindingName,status,versionHash)
        VALUES ('history','history','hk','2025','preview','history','history','DB_HISTORY_HK_2025','active','hash');
        INSERT INTO snapshotShardAssignments (snapshotId,dataShardId) VALUES ('addresses-2025-01-01.0-snapshot','history');`)
      history.exec(`INSERT INTO address2d (id,granularity,geometry,versionHash,sourceReleaseId,snapshotId,isCurrent)
        VALUES ('historic-address','building','{"type":"Point","coordinates":[114,22]}','base-hash','source','addresses-2025-01-01.0-snapshot',0);
        INSERT INTO address2dI18n (addressId,locale,formattedAddress,versionHash,sourceReleaseId,snapshotId,isCurrent)
        VALUES ('historic-address','en','Historic Harbour','name-hash','source','addresses-2025-01-01.0-snapshot',0);
        INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
        VALUES ('addresses-2025-01-01.0-snapshot','address2d','historic-address','','base-hash','upsert','source'),
          ('addresses-2025-01-01.0-snapshot','address2dI18n','historic-address','en','name-hash','upsert','source');`)
    },
    removeHistory() {
      meta.exec('DELETE FROM snapshotShardAssignments')
    },
    request: (path: string, auth = false) =>
      app.request(
        `http://localhost${path}`,
        {},
        auth ? ({ ...env, AUTH_MODE: 'required' } as AppBindings) : env,
      ),
    close: () => {
      for (const db of databases) db.close()
    },
  }
}

test('HTTP auth, validation, OpenAPI and exact old pins outside the latest catalogue', async () => {
  const f = await fixture()
  try {
    expect((await f.request('/divisions/v1/geocode?lat=22&lng=114', true)).status).toBe(
      401,
    )
    expect(
      (await f.request('/divisions/v1/changes?fromApiReleaseSet=example', true)).status,
    ).toBe(401)
    expect(
      (await f.request('/divisions/v1/changes/definitions/example', true)).status,
    ).toBe(401)
    for (const oldPath of [
      '/api/v1/divisions/geocode',
      '/api/v1/addresses/geocode',
      '/api/v1/divisions/changes',
    ])
      expect((await f.request(oldPath)).status).toBe(404)
    expect((await f.request('/addresses/v1/geocode?lat=22')).status).toBe(422)
    const old = await f.request(
      '/addresses/v1/geocode?address=Old&apiReleaseSet=addresses-2025-01-01.0&include=divisions',
    )
    expect(old.status).toBe(200)
    expect(await old.json()).toMatchObject({
      data: [{ attributes: { i18n: { en: { formattedAddress: 'Old Harbour' } } } }],
      meta: {
        release: { apiReleaseSet: 'addresses-2025-01-01.0' },
        divisionRelease: { apiReleaseSet: 'divisions-2025-01-01.0' },
      },
    })
    const latest = await f.request('/addresses/v1/geocode?lat=22&lng=114')
    expect(latest.status).toBe(200)
    expect(await latest.json()).toMatchObject({
      data: [
        {
          match: { type: 'exact_location', distanceMetres: 0 },
          attributes: { i18n: { en: { formattedAddress: 'New Harbour' } } },
        },
      ],
      meta: { release: { apiReleaseSet: 'addresses-2026-08-19.0' } },
    })
    const divisions = await f.request(
      '/divisions/v1/geocode?placename=Old&apiReleaseSet=divisions-2025-01-01.0',
    )
    expect(divisions.status).toBe(200)
    expect(await divisions.json()).toMatchObject({
      data: [{ names: { en: { name: 'Old Village' } } }],
    })
    const docs = await f.request('/openapi/addresses/v1')
    expect(Object.keys(((await docs.json()) as { paths: object }).paths)).toEqual([
      '/addresses/v1/geocode',
    ])
    for (const family of ['addresses', 'divisions']) {
      for (const version of ['v0.1', 'v1']) {
        const response = await f.request(`/openapi/${family}/${version}`)
        const document = (await response.json()) as {
          paths: Record<string, { get?: { tags?: string[] } }>
          tags: { name: string }[]
        }
        expect(document.paths[`/${family}/v1/geocode`]?.get?.tags).toEqual([
          'Geocoding',
        ])
        expect(document.tags.some(tag => tag.name === 'Geocoding')).toBe(true)
        expect(
          document.paths[
            `/${family === 'addresses' ? 'divisions' : 'addresses'}/v1/geocode`
          ],
        ).toBeUndefined()
      }
    }
    f.retireOldAddress()
    const historical = await f.request(
      '/addresses/v1/geocode?address=Historic&apiReleaseSet=addresses-2025-01-01.0&include=divisions',
    )
    expect(historical.status).toBe(200)
    expect(await historical.json()).toMatchObject({
      data: [
        {
          id: 'historic-address',
          attributes: { i18n: { en: { formattedAddress: 'Historic Harbour' } } },
        },
      ],
    })
    f.removeHistory()
    expect(
      (
        await f.request(
          '/addresses/v1/geocode?lat=22&lng=114&apiReleaseSet=addresses-2025-01-01.0',
        )
      ).status,
    ).toBe(503)
  } finally {
    f.close()
  }
})
