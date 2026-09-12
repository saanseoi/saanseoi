import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures.ts'
import { versionStatisticsDefinitions } from '../../pipeline/statistics/statisticsRecordIdentity.ts'
import { insertProjectionRow } from './projection.ts'
import { restoreStatisticsProjection } from './statistics.ts'

const datasetCode = 'ds-statistics'
const period = '2021-Q1'
const timestamp = '2021-01-01T00:00:00Z'
const insert = (db: Database, table: string, row: Record<string, unknown>) => {
  db.query(
    `INSERT INTO ${table} (${Object.keys(row)
      .map(key => `"${key}"`)
      .join(',')}) VALUES (${Object.keys(row)
      .map(() => '?')
      .join(',')})`,
  ).run(
    ...(Object.values(row).map(value =>
      value != null && typeof value === 'object'
        ? JSON.stringify(value)
        : typeof value === 'boolean'
          ? Number(value)
          : value,
    ) as SQLQueryBindings[]),
  )
}
const definitions = (name = 'Population', fieldName = 'population') =>
  versionStatisticsDefinitions({
    fields: [
      {
        datasetCode,
        fieldName,
        measureCode: 'population',
        sourceField: fieldName,
        dimensions: { sex: 'female' },
        sourceNullOption: null,
        comparability: null,
        statisticKind: 'count',
        aggregation: 'none',
        aggregationPercentile: null,
        periodicity: null,
        denominatorFieldName: null,
        valueKind: 'numeric',
        unitCode: 'person',
      },
    ],
    fieldsI18n: [
      {
        datasetCode,
        fieldName,
        locale: 'en',
        name,
        description: null,
        isTranslationVerified: true,
      },
      {
        datasetCode,
        fieldName,
        locale: 'zh-hant',
        name: `${name}-中文`,
        description: null,
        isTranslationVerified: true,
      },
    ],
    measures: [{ datasetCode, measureCode: 'population' }],
    measuresI18n: [
      {
        datasetCode,
        measureCode: 'population',
        locale: 'en',
        name,
        description: null,
        isTranslationVerified: true,
      },
    ],
  })
const metadata = {
  sourceReleaseId: 'original-release',
  isCurrent: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
}
const pack = (
  id: string,
  versionHash: string,
  definition: ReturnType<typeof definitions>,
) => ({
  ...metadata,
  id,
  versionHash,
  datasetCode,
  sourceFeatureRef: `publisher/${id}`,
  divisionId: null,
  referencePeriodCode: period,
  referencePeriodStart: '2021-01-01',
  referencePeriodEnd: '2021-03-31',
  referencePeriodEndYear: '2021',
  referencePeriodGranularity: 'quarter',
  geography: { kind: 'district', code: id },
  fieldSources: {
    population: {
      sourceReleaseId: 'original-release',
      sourceFeatureRef: `publisher/${id}`,
    },
  },
  fieldDefinitionHashes: { population: definition.fields[0]?.versionHash ?? '' },
  values: { population: '123' },
})
const journal = (db: Database, snapshotId: string, id: string, hash: string | null) =>
  insert(db, 'snapshotVersionChanges', {
    snapshotId,
    recordType: 'statsRecord',
    recordId: id,
    locale: '',
    versionHash: hash,
    operation: hash ? 'upsert' : 'delete',
    sourceReleaseId: hash ? 'original-release' : null,
  })
