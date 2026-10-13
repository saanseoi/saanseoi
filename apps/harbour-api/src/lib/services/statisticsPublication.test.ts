import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import {
  finalisePublishedStatistics,
  promotePublishedStatisticsTarget,
} from './statisticsPublication'
import { listPublishedStatisticsTargets } from './statisticsPublicationTargets'

const datasetCode = 'ds-statistics'
const period = '2021'

function fixture() {
  const meta = new Database(':memory:')
  meta.exec(`
    CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT NOT NULL DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
    CREATE TABLE snapshots (
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT NOT NULL,
      parentSnapshotId TEXT
    );
    CREATE TABLE dataShards (id TEXT PRIMARY KEY, bindingName TEXT);
    CREATE TABLE snapshotShardAssignments (snapshotId TEXT, dataShardId TEXT);
    INSERT INTO dataShards VALUES ('history', 'DB_HISTORY_HK_BEFORE');
  `)
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  for (const [database, historical] of [
    [current, false],
    [history, true],
  ] as const) {
    database.exec(`
      CREATE TABLE statsDefinitionSets(id TEXT PRIMARY KEY, fieldDefinitionHashes TEXT NOT NULL);
      INSERT INTO statsDefinitionSets VALUES ('definitions','{"population":"field-1"}');
      CREATE TABLE statsRecords (
        id TEXT, datasetCode TEXT, referencePeriodCode TEXT, versionHash TEXT,
        "values" TEXT, definitionSetId TEXT, sourceReleaseId TEXT,
        createdAt TEXT, updatedAt TEXT ${historical ? ", isCurrent INTEGER, snapshotId TEXT, operation TEXT DEFAULT 'upsert'" : ''},
        PRIMARY KEY (id ${historical ? ', versionHash' : ''})
      );
      CREATE TABLE statsFields (
        datasetCode TEXT, fieldName TEXT, versionHash TEXT, measureCode TEXT,
        measureVersionHash TEXT, createdAt TEXT, updatedAt TEXT,
        PRIMARY KEY (datasetCode, fieldName, versionHash)
      );
      CREATE TABLE statsMeasures (
        datasetCode TEXT, measureCode TEXT, versionHash TEXT, createdAt TEXT, updatedAt TEXT,
        PRIMARY KEY (datasetCode, measureCode, versionHash)
      );
      CREATE TABLE statsFieldsI18n (
        datasetCode TEXT, fieldName TEXT, versionHash TEXT, locale TEXT, name TEXT,
        PRIMARY KEY (datasetCode, fieldName, versionHash, locale)
      );
      CREATE TABLE statsMeasuresI18n (
        datasetCode TEXT, measureCode TEXT, versionHash TEXT, locale TEXT, name TEXT,
        PRIMARY KEY (datasetCode, measureCode, versionHash, locale)
      );
    `)
  }
  history.exec(`
    CREATE TABLE historyEvents (
      snapshotId TEXT, recordType TEXT, recordId TEXT, versionHash TEXT, operation TEXT
    );
    INSERT INTO statsFields VALUES ('${datasetCode}', 'population', 'field-1', 'population', 'measure-1', 'now', 'now');
    INSERT INTO statsMeasures VALUES ('${datasetCode}', 'population', 'measure-1', 'now', 'now');
    INSERT INTO statsFieldsI18n VALUES ('${datasetCode}', 'population', 'field-1', 'en', 'Population');
    INSERT INTO statsMeasuresI18n VALUES ('${datasetCode}', 'population', 'measure-1', 'en', 'Population');
  `)
  current.exec(`
    CREATE TABLE statsPublicationState (
      datasetCode TEXT, referencePeriodCode TEXT, snapshotId TEXT, status TEXT,
      createdAt TEXT, updatedAt TEXT, PRIMARY KEY (datasetCode, referencePeriodCode)
    );
    CREATE TABLE writes (operation TEXT);
    CREATE TABLE dictionaryWrites (tableName TEXT);
    CREATE TRIGGER record_insert AFTER INSERT ON statsRecords BEGIN INSERT INTO writes VALUES ('insert'); END;
    CREATE TRIGGER record_update AFTER UPDATE ON statsRecords BEGIN INSERT INTO writes VALUES ('update'); END;
    CREATE TRIGGER record_delete AFTER DELETE ON statsRecords BEGIN INSERT INTO writes VALUES ('delete'); END;
    CREATE TRIGGER field_insert AFTER INSERT ON statsFields BEGIN INSERT INTO dictionaryWrites VALUES ('statsFields'); END;
    CREATE TRIGGER measure_insert AFTER INSERT ON statsMeasures BEGIN INSERT INTO dictionaryWrites VALUES ('statsMeasures'); END;
    CREATE TRIGGER field_label_insert AFTER INSERT ON statsFieldsI18n BEGIN INSERT INTO dictionaryWrites VALUES ('statsFieldsI18n'); END;
    CREATE TRIGGER measure_label_insert AFTER INSERT ON statsMeasuresI18n BEGIN INSERT INTO dictionaryWrites VALUES ('statsMeasuresI18n'); END;
  `)
  let failAfterRecordWrites: number | null = null
  const currentBinding = d1(current, sql => {
    if (failAfterRecordWrites !== null && sql.startsWith('INSERT INTO statsRecords')) {
      if (failAfterRecordWrites === 0) {
        failAfterRecordWrites = null
        throw new Error('injected current write failure')
      }
      failAfterRecordWrites -= 1
    }
  })
  const bindings = { DB_HISTORY_HK_BEFORE: d1(history) }
  function snapshot(id: string, parent: string | null) {
    meta
      .query(
        "INSERT INTO snapshots (id,snapshotLineageId,parentSnapshotId) VALUES (?, 'statistics', ?)",
      )
      .run(id, parent)
    meta.query('INSERT INTO snapshotShardAssignments VALUES (?, ?)').run(id, 'history')
  }
  function record(
    snapshotId: string,
    id: string,
    hash: string,
    value: string,
    referencePeriod = period,
  ) {
    history
      .query(
        "INSERT INTO statsRecords VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upsert')",
      )
      .run(
        id,
        datasetCode,
        referencePeriod,
        hash,
        JSON.stringify({ population: value }),
        'definitions',
        snapshotId,
        'now',
        'now',
        1,
        snapshotId,
      )
    history
      .query('INSERT INTO historyEvents VALUES (?, ?, ?, ?, ?)')
      .run(snapshotId, 'statsRecord', id, hash, 'upsert')
  }
  return {
    current,
    history,
    meta,
    snapshot,
    record,
    failNextRecordWrite() {
      failAfterRecordWrites = 0
    },
    failAfterRecordWrites(count: number) {
      failAfterRecordWrites = count
    },
    promote(snapshotId: string, referencePeriodCode = period) {
      return promotePublishedStatisticsTarget(
        createLocalHarbourDb(meta),
        currentBinding,
        bindings,
        {
          datasetCode,
          referencePeriodCode,
          snapshotId,
        },
      )
    },
    finalise(publishedFamilies?: readonly string[]) {
      return finalisePublishedStatistics(
        createLocalHarbourDb(meta),
        { ...bindings, DB_CURRENT: currentBinding },
        { publishedFamilies },
      )
    },
    writes() {
      return current.query('SELECT operation FROM writes').all()
    },
    clearWrites() {
      current.exec('DELETE FROM writes; DELETE FROM dictionaryWrites')
    },
  }
}

