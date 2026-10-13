import { snapshotFixtureFields } from '../../testing/snapshotFixtures'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '../../testing/localDb'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { listApiReleaseSetSnapshotsForRegistryRequest } from '../../lib/db/metaRegistry'
import { resolvePublicationSelections } from './publicationSelections'
import {
  finalisePublishedResources,
  type PublicationDatabase,
} from './publicationState'
import { publicationScopeId } from './publication/scope'

test('v0.2 curated catalogues retain older geometry pins and require complete delivery', async () => {
  const sqlite = new Database(':memory:')
  const current = new Database(':memory:')
  const migrations = resolve(import.meta.dir, '../../../../db/migrations')
  sqlite.exec(loadMigrationSql(migrations, ['meta']))
  sqlite.exec('PRAGMA foreign_keys = OFF')
  current.exec(loadMigrationSql(migrations, ['current']))
  const insert = (table: string, values: Record<string, SQLQueryBindings>) => {
    if (table === 'snapshots')
      values = snapshotFixtureFields(sqlite, values) as typeof values

    sqlite
      .query(
        `INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(
          values,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .run(...Object.values(values))
  }
  try {
    for (const [version, cohort, area] of [
      ['0.1', '2026-09-23.0', 'september-area'],
      ['0.2', '2026-10-01.0', 'august-area'],
    ]) {
      insert('apiVersions', {
        id: version!,
        code: `api-divisions-v${version}`,
        familyType: 'divisions',
        version: version!,
        status: 'current',
        versionHash: 'test',
      })
      insert('apiReleaseSets', {
        id: version!,
        code: `data-${version}`,
        regionCode: 'hk',
        domainCode: 'geographic',
        cohortKey: cohort!,
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v2',
        versionHash: 'test',
      })
      insert('apiVersionReleaseSets', {
        id: version!,
        apiVersionId: version!,
        apiReleaseSetId: version!,
        status: 'current',
        versionHash: 'test',
      })
      insert('apiCatalogRevisions', {
        id: version!,
        apiVersionId: version!,
        code: `catalog-${version}`,
        regionCode: 'hk',
        publicationDate: '2026-10-01',
        publishedAt: '2026-10-01',
        revision: 0,
        status: 'current',
        versionHash: 'test',
      })
      insert('apiCatalogRevisionReleaseSets', {
        apiCatalogRevisionId: version!,
        apiVersionReleaseSetId: version!,
        domainCode: 'geographic',
        cohortKey: cohort!,
        isDefault: 1,
      })
      insert('snapshots', {
        id: area!,
        code: area!,
        snapshotLineageId: 'overture-area',
        resourceType: 'divisionArea',
        cohortKey: area!,
        status: 'published',
      })
      insert('apiReleaseSetSnapshots', {
        apiReleaseSetId: version!,
        snapshotId: area!,
        variant: 'overture',
        role: 'geometry',
        isRequired: 1,
        cohortMatchingMode: 'exact_ref',
      })
    }
    const meta = createLocalHarbourDb(sqlite)
    const catalogue = await listApiReleaseSetSnapshotsForRegistryRequest(
      meta,
      'division',
      { apiVersion: 'api-divisions-v0.2', regionCode: 'hk', domainCode: 'geographic' },
    )
    expect(catalogue?.releaseSets.map(set => set.code)).toEqual(['data-0.2'])
    expect([...(await resolvePublicationSelections(meta)).divisionArea].sort()).toEqual(
      ['august-area', 'september-area'],
    )
    const binding: PublicationDatabase = {
      prepare(sql) {
        let values: SQLQueryBindings[] = []
        return {
          bind(...args) {
            values = args as SQLQueryBindings[]
            return this
          },
          async all<T>() {
            return { results: current.query(sql).all(...values) as T[] }
          },
          async run() {
            return current.query(sql).run(...values)
          },
        }
      },
    }
    const receipt = (id: string, preparedAt: string | null) =>
      current
        .query(
          "INSERT INTO divisionAreaPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES (?,?,'publishing','delivery',?)",
        )
        .run(publicationScopeId('divisionArea', 'overture-area', id), id, preparedAt)
    receipt('september-area', 'complete')
    receipt('august-area', null)
    await expect(
      finalisePublishedResources(meta, binding, { publishedFamilies: ['divisions'] }),
    ).rejects.toThrow('complete delivery receipts: august-area')
    current.exec(
      "UPDATE divisionAreaPublicationState SET preparedAt='complete' WHERE snapshotId='august-area'",
    )
    await finalisePublishedResources(meta, binding, {
      publishedFamilies: ['divisions'],
    })
    expect(
      current
        .query(
          "SELECT snapshotId FROM divisionAreaPublicationState WHERE status='current' ORDER BY snapshotId",
        )
        .all(),
    ).toEqual([{ snapshotId: 'august-area' }, { snapshotId: 'september-area' }])
  } finally {
    sqlite.close()
    current.close()
  }
})
