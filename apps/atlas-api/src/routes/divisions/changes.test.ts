import { seedSnapshotProducerFixtures } from '../../../../../libs/core/src/testing/snapshotFixtures'
import { snapshotFixtureFields } from '../../../../../libs/core/src/testing/snapshotFixtures'
import { expect, test } from 'bun:test'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolve } from 'node:path'
import { OpenAPIHono } from '@hono/zod-openapi'
import {
  createMetaDb,
  createCurrentDb,
  createHistoryDb,
  emptyDivisionHierarchies,
} from '@repo/db'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import { createMockD1 } from '../statistics/v0/statisticsFixtures'
import { divisionChangesRoute, divisionChangeDefinitionRoute } from './changes'
import { resolveDivisionChangesRelease } from '../../db/divisionChanges'
import type { AppEnv } from '../../types'
import type { DivisionChangesResponse } from '../../schema/divisionChanges'
import { defaultOpenAPIHook } from '../../lib/openapi'

const stamp = '2026-09-13T00:00:00.000Z'
function fixture() {
  function database(family: string) {
    const db = new Database(':memory:')
    db.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
        family,
      ]).replaceAll('--> statement-breakpoint', ''),
    )
    return db
  }
  const meta = database('meta'),
    current = database('current'),
    history = database('history')
  function insert(
    db: Database,
    table: string,
    values: Record<string, SQLQueryBindings>,
  ) {
    if (table === 'snapshots')
      values = snapshotFixtureFields(db, values) as typeof values

    const keys = Object.keys(values)
    db.query(
      `INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ).run(
      ...Object.entries(values).map(([key, value]) =>
        key === 'meta' && value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : value,
      ),
    )
  }
  const timestamps = { createdAt: stamp, updatedAt: stamp }
  insert(meta, 'apiVersions', {
    id: 'version',
    code: 'api-divisions-v0.1',
    familyType: 'divisions',
    version: '0.1',
    status: 'current',
    versionHash: 'version',
    ...timestamps,
  })
  insert(meta, 'apiCatalogRevisions', {
    id: 'catalogue',
    code: 'catalogue',
    apiVersionId: 'version',
    regionCode: 'hk',
    publicationDate: '2026-09-13',
    revision: 0,
    defaultDomainCode: 'geographic',
    status: 'current',
    publishedAt: stamp,
    versionHash: 'catalogue',
    ...timestamps,
  })
  insert(meta, 'dataShards', {
    id: 'shard',
    shardType: 'history',
    regionCode: 'hk',
    year: '2026',
    environment: 'preview',
    databaseName: 'history',
    databaseId: 'history',
    bindingName: 'DB_HISTORY_HK_2026',
    status: 'active',
    versionHash: 'shard',
    ...timestamps,
  })
  function publication(
    code: string,
    isDefault: boolean,
    status = 'current',
    domain = 'geographic',
  ) {
    insert(meta, 'snapshots', {
      id: `snapshot-${code}`,
      code: `snapshot-${code}`,
      resourceType: 'division',
      cohortKey: code,
      revision: 0,
      status: 'published',
      publishedAt: stamp,
      ...timestamps,
    })
    insert(meta, 'apiReleaseSets', {
      id: `id-${code}`,
      code,
      regionCode: 'hk',
      domainCode: domain,
      cohortKey: code,
      revision: 0,
      schemaVersion: '1',
      rulesetVersion: '1',
      versionHash: code,
      ...timestamps,
    })
    insert(meta, 'apiVersionReleaseSets', {
      id: `association-${code}`,
      apiVersionId: 'version',
      apiReleaseSetId: `id-${code}`,
      versionHash: code,
      status,
      publishedAt: status === 'draft' ? null : stamp,
      ...timestamps,
    })
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: `id-${code}`,
      snapshotId: `snapshot-${code}`,
      variant: 'overture',
      role: 'primary',
      isRequired: 1,
      cohortMatchingMode: 'exact_ref',
      createdAt: stamp,
    })
    insert(meta, 'snapshotShardAssignments', {
      snapshotId: `snapshot-${code}`,
      dataShardId: 'shard',
    })
    if (isDefault) {
      meta.exec('UPDATE apiCatalogRevisionReleaseSets SET isDefault=0')
      insert(meta, 'apiCatalogRevisionReleaseSets', {
        apiCatalogRevisionId: 'catalogue',
        apiVersionReleaseSetId: `association-${code}`,
        domainCode: domain,
        cohortKey: code,
        isDefault: 1,
        createdAt: stamp,
      })
    }
  }
  function row(id: string, label: string, snapshot: string, retained = false) {
    const base = {
      id,
      category: 'administrative',
      class: 'district',
      level: 2,
      hierarchies: JSON.stringify(emptyDivisionHierarchies()),
      createdAt: stamp,
    }
    if (retained) {
      insert(history, 'divisions', {
        ...base,
        snapshotId: snapshot,
        versionHash: `${id}-version`,

        isCurrent: 0,
      })
      insert(history, 'divisionsI18n', {
        snapshotId: snapshot,
        divisionId: id,
        locale: 'en',
        name: label,
        versionHash: `${id}-name`,

        isCurrent: 0,
        createdAt: stamp,
        meta: { isLocaleInferred: false },
      })
    } else {
      insert(current, 'divisions', { ...base, scopeId: snapshot, updatedAt: stamp })
      insert(current, 'divisionsI18n', {
        scopeId: snapshot,
        divisionId: id,
        locale: 'en',
        name: label,
        ...timestamps,
        meta: { isLocaleInferred: false },
      })
    }
  }
  publication('old', false, 'archived')
  publication('new', true)
  insert(current, 'divisionPublicationState', {
    snapshotId: 'snapshot-new',
    scopeId: 'scope-new',
    status: 'current',
    publicationToken: 'token',
    preparedAt: stamp,
  })
  row('a', 'Old A', 'snapshot-old', true)
  row('deleted', 'Deleted', 'snapshot-old', true)
  row('a', 'New A', 'scope-new')
  row('added', 'Added', 'scope-new')
  // D1 raw preserves duplicate SQL column names in joins; object values do not.
  function d1(sqlite: Database): D1Database {
    const binding = createMockD1(sqlite)
    const prepare = binding.prepare.bind(binding)
    binding.prepare = query => {
      const statement = prepare(query)
      const bind = statement.bind.bind(statement)
      let values: SQLQueryBindings[] = []
      statement.bind = (...next: SQLQueryBindings[]) => {
        values = next
        bind(...next)
        return statement
      }
      statement.raw = (async () =>
        sqlite.query(query).values(...values)) as D1PreparedStatement['raw']
      return statement
    }
    return binding
  }
  const db = {
    metaDb: createMetaDb(d1(meta)),
    currentDb: createCurrentDb(d1(current)),
    historyDbsByBinding: {
      DB_HISTORY_HK_2026: createHistoryDb(d1(history)),
    } as AppEnv['Variables']['historyDbsByBinding'],
  }
  const app = new OpenAPIHono<AppEnv>({ defaultHook: defaultOpenAPIHook })
  app.use('*', async (c, next) => {
    c.set('metaDb', db.metaDb)
    c.set('currentDb', db.currentDb)
    c.set('historyDbsByBinding', db.historyDbsByBinding)
    await next()
  })
  app.openapiRoutes([divisionChangesRoute, divisionChangeDefinitionRoute])
  seedSnapshotProducerFixtures(meta)
  return {
    app,
    db,
    meta,
    history,
    publication,
    close: () => {
      meta.close()
      current.close()
      history.close()
    },
  }
}

test('real HTTP/SQLite: archived history outside latest catalogue, current target and immutable definition links', async () => {
  const f = fixture()
  try {
    const response = await f.app.request(
      'http://test/divisions/v1/changes?fromReleaseSet=old&page[limit]=1',
    )
    expect(response.status).toBe(200)
    const first = (await response.json()) as DivisionChangesResponse
    expect(first.meta.fromApiReleaseSet.id).toBe('id-old')
    expect(first.data[0]).toMatchObject({
      divisionId: 'a',
      changedFields: ['names'],
      canAffectGeocodingMembership: false,
    })
    f.publication('newer', true)
    const second = await f.app.request(first.links.next!)
    expect(second.status).toBe(200)
    const secondBody = (await second.json()) as DivisionChangesResponse
    expect(secondBody.meta.toApiReleaseSet.id).toBe('id-new')
    expect(secondBody.data[0]!.divisionId).toBe('added')
    const third = await f.app.request(secondBody.links.next!)
    const thirdBody = (await third.json()) as DivisionChangesResponse
    expect(thirdBody.data[0]!.divisionId).toBe('deleted')
    const definition = await f.app.request(thirdBody.data[0]!.before!.record)
    expect(definition.status).toBe(200)
    expect((await definition.json()) as unknown).toEqual({
      ...thirdBody.data[0]!.before,
      membershipGeometry: [],
    })
    expect(thirdBody.links.next).toBeNull()
  } finally {
    f.close()
  }
})

test('real release resolution rejects drafts, unknown sets, incompatible domains and unavailable shards', async () => {
  const f = fixture()
  try {
    f.publication('draft', false, 'draft')
    f.publication('stats', false, 'current', 'census')
    expect((await resolveDivisionChangesRelease(f.db.metaDb, 'id-old')).code).toBe(
      'old',
    )
    for (const [pin, status, code] of [
      ['draft', 503, 'release_set_unavailable'],
      ['missing', 503, 'release_set_unavailable'],
      ['stats', 409, 'incompatible_release_sets'],
    ] as const) {
      const response = await f.app.request(
        `http://test/divisions/v1/changes?fromReleaseSet=${pin}`,
      )
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ error: code })
    }
    f.meta.exec("DELETE FROM snapshotShardAssignments WHERE snapshotId='snapshot-old'")
    const response = await f.app.request(
      'http://test/divisions/v1/changes?fromReleaseSet=old',
    )
    expect(response.status).toBe(503)
  } finally {
    f.close()
  }
})