describe('packed statistic publication', () => {
  test('publication cannot acquire an exact period reserved by rollback', async () => {
    const f = fixture()
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    await f.promote('base')
    f.snapshot('later', 'base')
    f.record('later', 'north', 'north-2', '11')
    f.current.exec("UPDATE statsPublicationState SET status='restoring'")
    f.clearWrites()
    await expect(f.promote('later')).rejects.toThrow('sealed rollback')
    await expect(f.promote('base')).rejects.toThrow('sealed rollback')
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT status FROM statsPublicationState').get()).toEqual({
      status: 'restoring',
    })
  })
  test('promotes initial packs with definitions, then writes no records for an unchanged reissue', async () => {
    const f = fixture()
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    f.record('base', 'south', 'south-1', '20')
    expect(await f.promote('base')).toEqual({ changedRecords: 2 })
    expect(f.current.query('SELECT name FROM statsFieldsI18n').all()).toEqual([
      { name: 'Population' },
    ])
    expect(
      f.current.query('SELECT COUNT(*) AS count FROM statsMeasures').get(),
    ).toEqual({ count: 1 })
    f.clearWrites()
    f.snapshot('reissue', 'base')
    expect(await f.promote('reissue')).toEqual({ changedRecords: 0 })
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT * FROM dictionaryWrites').all()).toEqual([])
    expect(
      f.current.query('SELECT snapshotId, status FROM statsPublicationState').get(),
    ).toEqual({ snapshotId: 'reissue', status: 'current' })
    expect(f.current.query('SELECT sourceReleaseId FROM statsRecords').all()).toEqual([
      { sourceReleaseId: 'base' },
      { sourceReleaseId: 'base' },
    ])
    expect(await f.promote('reissue')).toEqual({ changedRecords: 0 })
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT * FROM dictionaryWrites').all()).toEqual([])
  })

  test('changes only revised packs and keeps an earlier reference period', async () => {
    const f = fixture()
    f.snapshot('old-period', null)
    f.record('old-period', 'north-2020', 'north-2020-1', '9', '2020')
    await f.promote('old-period', '2020')
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    f.record('base', 'south', 'south-1', '20')
    await f.promote('base')
    f.clearWrites()
    f.snapshot('correction', 'base')
    f.record('correction', 'north', 'north-2', '11')
    expect(await f.promote('correction')).toEqual({ changedRecords: 1 })
    expect(f.writes()).toEqual([{ operation: 'update' }])
    expect(
      f.current.query('SELECT id, versionHash FROM statsRecords ORDER BY id').all(),
    ).toEqual([
      { id: 'north', versionHash: 'north-2' },
      { id: 'north-2020', versionHash: 'north-2020-1' },
      { id: 'south', versionHash: 'south-1' },
    ])
  })

  test('failed promotion stays gated and a retry repairs it without rewriting retained packs', async () => {
    const f = fixture()
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    f.record('base', 'south', 'south-1', '20')
    await f.promote('base')
    f.snapshot('correction', 'base')
    f.record('correction', 'north', 'north-2', '11')
    f.clearWrites()
    f.failNextRecordWrite()
    await expect(f.promote('correction')).rejects.toThrow(
      'injected current write failure',
    )
    expect(
      f.current.query('SELECT snapshotId, status FROM statsPublicationState').get(),
    ).toEqual({ snapshotId: 'correction', status: 'publishing' })
    expect(f.writes()).toEqual([])
    expect(await f.promote('correction')).toEqual({ changedRecords: 1 })
    expect(f.writes()).toEqual([{ operation: 'update' }])
    expect(f.current.query('SELECT status FROM statsPublicationState').get()).toEqual({
      status: 'current',
    })
  })

  test('missing history versions block readiness instead of advertising incomplete current data', async () => {
    const f = fixture()
    f.snapshot('missing', null)
    f.history.exec(
      "INSERT INTO historyEvents VALUES ('missing', 'statsRecord', 'north', 'absent', 'upsert')",
    )
    await expect(f.promote('missing')).rejects.toThrow(
      'Missing retained statistic versions',
    )
    expect(f.current.query('SELECT status FROM statsPublicationState').get()).toEqual({
      status: 'publishing',
    })
  })

  test('repairs an interrupted multi-batch correction without rewriting the committed prefix', async () => {
    const f = fixture()
    f.snapshot('base', null)
    for (let index = 0; index < 45; index += 1) {
      f.record('base', `area-${index}`, `v1-${index}`, String(index))
    }
    await f.promote('base')
    f.snapshot('correction', 'base')
    for (let index = 0; index < 45; index += 1) {
      f.record('correction', `area-${index}`, `v2-${index}`, String(index + 1))
    }
    f.clearWrites()
    f.failAfterRecordWrites(40)
    await expect(f.promote('correction')).rejects.toThrow(
      'injected current write failure',
    )
    expect(f.writes()).toHaveLength(40)
    expect(f.current.query('SELECT status FROM statsPublicationState').get()).toEqual({
      status: 'publishing',
    })
    expect(await f.promote('correction')).toEqual({ changedRecords: 5 })
    expect(f.writes()).toHaveLength(45)
    expect(f.current.query('SELECT * FROM dictionaryWrites').all()).toEqual([])
  })

  test('an older finalisation request cannot roll back a newer completed correction', async () => {
    const f = fixture()
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    await f.promote('base')
    f.snapshot('correction', 'base')
    f.record('correction', 'north', 'north-2', '11')
    await f.promote('correction')
    f.clearWrites()
    expect(await f.promote('base')).toEqual({ changedRecords: 0 })
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT versionHash FROM statsRecords').get()).toEqual({
      versionHash: 'north-2',
    })
    expect(
      f.current.query('SELECT snapshotId, status FROM statsPublicationState').get(),
    ).toEqual({ snapshotId: 'correction', status: 'current' })
  })

  test('finalisation excludes drafts and repairs a published selection without needing a new publication', async () => {
    const f = fixture()
    f.snapshot('base', null)
    f.record('base', 'north', 'north-1', '10')
    f.meta.exec(`
      ALTER TABLE snapshots ADD COLUMN cohortKey TEXT;
      UPDATE snapshots SET cohortKey = '${period}';
      INSERT INTO snapshotLineages (id,resourceType) VALUES ('statistics','divisionStatistic');
      CREATE TABLE apiVersions (id TEXT, familyType TEXT);
      CREATE TABLE apiReleaseSets (id TEXT, cohortKey TEXT, domainCode TEXT, regionCode TEXT, revision INTEGER);
      CREATE TABLE apiVersionReleaseSets (apiReleaseSetId TEXT, apiVersionId TEXT, status TEXT);
      CREATE TABLE apiReleaseSetSnapshots (apiReleaseSetId TEXT, snapshotId TEXT);
      CREATE TABLE snapshotResourceReleases (snapshotId TEXT, resourceReleaseId TEXT DEFAULT 'release', role TEXT);
CREATE TABLE resourceReleases(id TEXT,sourceReleaseId TEXT);
CREATE TABLE sourceReleases(id TEXT PRIMARY KEY,datasetId TEXT);
CREATE VIEW resourceReleaseDetails AS SELECT r.*,s.datasetId FROM resourceReleases r JOIN sourceReleases s ON s.id=r.sourceReleaseId;
CREATE VIEW snapshotResourceReleaseDetails AS SELECT m.*,r.datasetId FROM snapshotResourceReleases m JOIN resourceReleaseDetails r ON r.id=m.resourceReleaseId;
INSERT INTO sourceReleases VALUES ('source','dataset');
INSERT INTO resourceReleases VALUES ('release','source');
      CREATE TABLE datasets (id TEXT, code TEXT);
      INSERT INTO apiVersions VALUES ('stats', 'stats');
      INSERT INTO datasets VALUES ('dataset', '${datasetCode}');
      INSERT INTO apiReleaseSets VALUES ('published', '${period}', 'government', 'hk', 0);
      INSERT INTO apiVersionReleaseSets VALUES ('published', 'stats', 'draft');
      INSERT INTO apiReleaseSetSnapshots VALUES ('published', 'base');
      INSERT INTO snapshotResourceReleases(snapshotId,role) VALUES ('base', 'primary');
    `)
    await f.finalise()
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT * FROM statsPublicationState').all()).toEqual([])
    f.meta.exec("UPDATE apiVersionReleaseSets SET status = 'archived'")
    await f.finalise(['addresses'])
    expect(f.writes()).toEqual([])
    await f.finalise(['stats'])
    expect(f.writes()).toEqual([{ operation: 'insert' }])
    f.clearWrites()
    f.current.exec("UPDATE statsPublicationState SET status = 'publishing'")
    await f.finalise()
    expect(f.writes()).toEqual([])
    expect(f.current.query('SELECT status FROM statsPublicationState').get()).toEqual({
      status: 'current',
    })
  })

  test('selects the latest published revision for each period, including archived older periods', async () => {
    const meta = new Database(':memory:')
    meta.exec(`
      CREATE TABLE apiVersions (id TEXT, familyType TEXT);
      CREATE TABLE apiReleaseSets (id TEXT, cohortKey TEXT, domainCode TEXT, regionCode TEXT, revision INTEGER);
      CREATE TABLE apiVersionReleaseSets (apiReleaseSetId TEXT, apiVersionId TEXT, status TEXT);
      CREATE TABLE apiReleaseSetSnapshots (apiReleaseSetId TEXT, snapshotId TEXT);
      CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT NOT NULL DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
    CREATE TABLE snapshots (
      id TEXT,
      snapshotLineageId TEXT NOT NULL,
      cohortKey TEXT
    );
      CREATE TABLE snapshotResourceReleases (snapshotId TEXT, resourceReleaseId TEXT DEFAULT 'release', role TEXT);
CREATE TABLE resourceReleases(id TEXT,sourceReleaseId TEXT);
CREATE TABLE sourceReleases(id TEXT PRIMARY KEY,datasetId TEXT);
CREATE VIEW resourceReleaseDetails AS SELECT r.*,s.datasetId FROM resourceReleases r JOIN sourceReleases s ON s.id=r.sourceReleaseId;
CREATE VIEW snapshotResourceReleaseDetails AS SELECT m.*,r.datasetId FROM snapshotResourceReleases m JOIN resourceReleaseDetails r ON r.id=m.resourceReleaseId;
INSERT INTO sourceReleases VALUES ('source','dataset');
INSERT INTO resourceReleases VALUES ('release','source');
      CREATE TABLE datasets (id TEXT, code TEXT);
      INSERT INTO apiVersions VALUES ('stats', 'stats');
      INSERT INTO datasets VALUES ('dataset', '${datasetCode}');
      INSERT INTO apiReleaseSets VALUES
        ('2020-r0', '2020', 'government', 'hk', 0),
        ('2020-r1', '2020', 'government', 'hk', 1),
        ('2020-r2', '2020', 'government', 'hk', 2),
        ('2021-r0', '2021', 'government', 'hk', 0);
      INSERT INTO apiVersionReleaseSets VALUES
        ('2020-r0', 'stats', 'archived'), ('2020-r1', 'stats', 'archived'),
        ('2020-r2', 'stats', 'draft'), ('2021-r0', 'stats', 'current');
      INSERT INTO apiReleaseSetSnapshots VALUES ('2020-r0', 'old'), ('2020-r1', 'corrected'), ('2020-r2', 'draft'), ('2021-r0', 'new-period');
      INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'old','fixture-lineage-' || 'old','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'old' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'corrected','fixture-lineage-' || 'corrected','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'corrected' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'draft','fixture-lineage-' || 'draft','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'draft' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('fixture-lineage-' || 'new-period','fixture-lineage-' || 'new-period','divisionStatistic','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='divisionStatistic' WHERE id='fixture-lineage-' || 'new-period' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, cohortKey) VALUES
('old', 'fixture-lineage-' || 'old', '2020'),
('corrected', 'fixture-lineage-' || 'corrected', '2020'),
('draft', 'fixture-lineage-' || 'draft', '2020'),
('new-period', 'fixture-lineage-' || 'new-period', '2021');
      INSERT INTO snapshotResourceReleases(snapshotId,role) VALUES ('old', 'primary'), ('corrected', 'primary'), ('draft', 'primary'), ('new-period', 'primary');
    `)
    expect(await listPublishedStatisticsTargets(createLocalHarbourDb(meta))).toEqual([
      { datasetCode, referencePeriodCode: '2020', snapshotId: 'corrected' },
      { datasetCode, referencePeriodCode: '2021', snapshotId: 'new-period' },
    ])
  })
})

function d1(database: Database, beforeWrite?: (sql: string) => void) {
  const execute = new WeakMap<object, () => unknown>()
  const binding = {
    prepare(sql: string) {
      let parameters: Array<string | number | null> = []
      const statement = {
        bind(...values: Array<string | number | null>) {
          parameters = values
          return statement
        },
        async all() {
          return { results: database.query(sql).all(...parameters), success: true }
        },
        async first() {
          return database.query(sql).get(...parameters)
        },
        async run() {
          return execute.get(statement)?.()
        },
      }
      execute.set(statement, () => {
        beforeWrite?.(sql)
        const result = database.query(sql).run(...parameters)
        return { success: true, results: [], meta: { changes: result.changes } }
      })
      return statement
    },
    async batch(statements: object[]) {
      return database.transaction(() =>
        statements.map(statement => execute.get(statement)?.()),
      )()
    },
  }
  return binding as unknown as D1Database
}
