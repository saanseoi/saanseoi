import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLocalExecBinding } from '../dbCache/localDbCache.ts'
import {
  buildDivisionResetSql,
  collectDivisionResetPlan,
  divisionResetBlockers,
} from './resetDivisions.ts'

const opened: Database[] = []
afterEach(() => {
  for (const db of opened.splice(0)) db.close()
})

function database(family: string) {
  const db = new Database(':memory:')
  opened.push(db)
  db.exec('PRAGMA foreign_keys = ON')
  for (const path of globSync(
    resolve(
      import.meta.dir,
      `../../../../../libs/db/migrations/${family}/*/migration.sql`,
    ),
  ).sort()) {
    db.exec(readFileSync(path, 'utf8'))
  }
  return db
}

// Fill irrelevant required columns using their schema types, retaining actual
// migration constraints and explicitly providing the relationships under test.
function insert(
  db: Database,
  table: string,
  values: Record<string, string | number | null>,
) {
  const fields = db.query(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
    type: string
    notnull: number
    dflt_value: unknown
  }>
  const row = { ...values }
  for (const field of fields) {
    if (field.notnull && field.dflt_value === null && !(field.name in row)) {
      row[field.name] =
        field.type.toLowerCase() === 'integer' || field.type.toLowerCase() === 'real'
          ? 1
          : '{}'
    }
  }
  db.query(
    `INSERT INTO ${table} (${Object.keys(row)
      .map(key => `"${key}"`)
      .join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(...Object.values(row))
}

function setup() {
  const meta = database('meta')
  const current = database('current')
  const history = database('history')
  const source = database('source')
  insert(meta, 'publishers', { id: 'publisher', code: 'publisher' })
  insert(meta, 'datasets', { id: 'dataset', publisherId: 'publisher', code: 'dataset' })
  insert(meta, 'sourceReleases', { id: 'shared-source', datasetId: 'dataset' })
  for (const resourceType of [
    'division',
    'divisionArea',
    'divisionBoundary',
    'place',
  ]) {
    insert(meta, 'releases', {
      id: resourceType,
      code: resourceType,
      datasetId: 'dataset',
      sourceReleaseId: 'shared-source',
      resourceType,
    })
    insert(meta, 'snapshots', { id: resourceType, code: resourceType, resourceType })
    insert(meta, 'snapshotSources', {
      snapshotId: resourceType,
      datasetId: 'dataset',
      resourceReleaseId: resourceType,
    })
  }
  for (const family of ['divisions', 'places']) {
    insert(meta, 'apiVersions', { id: family, code: family, familyType: family })
    insert(meta, 'apiReleaseSets', { id: family, apiVersionId: family, code: family })
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: family,
      snapshotId: family === 'divisions' ? 'division' : 'place',
    })
    insert(meta, 'apiCatalogRevisions', {
      id: family,
      code: family,
      apiVersionId: family,
    })
    insert(meta, 'apiCatalogRevisionReleaseSets', {
      apiCatalogRevisionId: family,
      apiReleaseSetId: family,
    })
  }
  const context = {
    metaBinding: createLocalExecBinding(meta),
    currentBinding: createLocalExecBinding(current),
    historyTargets: [
      { bindingName: 'history', binding: createLocalExecBinding(history) },
    ],
  }
  return { meta, current, history, source, context }
}

describe('all-divisions reset', () => {
  test('executes on migrated schemas, removes all division kinds and preserves other families and evidence', async () => {
    const { meta, current, history, source, context } = setup()
    for (const db of [current, history]) {
      insert(db, 'divisions', {
        id: 'd',
        snapshotId: 'division',
        ...(db === current ? {} : { sourceReleaseId: 'division', versionHash: 'v' }),
      })
      insert(db, 'divisionAreas', {
        id: 'a',
        divisionId: 'd',
        snapshotId: 'divisionArea',
        ...(db === current
          ? {}
          : { sourceReleaseId: 'divisionArea', versionHash: 'v' }),
      })
      insert(db, 'divisionBoundaries', {
        id: 'b',
        leftDivisionId: 'd',
        rightDivisionId: 'd',
        snapshotId: 'divisionBoundary',
        ...(db === current
          ? {}
          : { sourceReleaseId: 'divisionBoundary', versionHash: 'v' }),
      })
    }
    insert(source, 'overtureDivisions', { sourceRecordId: 'd', releaseId: 'division' })
    insert(source, 'overturePlaces', { sourceRecordId: 'p', releaseId: 'place' })
    insert(history, 'snapshotVersionChanges', {
      snapshotId: 'division',
      recordType: 'division',
      recordId: 'd',
    })
    insert(history, 'snapshotVersionChanges', {
      snapshotId: 'place',
      recordType: 'place',
      recordId: 'p',
    })
    insert(meta, 'assets', {
      id: 'asset',
      releaseId: 'division',
      assetKey: 'retained-evidence',
    })
    expect(await divisionResetBlockers(context)).toEqual([])
    const plan = await collectDivisionResetPlan(context)
    expect(plan.releases).toHaveLength(3)
    insert(history, 'sourceResolutions', {
      scopeId: 'snapshot:division',
      snapshotId: 'division',
      sourceReleaseId: 'division',
    })
    insert(history, 'sourceResolutions', {
      scopeId: 'snapshot:place',
      snapshotId: 'place',
      sourceReleaseId: 'place',
    })
    const sql = buildDivisionResetSql(plan)
    source.exec(sql.sourceSql)
    history.exec(sql.historySql)
    expect(history.query('SELECT scopeId FROM sourceResolutions').all()).toEqual([
      { scopeId: 'snapshot:place' },
    ])
    current.exec(sql.currentSql)
    meta.exec(sql.metaSql)
    for (const db of [current, history]) {
      for (const table of ['divisions', 'divisionAreas', 'divisionBoundaries']) {
        expect(db.query(`SELECT * FROM ${table}`).all()).toHaveLength(0)
      }
    }
    expect(meta.query('SELECT id FROM releases').all()).toEqual([{ id: 'place' }])
    expect(meta.query('SELECT id FROM snapshots').all()).toEqual([{ id: 'place' }])
    expect(meta.query('SELECT id FROM apiReleaseSets').all()).toEqual([
      { id: 'places' },
    ])
    expect(meta.query('SELECT id FROM apiCatalogRevisions').all()).toEqual([
      { id: 'places' },
    ])
    expect(meta.query('SELECT id FROM sourceReleases').all()).toEqual([
      { id: 'shared-source' },
    ])
    expect(meta.query('SELECT releaseId FROM assets').all()).toEqual([
      { releaseId: null },
    ])
    expect(source.query('SELECT * FROM overtureDivisions').all()).toHaveLength(0)
    expect(source.query('SELECT * FROM overturePlaces').all()).toHaveLength(1)
    expect(
      history.query('SELECT snapshotId FROM snapshotVersionChanges').all(),
    ).toEqual([{ snapshotId: 'place' }])
    expect(meta.query('PRAGMA foreign_key_check').all()).toEqual([])
    // An empty repeat is safe and keeps the retained unrelated family.
    meta.exec(buildDivisionResetSql(await collectDivisionResetPlan(context)).metaSql)
    expect(meta.query('SELECT id FROM releases').all()).toEqual([{ id: 'place' }])
  })

  test('blocks other snapshot sources and API anchor dependencies', async () => {
    const { meta, context } = setup()
    insert(meta, 'snapshotSources', {
      snapshotId: 'place',
      datasetId: 'dataset',
      resourceReleaseId: 'division',
    })
    meta.exec(
      "UPDATE apiReleaseSetSnapshots SET anchorSnapshotId = 'divisionArea' WHERE apiReleaseSetId = 'places'",
    )
    expect(await divisionResetBlockers(context)).toEqual([
      'Other snapshot families use division releases',
      'Other API families use division snapshots',
    ])
  })

  test('blocks retained address history and statistics geometry references', async () => {
    const { current, history, context } = setup()
    insert(history, 'address2d', {
      id: 'address',
      snapshotId: 'address',
      countryId: 'd',
    })
    insert(current, 'statsRecords', {
      id: 'stat',
      geography: '{"areaCompanion":{"domainCode":"GEOGRAPHIC"}}',
    })
    expect(await divisionResetBlockers(context)).toContain(
      'history: addresses reference divisions',
    )
    expect(await divisionResetBlockers(context)).toContain(
      'current: statistics reference divisions or geometry companions',
    )
  })

  test('blocks exact metadata lookup dependencies without requiring current materialisations', async () => {
    const { meta, context } = setup()
    insert(meta, 'snapshotAssembly', {
      id: 'lookup',
      code: 'lookup',
      resourceType: 'place',
    })
    insert(meta, 'snapshotAssemblyRuns', {
      id: 'lookup',
      snapshotId: 'place',
      snapshotAssemblyId: 'lookup',
      selectionSummaryJson: JSON.stringify({
        lookupSnapshotIds: { division: 'division' },
      }),
    })
    expect(await divisionResetBlockers(context)).toEqual([
      'Other snapshots retain exact division lookup dependencies',
    ])
  })

  test('bounds SQL for many releases and escapes identifiers as values', () => {
    const releases = Array.from({ length: 205 }, (_, index) => ({
      id: `release-'${index}`,
      sourceReleaseId: `source-${index}`,
    }))
    const sql = buildDivisionResetSql({
      releases,
      snapshots: [],
      releaseSets: [],
    }).sourceSql
    const statements = sql.split('\n')
    expect(statements).toHaveLength(9 * 5)
    expect(statements[0]).toContain("'release-''0'")
    expect(statements.every(statement => statement.length < 2000)).toBe(true)
  })
})