test.each(['divisions', 'divisionsI18n'])(
  'missing retained %s tables fail instead of fabricating changes',
  async table => {
    const f = fixture()
    try {
      f.history.exec(`DROP TABLE ${table}`)
      const response = await f.app.request(
        'http://test/divisions/v1/changes?fromReleaseSet=old',
      )
      expect(response.status).toBe(500)
    } finally {
      f.close()
    }
  },
)

test('missing retained parent snapshots produce an explicit unavailable response', async () => {
  const f = fixture()
  try {
    f.meta.exec(
      "UPDATE snapshots SET parentSnapshotId='missing-parent' WHERE id='snapshot-old'",
    )
    const response = await f.app.request(
      'http://test/divisions/v1/changes?fromReleaseSet=old',
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'release_set_unavailable' })
  } finally {
    f.close()
  }
})

test('HTTP validates the required source selector and publishes both OpenAPI contracts', async () => {
  const f = fixture()
  try {
    const response = await f.app.request('http://test/divisions/v1/changes')
    expect(response.status).toBe(422)
    const doc = f.app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'test', version: '1' },
    })
    expect(doc.paths?.['/divisions/v1/changes']?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: 'fromReleaseSet', required: true }),
    )
    expect(doc.paths?.['/divisions/v1/changes/definitions/{id}']).toBeDefined()
  } finally {
    f.close()
  }
})
