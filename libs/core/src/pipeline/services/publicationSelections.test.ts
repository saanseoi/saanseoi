import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../../testing/localDb'
import { listRetainedGeometrySnapshotIds } from '../../lib/db/geometrySnapshotRetention'
import { resolvePublicationSelections } from './publicationSelections'
import { publicationScopeId } from './publication/scope'
import {
  finalisePublishedResources,
  type PublicationDatabase,
} from './publicationState'

function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE publishers(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE datasets(id TEXT PRIMARY KEY,publisherId TEXT,code TEXT,regionCode TEXT,sourceVariant TEXT);
    CREATE TABLE releases(id TEXT PRIMARY KEY,datasetId TEXT,resourceType TEXT,status TEXT);
    CREATE TABLE snapshotLineages(id TEXT PRIMARY KEY,variant TEXT);
    CREATE TABLE snapshots(id TEXT PRIMARY KEY,snapshotLineageId TEXT,parentSnapshotId TEXT,resourceType TEXT,
      cohortKey TEXT,geometryStatus TEXT,revision INTEGER,status TEXT,publishedAt TEXT,createdAt TEXT);
    CREATE TABLE snapshotSources(snapshotId TEXT,datasetId TEXT,resourceReleaseId TEXT,role TEXT);
    CREATE TABLE apiVersions(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE apiCatalogRevisions(id TEXT PRIMARY KEY,apiVersionId TEXT,code TEXT,regionCode TEXT,status TEXT,publishedAt TEXT,revision INTEGER);
    CREATE TABLE apiReleaseSets(id TEXT PRIMARY KEY,code TEXT,effectiveFrom TEXT,effectiveTo TEXT,revision INTEGER,schemaVersion TEXT,rulesetVersion TEXT);
    CREATE TABLE apiCatalogRevisionReleaseSets(apiCatalogRevisionId TEXT,apiReleaseSetId TEXT,domainCode TEXT,cohortKey TEXT,isDefault INTEGER);
    CREATE TABLE apiReleaseSetSnapshots(apiReleaseSetId TEXT,snapshotId TEXT,variant TEXT,role TEXT);
    CREATE TABLE divisionAreaPublicationState(snapshotId TEXT UNIQUE NOT NULL,scopeId TEXT PRIMARY KEY,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
    CREATE TABLE divisionBoundaryPublicationState(snapshotId TEXT UNIQUE NOT NULL,scopeId TEXT PRIMARY KEY,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
    INSERT INTO publishers VALUES ('publisher','overture');
    INSERT INTO datasets VALUES ('geometry','publisher','ds-hk-overture-division-area','hk','overture');
    INSERT INTO snapshotLineages VALUES ('overture','overture');
  `)
  const meta = createLocalHarbourDb(sqlite)
  function geometry(
    id: string,
    options: {
      sourceStatus?: string
      type?: 'divisionArea' | 'divisionBoundary'
      cohort?: string
      parent?: string
      publishedAt?: string
      receipt?: boolean
    } = {},
  ) {
    const type = options.type ?? 'divisionArea'
    sqlite
      .query('INSERT INTO releases VALUES (?, ?, ?, ?)')
      .run(id, 'geometry', type, options.sourceStatus ?? 'published')
    sqlite
      .query(
        "INSERT INTO snapshots VALUES (?,'overture',?,?,?,'authoritative',0,'published',?,?)",
      )
      .run(
        id,
        options.parent ?? null,
        type,
        options.cohort ?? '2026-08',
        options.publishedAt ?? '2026-09-01',
        options.publishedAt ?? '2026-09-01',
      )
    sqlite
      .query("INSERT INTO snapshotSources VALUES (?,'geometry',?,'primary')")
      .run(id, id)
    if (options.receipt !== false)
      sqlite
        .query(
          `INSERT INTO ${type}PublicationState VALUES (?,?,'publishing',?,'complete','2026-09-01')`,
        )
        .run(id, publicationScopeId(type, 'overture', options.cohort ?? '2026-08'), id)
  }
  function catalogue(
    id: string,
    family: 'divisions' | 'stats',
    options: { publishedAt?: string; status?: string } = {},
  ) {
    sqlite
      .query('INSERT OR IGNORE INTO apiVersions VALUES (?, ?)')
      .run(family, `api-${family}-v0.1`)
    sqlite
      .query("INSERT INTO apiCatalogRevisions VALUES (?, ?, ?, 'hk', ?, ?, 0)")
      .run(
        id,
        family,
        id,
        options.status ?? 'current',
        options.publishedAt ?? '2026-09-01',
      )
  }
  function member(
    catalogueId: string,
    id: string,
    geometryIds: string[],
    options: { domain?: string; cohort?: string; isDefault?: boolean } = {},
  ) {
    sqlite
      .query(
        "INSERT INTO apiReleaseSets VALUES (?,?,'2026-09-01',NULL,0,'schema','rules')",
      )
      .run(id, id)
    sqlite
      .query('INSERT INTO apiCatalogRevisionReleaseSets VALUES (?,?,?,?,?)')
      .run(
        catalogueId,
        id,
        options.domain ?? 'geographic',
        options.cohort ?? '2026-08',
        options.isDefault === false ? 0 : 1,
      )
    for (const geometryId of geometryIds)
      sqlite
        .query(
          "INSERT INTO apiReleaseSetSnapshots VALUES (?,?,'overture','supporting')",
        )
        .run(id, geometryId)
  }
  const binding = {
    prepare(query: string) {
      let values: SQLQueryBindings[] = []
      return {
        bind(...args: unknown[]) {
          values = args as SQLQueryBindings[]
          return this
        },
        async all() {
          return { results: sqlite.query(query).all(...values) }
        },
        async run() {
          return sqlite.query(query).run(...values)
        },
      }
    },
  } as PublicationDatabase
  return { sqlite, meta, geometry, catalogue, member, binding }
}

test('API-pinned companions survive source supersession until the serving selection advances', async () => {
  const f = fixture()
  try {
    f.geometry('old-area', { sourceStatus: 'superseded', receipt: false })
    f.geometry('new-area', { parent: 'old-area', publishedAt: '2026-09-02' })
    f.geometry('old-boundary', {
      sourceStatus: 'superseded',
      type: 'divisionBoundary',
      receipt: false,
    })
    f.geometry('new-boundary', {
      parent: 'old-boundary',
      type: 'divisionBoundary',
      publishedAt: '2026-09-02',
    })
    f.geometry('independent-census', { cohort: '2016' })
    f.geometry('future-area', {
      parent: 'new-area',
      sourceStatus: 'processing',
      receipt: false,
      publishedAt: '2026-09-03',
    })
    f.geometry('independent-branch', { sourceStatus: 'superseded', receipt: false })
    f.catalogue('serving', 'divisions')
    f.member('serving', 'selected', ['old-area', 'old-boundary'])
    expect([...(await listRetainedGeometrySnapshotIds(f.meta))].sort()).toEqual([
      'independent-census',
      'new-area',
      'new-boundary',
    ])
    const selection = await resolvePublicationSelections(f.meta)
    expect([...selection.divisionArea].sort()).toEqual([
      'independent-census',
      'new-area',
      'old-area',
    ])
    expect([...selection.divisionBoundary].sort()).toEqual([
      'new-boundary',
      'old-boundary',
    ])
    await finalisePublishedResources(f.meta, f.binding, {
      snapshotIds: ['new-area', 'new-boundary'],
    })
    expect(
      f.sqlite
        .query(
          "SELECT status FROM divisionAreaPublicationState WHERE snapshotId='new-area'",
        )
        .get(),
    ).toEqual({ status: 'current' })
    expect(
      f.sqlite
        .query(
          "SELECT status FROM divisionBoundaryPublicationState WHERE snapshotId='new-boundary'",
        )
        .get(),
    ).toEqual({ status: 'current' })
    f.sqlite.exec(
      "UPDATE apiReleaseSetSnapshots SET snapshotId='new-area' WHERE snapshotId='old-area'; UPDATE apiReleaseSetSnapshots SET snapshotId='new-boundary' WHERE snapshotId='old-boundary'",
    )
    await finalisePublishedResources(f.meta, f.binding, {
      snapshotIds: ['new-area', 'new-boundary'],
    })
    expect(
      f.sqlite
        .query(
          'SELECT snapshotId FROM divisionAreaPublicationState ORDER BY snapshotId',
        )
        .all(),
    ).toEqual([{ snapshotId: 'independent-census' }, { snapshotId: 'new-area' }])
    expect(
      f.sqlite.query('SELECT snapshotId FROM divisionBoundaryPublicationState').all(),
    ).toEqual([{ snapshotId: 'new-boundary' }])
  } finally {
    f.sqlite.close()
  }
})

test('Statistics protects all periods in the serving catalogue and excludes draft or superseded catalogues', async () => {
  const f = fixture()
  try {
    for (const id of [
      'period-2016',
      'period-2021',
      'stale-catalogue-area',
      'draft-catalogue-area',
    ])
      f.geometry(id, { sourceStatus: 'superseded', receipt: false })
    f.catalogue('old-catalogue', 'stats', { publishedAt: '2026-08-01' })
    f.member('old-catalogue', 'old-selection', ['stale-catalogue-area'], {
      domain: 'government',
    })
    f.catalogue('serving', 'stats')
    f.member('serving', 'stats-2016', ['period-2016'], {
      domain: 'government',
      cohort: '2016',
      isDefault: false,
    })
    f.member('serving', 'stats-2021', ['period-2021'], {
      domain: 'government',
      cohort: '2021',
    })
    f.catalogue('draft-catalogue', 'stats', {
      publishedAt: '2026-10-01',
      status: 'draft',
    })
    f.member('draft-catalogue', 'draft-selection', ['draft-catalogue-area'], {
      domain: 'government',
    })
    expect(
      [...(await resolvePublicationSelections(f.meta)).divisionArea].sort(),
    ).toEqual(['period-2016', 'period-2021'])
  } finally {
    f.sqlite.close()
  }
})
