import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import {
  sqlDeliveryPhaseDirectory,
  type SqlDeliveryPhase,
} from '../local/sqlDeliveryPhase.ts'
import {
  assertSqlDeliveryPlanningAllowed,
  completeSqlDeliveryRelease,
} from '../local/sqlDeliveryPending.ts'
import { replayStatisticSqlBatches } from './statisticSqlReplay.ts'
import { replayCanonicalStatsSqlBatches } from './canonicalStatsSql.ts'
import { hashCanonicalStatisticPreparation } from './statisticPreparation.ts'

test('statistic preparation identity tracks reviewed metadata and bridge values', () => {
  const input = {
    fields: [{ id: 'field', label: 'Population' }],
    records: [{ divisionId: 'district', values: { population: 12 } }],
  }
  const original = hashCanonicalStatisticPreparation(input)
  expect(
    hashCanonicalStatisticPreparation({
      records: input.records,
      fields: [{ label: 'Population', id: 'field' }],
    }),
  ).toBe(original)
  expect(
    hashCanonicalStatisticPreparation({
      ...input,
      fields: [{ id: 'field', label: 'People' }],
    }),
  ).not.toBe(original)
  expect(
    hashCanonicalStatisticPreparation({
      ...input,
      records: [{ divisionId: 'other-district', values: { population: 12 } }],
    }),
  ).not.toBe(original)
})

test('native Statistics adapter resumes source/history plans without regenerating or repeating committed SQL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-statistics-'))
  const sourcePath = join(root, 'source.sqlite')
  const historyPath = join(root, 'history.sqlite')
  const source = new Database(sourcePath)
  const history = new Database(historyPath)
  const resourceReleaseId = `native-statistics-test-${crypto.randomUUID()}`
  const context = {
    metaDb: createLocalHarbourDb(source),
    sourceBinding: createLocalExecBinding(source, 'DB_SOURCE_HK_BEFORE'),
    historyBinding: createLocalExecBinding(history, 'DB_HISTORY_HK_BEFORE'),
    state: {
      target: 'local',
      dbCacheDir: root,
      files: { DB_SOURCE_HK_BEFORE: sourcePath, DB_HISTORY_HK_BEFORE: historyPath },
    },
  } as unknown as LocalAddressDbContext
  const delivery: SqlDeliveryPhase = {
    context,
    resourceReleaseId,
    phase: 'statistics-source',
    nativeLocal: true,
    inputs: { sourceHash: 'frozen' },
  }
  try {
    source.exec(
      'CREATE TABLE processingRuns (runId TEXT PRIMARY KEY, resourceReleaseId TEXT, snapshotId TEXT, apiReleaseSetId TEXT, stage TEXT NOT NULL, phase TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER DEFAULT 1 NOT NULL, checkpoint TEXT, results TEXT, error TEXT, startedAt TEXT NOT NULL, finishedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(resourceReleaseId,phase), UNIQUE(snapshotId,phase), UNIQUE(apiReleaseSetId,phase));',
    )
    let generated = 0
    for (const db of [source, history])
      db.exec('CREATE TABLE counter(n); INSERT INTO counter VALUES(0)')
    await expect(
      replayStatisticSqlBatches(
        { remote: false, environment: 'preview' },
        context,
        '2022',
        () => {
          generated++
          return {
            source: ['UPDATE counter SET n=n+1;', 'UPDATE counter SET n=n+2;'],
            history: ['UPDATE counter SET n=n+4;'],
          }
        },
        {
          delivery: {
            ...delivery,
            onProgress: n => {
              if (n === 1) throw new Error('interrupted')
            },
          },
        },
      ),
    ).rejects.toThrow('interrupted')
    expect(source.query('SELECT n FROM counter').get()).toEqual({ n: 3 })
    expect(history.query('SELECT n FROM counter').get()).toEqual({ n: 0 })
    await expect(
      assertSqlDeliveryPlanningAllowed(root, 'another-release'),
    ).rejects.toThrow('unfinished')
    await replayStatisticSqlBatches(
      { remote: false, environment: 'preview' },
      context,
      '2022',
      () => {
        throw new Error('Source SQL must not regenerate')
      },
      { delivery },
    )
    expect(source.query('SELECT n FROM counter').get()).toEqual({ n: 3 })
    expect(history.query('SELECT n FROM counter').get()).toEqual({ n: 4 })
    expect(generated).toBe(1)
    await expect(
      replayStatisticSqlBatches(
        { remote: false, environment: 'preview' },
        context,
        '2022',
        () => {
          throw new Error('Changed context must fail before generation')
        },
        { delivery: { ...delivery, inputs: { sourceHash: 'changed' } } },
      ),
    ).rejects.toThrow(
      'Processing checkpoint belongs to different inputs, rules or target.',
    )

    const canonicalContext = {
      ...context,
      currentBinding: createLocalExecBinding(source, 'DB_SOURCE_HK_BEFORE'),
      historyTargets: [],
    }
    const canonicalDelivery = {
      ...delivery,
      context: canonicalContext,
      phase: 'statistics-canonical',
    }
    await replayCanonicalStatsSqlBatches(
      { remote: false, environment: 'preview' },
      canonicalContext,
      () => ({ current: ['UPDATE counter SET n=n+8;'], history: [] }),
      { delivery: canonicalDelivery },
    )
    await replayCanonicalStatsSqlBatches(
      { remote: false, environment: 'preview' },
      canonicalContext,
      () => {
        throw new Error('Canonical SQL must not regenerate')
      },
      { delivery: canonicalDelivery },
    )
    expect(source.query('SELECT n FROM counter').get()).toEqual({ n: 11 })
    expect(await completeSqlDeliveryRelease(root, resourceReleaseId)).toBe(true)
    await assertSqlDeliveryPlanningAllowed(root, 'another-release')
  } finally {
    source.close()
    history.close()
    await rm(root, { recursive: true, force: true })
    await rm(dirname(sqlDeliveryPhaseDirectory(delivery)), {
      recursive: true,
      force: true,
    })
  }
})