function addDefinitions(db: Database, definition: ReturnType<typeof definitions>) {
  for (const [table, rows] of [
    ['statsFields', definition.fields],
    ['statsFieldsI18n', definition.fieldsI18n],
    ['statsMeasures', definition.measures],
    ['statsMeasuresI18n', definition.measuresI18n],
  ] as const)
    for (const row of rows) insert(db, table, { ...metadata, ...row })
}
function fixture() {
  const open = (kind: 'meta' | 'history' | 'current') => {
    const db = new Database(':memory:')
    db.exec(
      loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
        kind,
      ]),
    )
    return db
  }
  const current = open('current')
  const meta = open('meta')
  const first = open('history')
  const second = open('history')
  const parameters: number[] = []
  const readable = (db: Database) =>
    drizzle({
      client: db,
      logger: {
        logQuery(_sql, values) {
          parameters.push(values.length)
        },
      },
    }) as unknown as ReturnType<typeof createLocalHarbourDb>
  insert(meta, 'datasets', {
    id: 'dataset',
    code: datasetCode,
    publisherId: 'publisher',
    regionCode: 'hk',
    releaseType: 'snapshot',
    releaseFrequency: 'annual',
    theme: 'statistics',
    versionHash: 'dataset',
  })
  for (const [id, parent] of [
    ['a', null],
    ['b', 'a'],
  ] as const) {
    insert(meta, 'snapshots', {
      id,
      code: id,
      resourceType: 'divisionStatistic',
      cohortKey: period,
      status: 'published',
      parentSnapshotId: parent,
    })
    insert(meta, 'snapshotSources', {
      snapshotId: id,
      datasetId: 'dataset',
      resourceReleaseId: `${id}-release`,
      role: 'primary',
    })
  }
  for (const [name, snapshotId] of [
    ['first', 'a'],
    ['second', 'b'],
  ] as const) {
    insert(meta, 'dataShards', {
      id: name,
      shardType: 'history',
      regionCode: 'hk',
      year: name,
      environment: 'preview',
      databaseName: name,
      databaseId: name,
      bindingName: name,
      status: 'active',
      versionHash: name,
    })
    insert(meta, 'snapshotShardAssignments', { snapshotId, dataShardId: name })
  }
  const original = definitions()
  const revised = definitions('Revised population')
  addDefinitions(first, original)
  addDefinitions(second, revised)
  insert(first, 'statsRecords', pack('inherited', 'inherited-a', original))
  insert(first, 'statsRecords', pack('revised', 'revised-a', original))
  insert(first, 'statsRecords', pack('removed', 'removed-a', original))
  for (const id of ['inherited', 'revised', 'removed'])
    journal(first, 'a', id, `${id}-a`)
  insert(second, 'statsRecords', {
    ...pack('revised', 'revised-b', revised),
    values: { population: '*' },
  })
  journal(second, 'b', 'revised', 'revised-b')
  journal(second, 'b', 'removed', null)
  insertProjectionRow(current, 'statsRecords', { ...pack('stale', 'stale', revised) })
  insertProjectionRow(current, 'statsRecords', {
    ...pack('other-period', 'untouched', original),
    referencePeriodCode: '2021-Q2',
  })
  insertProjectionRow(current, 'statsRecords', {
    ...pack('other-dataset', 'untouched', original),
    datasetCode: 'another-dataset',
  })
  insert(current, 'statsPublicationState', {
    datasetCode,
    referencePeriodCode: period,
    snapshotId: 'unchanged-receipt',
    status: 'current',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const input = {
    current,
    metaDb: readable(meta),
    historyTargets: [
      { bindingName: 'first', db: readable(first) },
      { bindingName: 'second', db: readable(second) },
    ],
    snapshotId: 'b',
    datasetCode,
    referencePeriodCode: period,
  }
  const tableState = () =>
    Object.fromEntries(
      [
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsPublicationState',
      ].map(table => [
        table,
        current.query(`SELECT * FROM ${table} ORDER BY 1,2,3`).all(),
      ]),
    )
  const changes = (db: Database) =>
    (db.query('SELECT total_changes() AS count').get() as { count: number }).count
  return {
    current,
    meta,
    first,
    second,
    original,
    revised,
    input,
    parameters,
    tableState,
    changes,
    close: () => {
      for (const db of [current, meta, first, second]) db.close()
    },
  }
}

test('Statistics rollback restores exact inherited packs and immutable dictionary locales across owning shards', async () => {
  const f = fixture()
  try {
    const before = f.tableState()
    const historyChanges = [f.changes(f.first), f.changes(f.second)]
    const result = await restoreStatisticsProjection(f.input)
    expect(result.counts).toEqual({
      statsRecords: 2,
      statsFields: 2,
      statsFieldsI18n: 4,
      statsMeasures: 2,
      statsMeasuresI18n: 2,
    })
    expect(
      f.current
        .query(
          'SELECT id,versionHash,"values" FROM statsRecords WHERE datasetCode=? AND referencePeriodCode=? ORDER BY id',
        )
        .all(datasetCode, period),
    ).toEqual([
      { id: 'inherited', versionHash: 'inherited-a', values: '{"population":"123"}' },
      { id: 'revised', versionHash: 'revised-b', values: '{"population":"*"}' },
    ])
    expect(
      f.current.query('SELECT name FROM statsFieldsI18n ORDER BY name').all(),
    ).toEqual([
      { name: 'Population' },
      { name: 'Population-中文' },
      { name: 'Revised population' },
      { name: 'Revised population-中文' },
    ])
    expect(
      f.current
        .query(
          'SELECT sourceReleaseId,sourceFeatureRef,fieldSources FROM statsRecords WHERE id=?',
        )
        .get('inherited'),
    ).toEqual({
      sourceReleaseId: 'original-release',
      sourceFeatureRef: 'publisher/inherited',
      fieldSources:
        '{"population":{"sourceReleaseId":"original-release","sourceFeatureRef":"publisher/inherited"}}',
    })
    expect(
      f.current
        .query(
          'SELECT id FROM statsRecords WHERE datasetCode<>? OR referencePeriodCode<>? ORDER BY id',
        )
        .all(datasetCode, period),
    ).toEqual([{ id: 'other-dataset' }, { id: 'other-period' }])
    expect(f.tableState().statsPublicationState).toEqual(before.statsPublicationState)
    expect([f.changes(f.first), f.changes(f.second)]).toEqual(historyChanges)
    expect((await restoreStatisticsProjection(f.input)).counts).toEqual({
      statsRecords: 2,
      statsFields: 0,
      statsFieldsI18n: 0,
      statsMeasures: 0,
      statsMeasuresI18n: 0,
    })
    expect(Math.max(...f.parameters)).toBeLessThanOrEqual(100)
  } finally {
    f.close()
  }
})

test('null Statistics selection removes only the exact period and preserves dictionaries and receipts', async () => {
  const f = fixture()
  try {
    await restoreStatisticsProjection(f.input)
    const before = f.tableState()
    expect(
      (
        await restoreStatisticsProjection({
          ...f.input,
          snapshotId: null,
          historyTargets: [],
        })
      ).counts.statsRecords,
    ).toBe(0)
    const after = f.tableState()
    for (const table of [
      'statsFields',
      'statsFieldsI18n',
      'statsMeasures',
      'statsMeasuresI18n',
      'statsPublicationState',
    ])
      expect(after[table]).toEqual(before[table])
    expect(f.current.query('SELECT id FROM statsRecords ORDER BY id').all()).toEqual([
      { id: 'other-dataset' },
      { id: 'other-period' },
    ])
  } finally {
    f.close()
  }
})

test('missing or corrupt retained definitions fail atomically even when current has a usable copy', async () => {
  for (const damage of [
    'DELETE FROM statsFields',
    'DELETE FROM statsMeasures',
    'DELETE FROM statsFieldsI18n',
    'DELETE FROM statsMeasuresI18n',
    "UPDATE statsFieldsI18n SET name='Changed without a new hash'",
    "UPDATE statsFields SET measureVersionHash='missing-measure'",
  ]) {
    const f = fixture()
    try {
      await restoreStatisticsProjection(f.input)
      const before = f.tableState()
      f.second.exec(damage)
      await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(/Statistics/)
      expect(f.tableState()).toEqual(before)
      expect(f.current.inTransaction).toBe(false)
    } finally {
      f.close()
    }
  }
})

test('Statistics restoration rejects missing exact owners, incomplete assignments and a mismatched scope', async () => {
  const f = fixture()
  try {
    const before = f.tableState()
    await expect(
      restoreStatisticsProjection({
        ...f.input,
        historyTargets: f.input.historyTargets.slice(0, 1),
      }),
    ).rejects.toThrow('unavailable history binding second')
    await expect(
      restoreStatisticsProjection({ ...f.input, referencePeriodCode: '2021' }),
    ).rejects.toThrow('reference period')
    await expect(
      restoreStatisticsProjection({ ...f.input, datasetCode: 'another-dataset' }),
    ).rejects.toThrow('does not select dataset')
    f.meta.exec("DELETE FROM snapshotShardAssignments WHERE snapshotId='b'")
    await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(
      'incomplete history shard assignments',
    )
    insert(f.meta, 'snapshotShardAssignments', {
      snapshotId: 'b',
      dataShardId: 'second',
    })
    f.second.exec("DELETE FROM statsRecords WHERE id='revised'")
    // The same tuple on a supplied but unassigned owner cannot repair missing evidence.
    insert(f.first, 'statsRecords', pack('revised', 'revised-b', f.revised))
    await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(
      'Missing exact history component',
    )
    expect(f.tableState()).toEqual(before)
  } finally {
    f.close()
  }
})

test('conflicting current immutable definitions and cross-scope pack identities cannot be overwritten', async () => {
  const f = fixture()
  try {
    await restoreStatisticsProjection(f.input)
    f.current.exec("UPDATE statsFieldsI18n SET name='Conflicting current text'")
    const before = f.tableState()
    await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(
      'Conflicting immutable Statistics dictionary',
    )
    expect(f.tableState()).toEqual(before)
    f.current.exec('DELETE FROM statsFieldsI18n')
    f.current.exec(
      "UPDATE statsRecords SET referencePeriodCode='2021-Q2' WHERE id='inherited'",
    )
    const collision = f.tableState()
    await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(
      'overwrite another serving scope',
    )
    expect(f.tableState()).toEqual(collision)
  } finally {
    f.close()
  }
})

test('invalid pack field versions and retained provenance fail without partial restoration', async () => {
  for (const [column, value] of [
    ['fieldDefinitionHashes', '{}'],
    ['fieldDefinitionHashes', '{"population":42}'],
    ['fieldSources', '{}'],
  ]) {
    const f = fixture()
    try {
      f.second.query(`UPDATE statsRecords SET ${column}=?`).run(value ?? '')
      const before = f.tableState()
      await expect(restoreStatisticsProjection(f.input)).rejects.toThrow(/Statistics/)
      expect(f.tableState()).toEqual(before)
    } finally {
      f.close()
    }
  }
})

test('empty Statistics snapshots restore an empty period without treating unavailable ancestry as empty', async () => {
  const f = fixture()
  try {
    f.first.exec('DELETE FROM snapshotVersionChanges')
    f.second.exec('DELETE FROM snapshotVersionChanges')
    expect((await restoreStatisticsProjection(f.input)).counts.statsRecords).toBe(0)
    expect(f.current.query('SELECT count(*) AS count FROM statsRecords').get()).toEqual(
      { count: 2 },
    )
  } finally {
    f.close()
  }
})

test('large packed definition sets stay bounded and copy only the exact referenced versions', async () => {
  const f = fixture()
  try {
    const template = definitions()
    const field = template.fields[0]
    if (!field) throw new Error('Missing field fixture')
    const fields = Array.from({ length: 105 }, (_, index) => ({
      ...field,
      fieldName: `population-${index}`,
      sourceField: `population_${index}`,
    }))
    const many = versionStatisticsDefinitions({
      fields,
      fieldsI18n: fields.flatMap(field =>
        template.fieldsI18n.map(row => ({ ...row, fieldName: field.fieldName })),
      ),
      measures: template.measures,
      measuresI18n: template.measuresI18n,
    })
    for (const db of [f.first, f.second])
      for (const table of [
        'snapshotVersionChanges',
        'statsRecords',
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
      ])
        db.exec(`DELETE FROM ${table}`)
    addDefinitions(f.first, many)
    insert(f.first, 'statsRecords', {
      ...pack('large', 'large-pack', template),
      values: Object.fromEntries(many.fields.map(field => [field.fieldName, '*'])),
      fieldDefinitionHashes: Object.fromEntries(
        many.fields.map(field => [field.fieldName, field.versionHash]),
      ),
      fieldSources: Object.fromEntries(
        many.fields.map(field => [
          field.fieldName,
          { sourceReleaseId: 'original-release', sourceFeatureRef: 'publisher/large' },
        ]),
      ),
    })
    journal(f.first, 'a', 'large', 'large-pack')
    expect((await restoreStatisticsProjection(f.input)).counts).toEqual({
      statsRecords: 1,
      statsFields: 105,
      statsFieldsI18n: 210,
      statsMeasures: 1,
      statsMeasuresI18n: 1,
    })
    expect(Math.max(...f.parameters)).toBeLessThanOrEqual(100)
  } finally {
    f.close()
  }
})
