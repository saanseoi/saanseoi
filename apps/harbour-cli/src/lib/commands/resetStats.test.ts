import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLocalExecBinding } from '../dbCache/localDbCache.ts'
import {
  buildStatsResetSql,
  collectStatsResetPlan,
  statsResetBlockers,
} from './resetStats.ts'

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
  const geometryFamily = {
    divisions: 'division',
    divisionsI18n: 'division',
    divisionAreas: 'divisionArea',
    divisionBoundaries: 'divisionBoundary',
  }[table]
  if (
    geometryFamily &&
    values.snapshotId &&
    db.query("SELECT 1 FROM sqlite_master WHERE name='divisionPublicationState'").get()
  ) {
    const scopeId = `scope:${geometryFamily}:${values.snapshotId}`
    db.query(`INSERT INTO ${geometryFamily}PublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES (?,?,'current','complete-token','complete') ON CONFLICT(scopeId) DO NOTHING`).run(
      scopeId,
      values.snapshotId,
    )
    values = { ...values, snapshotId: scopeId }
  }
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
  for (const resourceType of ['divisionStatistic', 'divisionArea', 'place']) {
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
  for (const family of ['stats', 'places']) {
    insert(meta, 'apiVersions', { id: family, code: family, familyType: family })
    insert(meta, 'apiReleaseSets', { id: family, apiVersionId: family, code: family })
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: family,
      snapshotId: family === 'stats' ? 'divisionStatistic' : 'place',
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

describe('all-statistics reset', () => {
  test('removes statistics on migrated schemas while preserving geometry, other families and evidence', async () => {
    const { meta, current, history, source, context } = setup()
    for (const db of [current, history]) {
      insert(db, 'divisions', { id: 'd', snapshotId: 'divisionArea' })
      for (const table of [
        'statsRecords',
        'statsFields',
        'statsMeasures',
        'statsFieldsI18n',
        'statsMeasuresI18n',
        'statsValuesI18n',
        'divisionStatistics',
      ]) {
        insert(db, table, {
          ...(table === 'statsRecords' || table === 'divisionStatistics'
            ? { id: 'stat' }
            : {}),
        })
      }
    }
    insert(source, 'hkgovCenstatdStatistics', {
      sourceRecordId: 's',
      releaseId: 'divisionStatistic',
    })
    insert(source, 'hkgovCenstatdDistrictLandAreaPopulationDensities', {
      sourceRecordId: 's',
      releaseId: 'divisionStatistic',
    })
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: 'stats',
      snapshotId: 'divisionArea',
    })
    insert(source, 'overturePlaces', { sourceRecordId: 'p', releaseId: 'place' })
    insert(history, 'snapshotVersionChanges', {
      snapshotId: 'divisionStatistic',
      recordType: 'divisionStatistic',
      recordId: 'd',
    })
    insert(history, 'snapshotVersionChanges', {
      snapshotId: 'place',
      recordType: 'place',
      recordId: 'p',
    })
    insert(meta, 'assets', {
      id: 'asset',
      releaseId: 'divisionStatistic',
      assetKey: 'retained-evidence',
    })
    expect(await statsResetBlockers(context)).toEqual([])
    const plan = await collectStatsResetPlan(context)
    expect(plan.releases).toHaveLength(1)
    insert(history, 'sourceResolutions', {
      scopeId: 'release:divisionStatistic',
      snapshotId: null,
      sourceReleaseId: 'divisionStatistic',
    })
    insert(history, 'sourceResolutions', {
      scopeId: 'snapshot:place',
      snapshotId: 'place',
      sourceReleaseId: 'place',
    })
    const sql = buildStatsResetSql(plan)
    source.exec(sql.sourceSql)
    history.exec(sql.historySql)
    expect(history.query('SELECT scopeId FROM sourceResolutions').all()).toEqual([
      { scopeId: 'snapshot:place' },
    ])
    current.exec(sql.currentSql)
    meta.exec(sql.metaSql)
    for (const db of [current, history]) {
      for (const table of [
        'statsRecords',
        'statsFields',
        'statsMeasures',
        'statsFieldsI18n',
        'statsMeasuresI18n',
        'statsValuesI18n',
        'divisionStatistics',
      ]) {
        expect(db.query(`SELECT * FROM ${table}`).all()).toHaveLength(0)
      }
      expect(db.query('SELECT id FROM divisions').all()).toEqual([{ id: 'd' }])
    }
    expect(meta.query('SELECT id FROM releases').all()).toEqual([
      { id: 'divisionArea' },
      { id: 'place' },
    ])
    expect(meta.query('SELECT id FROM snapshots').all()).toEqual([
      { id: 'divisionArea' },
      { id: 'place' },
    ])
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
    expect(source.query('SELECT * FROM hkgovCenstatdStatistics').all()).toHaveLength(0)
    expect(
      source
        .query('SELECT * FROM hkgovCenstatdDistrictLandAreaPopulationDensities')
        .all(),
    ).toHaveLength(0)
    expect(source.query('SELECT * FROM overturePlaces').all()).toHaveLength(1)
    expect(
      history.query('SELECT snapshotId FROM snapshotVersionChanges').all(),
    ).toEqual([{ snapshotId: 'place' }])
    expect(meta.query('PRAGMA foreign_key_check').all()).toEqual([])
    // An empty repeat is safe and keeps the retained unrelated family.
    meta.exec(buildStatsResetSql(await collectStatsResetPlan(context)).metaSql)
    expect(meta.query('SELECT id FROM releases').all()).toEqual([
      { id: 'divisionArea' },
      { id: 'place' },
    ])
  })

  test('blocks other snapshot sources and API anchor dependencies', async () => {
    const { meta, context } = setup()
    insert(meta, 'snapshotSources', {
      snapshotId: 'place',
      datasetId: 'dataset',
      resourceReleaseId: 'divisionStatistic',
    })
    meta.exec(
      "UPDATE apiReleaseSetSnapshots SET anchorSnapshotId = 'divisionStatistic' WHERE apiReleaseSetId = 'places'",
    )
    expect(await statsResetBlockers(context)).toEqual([
      'Other snapshot families use statistics releases',
      'Other API families use statistics snapshots',
    ])
  })

  test('bounds SQL for many releases and escapes identifiers as values', () => {
    const releases = Array.from({ length: 205 }, (_, index) => ({
      id: `release-'${index}`,
      sourceReleaseId: `source-${index}`,
    }))
    const sql = buildStatsResetSql({
      releases,
      snapshots: [],
      releaseSets: [],
      catalogRevisions: [],
      dependencies: {
        publications: [],
        sources: [],
        assemblies: [],
        members: [],
        catalogMembers: [],
      },
    }).sourceSql
    const statements = sql.split('\n')
    expect(statements).toHaveLength(4 * 5)
    expect(statements[0]).toContain("'release-''0'")
    expect(statements.every(statement => statement.length < 2000)).toBe(true)
  })

  test('retracts geometry owned by stats datasets', async () => {
    const { meta, current, history, source, context } = setup()
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    insert(meta, 'snapshots', {
      id: 'simplified',
      code: 'simplified',
      resourceType: 'divisionArea',
    })
    insert(meta, 'snapshotSources', {
      snapshotId: 'simplified',
      datasetId: 'dataset',
      resourceReleaseId: 'divisionArea',
    })
    for (const db of [current, history]) {
      insert(db, 'divisions', { id: 'owned', snapshotId: 'divisionArea' })
      insert(db, 'divisionAreas', {
        id: 'area',
        divisionId: 'owned',
        snapshotId: 'simplified',
      })
      insert(db, 'divisionsI18n', {
        divisionId: 'owned',
        snapshotId: 'divisionArea',
        locale: 'en',
      })
    }
    for (const table of [
      'hkgovCenstatdDivisionAreas',
      'hkgovCenstatdDivisionAreaDerivatives',
    ]) {
      insert(source, table, { sourceRecordId: 'geometry', releaseId: 'divisionArea' })
    }
    const plan = await collectStatsResetPlan(context)
    expect(plan.releases.map(row => row.id)).toEqual([
      'divisionArea',
      'divisionStatistic',
    ])
    expect(plan.snapshots.map(row => row.id)).toEqual([
      'divisionArea',
      'divisionStatistic',
      'simplified',
    ])
    expect(await statsResetBlockers(context)).toEqual([])
    const sql = buildStatsResetSql(plan)
    source.exec(sql.sourceSql)
    history.exec(sql.historySql)
    current.exec(sql.currentSql)
    meta.exec(sql.metaSql)
    expect(current.query('SELECT * FROM divisions').all()).toHaveLength(0)
    expect(history.query('SELECT * FROM divisions').all()).toHaveLength(0)
    expect(meta.query('SELECT id FROM releases').all()).toEqual([{ id: 'place' }])
    expect(meta.query('SELECT id FROM snapshots').all()).toEqual([{ id: 'place' }])
    expect(meta.query('PRAGMA foreign_key_check').all()).toEqual([])
    for (const db of [current, history]) {
      expect(db.query('SELECT * FROM divisionAreas').all()).toHaveLength(0)
      expect(db.query('SELECT * FROM divisionsI18n').all()).toHaveLength(0)
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    }
    expect(source.query('SELECT * FROM hkgovCenstatdDivisionAreas').all()).toHaveLength(
      0,
    )
    expect(
      source.query('SELECT * FROM hkgovCenstatdDivisionAreaDerivatives').all(),
    ).toHaveLength(0)
  })

  test('finds surviving geometry without a statistics release and blocks external API consumers', async () => {
    const { meta, context } = setup()
    const statsOnly = buildStatsResetSql(await collectStatsResetPlan(context))
    meta.exec(statsOnly.metaSql)
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    expect((await collectStatsResetPlan(context)).releases.map(row => row.id)).toEqual([
      'divisionArea',
    ])
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: 'places',
      snapshotId: 'divisionArea',
    })
    expect(await statsResetBlockers(context)).toEqual([
      'Other API families use statistics snapshots',
    ])
  })

  test('blocks non-geographic lookup consumers and retains mixed-source inputs', async () => {
    const { meta, context } = setup()
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    insert(meta, 'snapshotSources', {
      snapshotId: 'place',
      datasetId: 'dataset',
      resourceReleaseId: 'divisionArea',
      role: 'lookup',
    })
    expect((await collectStatsResetPlan(context)).snapshots.map(row => row.id)).toEqual(
      ['divisionArea', 'divisionStatistic'],
    )
    expect(await statsResetBlockers(context)).toContain(
      'Other snapshot families use statistics releases',
    )
    insert(meta, 'snapshotSources', {
      snapshotId: 'divisionArea',
      datasetId: 'dataset',
      resourceReleaseId: 'place',
    })
    expect(
      (await collectStatsResetPlan(context)).releases.map(row => row.id),
    ).not.toContain('place')
  })

  test('cascades derived geography and dependent Divisions publications while retaining other inputs', async () => {
    const { meta, current, history, source, context } = setup()
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    insert(meta, 'datasets', {
      id: 'geography',
      code: 'geography',
      publisherId: 'publisher',
      theme: 'divisions',
    })
    insert(meta, 'sourceReleases', {
      id: 'geography-source',
      code: 'geography-source',
      datasetId: 'geography',
    })
    insert(meta, 'releases', {
      id: 'geography',
      code: 'geography',
      datasetId: 'geography',
      sourceReleaseId: 'geography-source',
      resourceType: 'divisionArea',
    })
    for (const [id, parent] of [
      ['derived', 'divisionArea'],
      ['child', 'derived'],
      ['unrelated', null],
    ] as const) {
      insert(meta, 'snapshots', {
        id,
        code: id,
        parentSnapshotId: parent,
        resourceType: 'divisionArea',
      })
      insert(meta, 'snapshotSources', {
        snapshotId: id,
        datasetId: 'geography',
        resourceReleaseId: 'geography',
      })
      for (const db of [current, history]) {
        insert(db, 'divisionAreas', { id, snapshotId: id, divisionId: id })
      }
    }
    insert(source, 'hkgovCenstatdDivisionAreas', {
      sourceRecordId: 'retained',
      releaseId: 'geography',
    })
    insert(meta, 'apiVersions', {
      id: 'divisions',
      code: 'divisions',
      familyType: 'divisions',
    })
    for (const id of ['affected', 'unaffected']) {
      insert(meta, 'apiReleaseSets', { id, code: id, apiVersionId: 'divisions' })
      insert(meta, 'apiReleaseSetSnapshots', {
        apiReleaseSetId: id,
        snapshotId: 'unrelated',
      })
      insert(meta, 'apiCatalogRevisions', {
        id,
        code: id,
        apiVersionId: 'divisions',
        publicationDate: id,
      })
      insert(meta, 'apiCatalogRevisionReleaseSets', {
        apiCatalogRevisionId: id,
        apiReleaseSetId: id,
      })
    }
    insert(meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: 'affected',
      snapshotId: 'child',
    })
    // A catalogue is immutable: retract it in full, retaining the independent set.
    insert(meta, 'apiCatalogRevisionReleaseSets', {
      apiCatalogRevisionId: 'affected',
      apiReleaseSetId: 'unaffected',
      cohortKey: 'independent',
    })
    const plan = await collectStatsResetPlan(context)
    expect(plan.snapshots.map(row => row.id)).toEqual([
      'child',
      'derived',
      'divisionArea',
      'divisionStatistic',
    ])
    expect(plan.releases.map(row => row.id)).toEqual([
      'divisionArea',
      'divisionStatistic',
    ])
    expect(plan.releaseSets.map(row => row.id)).toEqual(['affected', 'stats'])
    expect(await statsResetBlockers(context)).toEqual([])
    const sql = buildStatsResetSql(plan)
    source.exec(sql.sourceSql)
    history.exec(sql.historySql)
    current.exec(sql.currentSql)
    meta.exec(sql.metaSql)
    for (const db of [current, history]) {
      expect(db.query('SELECT id FROM divisionAreas').all()).toEqual([
        { id: 'unrelated' },
      ])
    }
    expect(meta.query('SELECT id FROM releases ORDER BY id').all()).toEqual([
      { id: 'geography' },
      { id: 'place' },
    ])
    expect(meta.query('SELECT id FROM apiReleaseSets ORDER BY id').all()).toEqual([
      { id: 'places' },
      { id: 'unaffected' },
    ])
    expect(meta.query('SELECT id FROM apiCatalogRevisions ORDER BY id').all()).toEqual([
      { id: 'places' },
      { id: 'unaffected' },
    ])
    expect(
      source.query('SELECT releaseId FROM hkgovCenstatdDivisionAreas').all(),
    ).toEqual([{ releaseId: 'geography' }])
    expect(meta.query('PRAGMA foreign_key_check').all()).toEqual([])
  })

  test('discovers geometry lookup and canonical identity dependants and revalidates edges', async () => {
    const { meta, current, context } = setup()
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    insert(current, 'divisions', { id: 'owned', snapshotId: 'divisionArea' })
    for (const id of ['lookup', 'canonical']) {
      insert(meta, 'snapshots', { id, code: id, resourceType: 'divisionArea' })
    }
    insert(meta, 'snapshotSources', {
      snapshotId: 'lookup',
      datasetId: 'dataset',
      resourceReleaseId: 'divisionArea',
      role: 'lookup',
    })
    insert(current, 'divisionAreas', {
      id: 'canonical',
      snapshotId: 'canonical',
      divisionId: 'owned',
    })
    const first = await collectStatsResetPlan(context)
    expect(first.snapshots.map(row => row.id)).toEqual([
      'canonical',
      'divisionArea',
      'divisionStatistic',
      'lookup',
    ])
    expect(await statsResetBlockers(context)).toEqual([])
    meta.exec(
      "UPDATE snapshotSources SET selectionMode = 'changed' WHERE snapshotId = 'lookup'",
    )
    expect(await collectStatsResetPlan(context)).not.toEqual(first)
  })

  test('scope reset rejects unfinished delivery and never removes a replacement owner', async () => {
    const { meta, current, context } = setup()
    meta.exec("UPDATE datasets SET theme = 'stats' WHERE id = 'dataset'")
    insert(current, 'divisionAreas', { id: 'owned', snapshotId: 'divisionArea' })
    const plan = await collectStatsResetPlan(context)
    const sql = buildStatsResetSql(plan)
    current.exec('UPDATE divisionAreaPublicationState SET preparedAt=NULL')
    expect(await statsResetBlockers(context)).toContain(
      'Current statistics geography has an unfinished delivery',
    )
    current.exec(
      "UPDATE divisionAreaPublicationState SET snapshotId='replacement', publicationToken='new-token', preparedAt='complete'",
    )
    current.exec(sql.currentSql)
    expect(current.query('SELECT id FROM divisionAreas').all()).toEqual([
      { id: 'owned' },
    ])
    expect(
      current.query('SELECT snapshotId FROM divisionAreaPublicationState').get(),
    ).toEqual({ snapshotId: 'replacement' })
  })
})
