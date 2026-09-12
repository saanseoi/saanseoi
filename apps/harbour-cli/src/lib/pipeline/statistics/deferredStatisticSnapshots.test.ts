import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import {
  ensureDraftSnapshotForRelease,
  resolveAcceptedStatisticSnapshotParent,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import { readStatisticSnapshotRecords } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { handlePublishDataset } from '../../../../../harbour-api/src/lib/services/control'
import { handleBootstrapStatsReleaseSets } from '../../../../../harbour-api/src/lib/services/controlReconciliation'
import { planCanonicalStatistics } from './planCanonicalStatistics'
import { initialDatasets } from '@repo/db/registry'
import type { CanonicalStatsRows } from './normaliseHkgovCenstatdStatistics'

const migrations = resolve(import.meta.dir, '../../../../../../libs/db/migrations')
const datasetCode =
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district'

function fixture() {
  const meta = new Database(':memory:')
  const history = new Database(':memory:')
  meta.exec(loadMigrationSql(migrations, ['meta']))
  history.exec(loadMigrationSql(migrations, ['history']))
  const db = createLocalHarbourDb(meta)
  const historyDbs = [createLocalHarbourDb(history)]
  meta.exec(`
    INSERT INTO publishers(id,code,versionHash) VALUES('publisher','hkgov-censtatd','hash');
    INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,sourceVariant,versionHash)
    VALUES('dataset','publisher','${datasetCode}','hk','static','yearly','stats','official-statistics','hash');
    INSERT INTO apiVersions(id,code,familyType,version,status,versionHash)
    VALUES('api','api-stats-v0.1','stats','0.1','current','hash');
    INSERT INTO apiComposition(id,apiVersionId,code,version,primaryResourceType,defaultDomainCode,status,versionHash)
    VALUES('composition','api','comp-stats-v1',1,'divisionStatistic','government','current','hash');
    INSERT INTO apiCompositionMembers(apiCompositionId,domainCode,resourceType,variant,role,isRequired,cohortMatchingMode,priority)
    VALUES('composition','government','divisionStatistic','${datasetCode}','primary',1,'exact_ref',0);
  `)
  let sourceRevision = 0
  const snapshot = async (releaseId: string, period = '2020') => {
    const sourceVersion = ['2021', '2022', '2023-H2', '2024', '2026-Q2'][
      sourceRevision++
    ]!
    meta
      .query(`INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,cohortKey,status)
      VALUES(?,'dataset',?,?,'2026-Q2','processing')`)
      .run(releaseId, `sr-${releaseId}`, sourceVersion)
    meta
      .query(`INSERT INTO releases(id,sourceReleaseId,datasetId,resourceType,code,sourceVersion,cohortKey,status)
      VALUES(?,?,'dataset','divisionStatistic',?,?,'2026-Q2','processing')`)
      .run(releaseId, releaseId, releaseId, sourceVersion)
    meta
      .query('UPDATE releases SET processingRules=? WHERE id=?')
      .run(
        JSON.stringify(
          initialDatasets.find(row => row.code === datasetCode)?.processingRules,
        ),
        releaseId,
      )
    meta
      .query(`INSERT INTO releaseProvenance(releaseId,manifestHash,byteLength,applicationCount,attemptStatus)
      VALUES(?,?,1,1,'completed')`)
      .run(releaseId, `sha256:${'0'.repeat(64)}`)
    const result = await ensureDraftSnapshotForRelease(db, 'divisionStatistic', {
      cohortKey: period,
      datasetCode,
      datasetId: 'dataset',
      identityMode: 'cohort_scoped',
      regionCode: 'hk',
      sourceReleaseId: releaseId,
      variant: datasetCode,
    })
    await upsertSnapshotSource(db, result.id, 'dataset', releaseId, 'primary')
    return result
  }
  const stage = async (
    target: Awaited<ReturnType<typeof snapshot>>,
    releaseId: string,
    rows: Array<[string, Record<string, string>]>,
  ) => {
    const records: CanonicalStatsRows['records'] = rows.map(([id, values]) => ({
      id,
      datasetCode,
      sourceReleaseId: releaseId,
      sourceFeatureRef: `${releaseId}/${id}`,
      divisionId: `division-${id}`,
      geography: { kind: 'district', code: id },
      referencePeriodCode: '2020',
      referencePeriodEndYear: '2020',
      referencePeriodStart: '2020-01-01',
      referencePeriodEnd: '2020-12-31',
      referencePeriodGranularity: 'year',
      values,
      fieldDefinitionHashes: Object.fromEntries(
        Object.keys(values).map(key => [key, `${key}-v1`]),
      ),
      fieldSources: Object.fromEntries(
        Object.keys(values).map(key => [
          key,
          { sourceReleaseId: releaseId, sourceFeatureRef: `${releaseId}/${id}` },
        ]),
      ),
    }))
    const plan = await planCanonicalStatistics({
      canonical: {
        records,
        fields: [],
        fieldsI18n: [],
        measures: [],
        measuresI18n: [],
        observations: [],
        dimensions: [],
        values: [],
        valuesI18n: [],
      },
      metaDb: db,
      historyDbs,
      snapshots: [target],
      sourceReleaseId: releaseId,
      now: '2026-09-12T00:00:00.000Z',
    })
    expect(plan.buildBatches().current).toEqual([])
    for (const shard of plan.buildBatches().history)
      for (const sql of shard.batches) history.exec(sql)
  }
  return {
    meta,
    db,
    snapshot,
    stage,
    historyDbs,
    close() {
      meta.close()
      history.close()
    },
  }
}

test.each([false, true])(
  'partial deferred revisions inherit fields and geographies with existing catalogue=%s',
  async catalogued => {
    const f = fixture()
    try {
      const first = await f.snapshot('first')
      await f.stage(first, 'first', [
        ['A', { population: '100', age: '40' }],
        ['B', { population: '200', age: '41' }],
      ])
      const shared = await handlePublishDataset(f.db, {
        releaseId: 'first',
        deferStatsReleaseSet: true,
        deferSourcePublish: true,
      })
      expect(shared.metadataDelta?.snapshots ?? []).toEqual([])
      expect(
        f.meta.query('SELECT status FROM snapshots WHERE id=?').get(first.id),
      ).toEqual({ status: 'draft' })
      const published = await handlePublishDataset(f.db, {
        releaseId: 'first',
        deferStatsReleaseSet: true,
      })
      expect(published.metadataDelta?.snapshots).toEqual([
        expect.objectContaining({ id: first.id, status: 'published' }),
      ])
      let retainedFirst = f.meta
        .query('SELECT * FROM snapshots WHERE id=?')
        .get(first.id)
      expect(
        await handlePublishDataset(f.db, {
          releaseId: 'first',
          deferStatsReleaseSet: true,
        }),
      ).toEqual(published)
      expect(f.meta.query('SELECT * FROM snapshots WHERE id=?').get(first.id)).toEqual(
        retainedFirst,
      )
      expect(f.meta.query('SELECT count(*) AS n FROM apiReleaseSets').get()).toEqual({
        n: 0,
      })
      if (catalogued) await handleBootstrapStatsReleaseSets(f.db)
      retainedFirst = f.meta.query('SELECT * FROM snapshots WHERE id=?').get(first.id)
      const catalogueBefore = f.meta.query('SELECT * FROM apiCatalogRevisions').all()

      const second = await f.snapshot('second')
      expect(second.parentSnapshotId).toBe(first.id)
      await f.stage(second, 'second', [['A', { population: '101' }]])
      await handlePublishDataset(f.db, {
        releaseId: 'second',
        deferStatsReleaseSet: true,
      })
      const third = await f.snapshot('third')
      expect(third.parentSnapshotId).toBe(second.id)
      await f.stage(third, 'third', [['A', { population: '102' }]])
      await handlePublishDataset(f.db, {
        releaseId: 'third',
        deferStatsReleaseSet: true,
      })
      expect(f.meta.query('SELECT * FROM apiCatalogRevisions').all()).toEqual(
        catalogueBefore,
      )
      const rows = await readStatisticSnapshotRecords(f.db, f.historyDbs, third.id)
      expect(
        rows
          .map(row => ({ id: row.id, values: row.values }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual([
        { id: 'A', values: { population: '102', age: '40' } },
        { id: 'B', values: { population: '200', age: '41' } },
      ])
      expect(rows.find(row => row.id === 'A')?.fieldSources.age?.sourceReleaseId).toBe(
        'first',
      )
      expect(f.meta.query('SELECT * FROM snapshots WHERE id=?').get(first.id)).toEqual(
        retainedFirst,
      )
      if (!catalogued) {
        const bootstrap = await handleBootstrapStatsReleaseSets(f.db)
        expect(bootstrap.inspectedSnapshots).toBe(3)
        expect(
          f.meta.query('SELECT snapshotId FROM apiReleaseSetSnapshots').all(),
        ).toEqual([{ snapshotId: third.id }])
        expect(
          f.meta.query('SELECT * FROM snapshots WHERE id=?').get(first.id),
        ).toEqual(retainedFirst)
        expect(
          (await handleBootstrapStatsReleaseSets(f.db)).createdReleaseSetCodes,
        ).toEqual([])
      }
      const anotherPeriod = await f.snapshot('another-period', '2019')
      expect(anotherPeriod.parentSnapshotId).toBeNull()
    } finally {
      f.close()
    }
  },
)

test.each(['draft', 'missing-audit', 'failed-audit', 'processing', 'revoked'])(
  'excludes %s source revisions from accepted inheritance',
  async state => {
    const f = fixture()
    try {
      const first = await f.snapshot('first')
      await handlePublishDataset(f.db, {
        releaseId: 'first',
        deferStatsReleaseSet: true,
      })
      const second = await f.snapshot('second')
      await handlePublishDataset(f.db, {
        releaseId: 'second',
        deferStatsReleaseSet: true,
      })
      if (state === 'draft')
        f.meta.query("UPDATE snapshots SET status='draft' WHERE id=?").run(second.id)
      else if (state === 'missing-audit')
        f.meta.exec("DELETE FROM releaseProvenance WHERE releaseId='second'")
      else if (state === 'failed-audit')
        f.meta.exec(
          "UPDATE releaseProvenance SET attemptStatus='failed' WHERE releaseId='second'",
        )
      else f.meta.query('UPDATE releases SET status=? WHERE id=?').run(state, 'second')
      expect((await f.snapshot('third')).parentSnapshotId).toBe(first.id)
    } finally {
      f.close()
    }
  },
)

test('rejects competing deferred branches before bootstrap writes a release set', async () => {
  const f = fixture()
  try {
    const first = await f.snapshot('first')
    await handlePublishDataset(f.db, { releaseId: 'first', deferStatsReleaseSet: true })
    const second = await f.snapshot('second')
    const competing = await f.snapshot('competing')
    expect(competing.parentSnapshotId).toBe(first.id)
    await handlePublishDataset(f.db, {
      releaseId: 'second',
      deferStatsReleaseSet: true,
    })
    await handlePublishDataset(f.db, {
      releaseId: 'competing',
      deferStatsReleaseSet: true,
    })
    await expect(f.snapshot('fourth')).rejects.toThrow(
      'competing completed deferred revisions',
    )
    await expect(handleBootstrapStatsReleaseSets(f.db)).rejects.toThrow(
      'competing completed deferred revisions',
    )
    expect(f.meta.query('SELECT count(*) AS n FROM apiReleaseSets').get()).toEqual({
      n: 0,
    })
    expect(second.id).not.toBe(competing.id)
  } finally {
    f.close()
  }
})

test('does not cross an archived catalogue branch after a rollback', async () => {
  const f = fixture()
  try {
    const first = await f.snapshot('first')
    await handlePublishDataset(f.db, { releaseId: 'first', deferStatsReleaseSet: true })
    await handleBootstrapStatsReleaseSets(f.db)
    const _second = await f.snapshot('second')
    await handlePublishDataset(f.db, { releaseId: 'second' })
    const third = await f.snapshot('third')
    await handlePublishDataset(f.db, { releaseId: 'third', deferStatsReleaseSet: true })
    f.meta.exec(`UPDATE apiCatalogRevisions SET status='archived';
      UPDATE apiCatalogRevisions SET status='current' WHERE revision=(SELECT min(revision) FROM apiCatalogRevisions);`)
    expect((await f.snapshot('after-rollback')).parentSnapshotId).toBe(first.id)
    const lineage = f.meta
      .query('SELECT snapshotLineageId FROM snapshots WHERE id=?')
      .get(third.id) as { snapshotLineageId: string }
    expect(
      await resolveAcceptedStatisticSnapshotParent(
        f.db,
        lineage.snapshotLineageId,
        '2020',
      ),
    ).toEqual({ id: first.id })
  } finally {
    f.close()
  }
})
