import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import type { SnapshotReplayStep } from '../../lib/db/metaRegistry'
import { requireDefined } from '../../requireDefined'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { getReplayedAddressVersionMap } from './address'
import { loadReplayedAddressEvidence } from './addressEvidenceReplay'
import type { ReplayShard, ResolvedSnapshotVersion } from './snapshotReplay'

function fixture() {
  const databases = [new Database(':memory:'), new Database(':memory:')]
  const parameters: number[] = []
  const queryPlans: string[] = []
  const migrations = loadMigrationSql(
    resolve(import.meta.dir, '../../../../db/migrations'),
    ['history'],
  ).replaceAll('--> statement-breakpoint', '')
  const shards = new Map<string, ReplayShard>()
  for (const [index, db] of databases.entries()) {
    db.exec(migrations)
    const bindingName = index === 0 ? 'old' : 'new'
    shards.set(bindingName, {
      bindingName,
      db: drizzle({
        client: db,
        logger: {
          logQuery: (sql, params) => {
            parameters.push(params.length)
            if (/from "address2d(?:I18n|Evidence)?"/.test(sql)) {
              queryPlans.push(
                ...db
                  .query(`EXPLAIN QUERY PLAN ${sql}`)
                  .all(...(params as never[]))
                  .map(row => (row as { detail: string }).detail),
              )
            }
          },
        },
      }) as never,
    })
  }
  const journal = (
    index: number,
    snapshot: string,
    type: string,
    hash: string,
    locale = '',
  ) =>
    requireDefined(databases[index])
      .query(`INSERT INTO snapshotVersionChanges
        (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId)
        VALUES(?,?, 'opa-shared',?,?,'upsert',?)`)
      .run(snapshot, type, locale, hash, `release-${snapshot}`)
  const evidence = (index: number, snapshot: string, hash: string, sources: unknown) =>
    requireDefined(databases[index])
      .query(`INSERT INTO address2dEvidence
        (addressId,sources,versionHash,sourceReleaseId,snapshotId,isCurrent)
        VALUES('opa-shared',?,?,?,?,0)`)
      .run(JSON.stringify(sources), hash, `release-${snapshot}`, snapshot)
  const plan = (snapshotId: string): SnapshotReplayStep[] => [
    {
      snapshotId,
      parentSnapshotId: null,
      shards: [...shards.keys()].map(bindingName => ({
        bindingName,
        dataShardId: bindingName,
      })),
    },
  ]
  const replay = (snapshot: string, includeLocales = true) =>
    getReplayedAddressVersionMap(
      {} as never,
      snapshot,
      shards,
      {
        buildAddressBaseHashInput: value => value,
        buildMatchKey: () => null,
        normaliseAddressI18nSnapshotRow: value => value,
      },
      { plan: plan(snapshot), includeLocales },
    )
  requireDefined(databases[0]).exec(`INSERT INTO address2d
    (id,sources,versionHash,sourceReleaseId,snapshotId,isCurrent)
    VALUES('opa-shared',NULL,'base','release-first','first',1);
    INSERT INTO address2dI18n
    (addressId,locale,formattedAddress,versionHash,sourceReleaseId,snapshotId,isCurrent)
    VALUES('opa-shared','en','1 Sample Road','english','release-first','first',1);`)
  return {
    databases,
    shards,
    parameters,
    queryPlans,
    journal,
    evidence,
    replay,
    close: () => {
      for (const db of databases) db.close()
    },
  }
}

test('parentless supplementary snapshots replay exact edition evidence across component-owning shards', async () => {
  const data = fixture()
  try {
    const first = [
      {
        sourceReleaseId: 'release-first',
        placeSourceReleaseId: 'places-2025',
        sourceVersion: '2025-12-17.0',
        sourceRecordId: 'place-a',
        selectedAlsBase: {
          snapshotId: 'als-2025',
          addressId: 'official',
          divisionSnapshotId: 'division-2025',
          divisions: { districtId: 'district-a' },
        },
      },
    ]
    const firstRecord = requireDefined(first[0])
    const next = ['place-a', 'place-b'].map(sourceRecordId => ({
      ...firstRecord,
      sourceRecordId,
      sourceReleaseId: 'release-next',
      placeSourceReleaseId: 'places-2026',
      sourceVersion: '2026-01-21.0',
      selectedAlsBase: {
        ...firstRecord.selectedAlsBase,
        snapshotId: 'als-2026',
        divisionSnapshotId: 'division-2026',
      },
    }))
    for (const snapshot of ['first', 'next']) {
      data.journal(0, snapshot, 'address2d', 'base')
      data.journal(0, snapshot, 'address2dI18n', 'english', 'en')
    }
    data.evidence(0, 'first', 'evidence-first', first)
    data.evidence(1, 'next', 'evidence-next', next)
    data.journal(0, 'first', 'address2dEvidence', 'evidence-first')
    data.journal(1, 'next', 'address2dEvidence', 'evidence-next')
    data.evidence(1, 'other-branch', 'wrong-evidence', [{ wrong: true }])

    const original = requireDefined((await data.replay('first')).get('opa-shared'))
    const changed = requireDefined((await data.replay('next')).get('opa-shared'))
    expect(original.base.sources).toEqual(first)
    expect(changed.base.sources).toEqual(next)
    expect(changed.versionHash).toBe(original.versionHash)
    expect(changed.localisedRows).toEqual(original.localisedRows)
    expect((await data.replay('next', false)).get('opa-shared')?.base.sources).toEqual(
      next,
    )
    expect((await data.replay('next', false)).get('opa-shared')?.localisedRows).toEqual(
      [],
    )
    expect((await data.replay('empty')).size).toBe(0)
    expect(
      requireDefined(data.databases[0]).query('SELECT sources FROM address2d').get(),
    ).toEqual({
      sources: null,
    })
  } finally {
    data.close()
  }
})

test('supplementary replay fails closed on missing evidence or the wrong owning shard', async () => {
  const data = fixture()
  try {
    data.journal(0, 'missing', 'address2d', 'base')
    await expect(data.replay('missing')).rejects.toThrow(
      'missing supplementary Address evidence',
    )
    data.evidence(0, 'missing', 'elsewhere', [{ sourceVersion: '2025-12-17.0' }])
    data.journal(1, 'missing', 'address2dEvidence', 'elsewhere')
    await expect(data.replay('missing')).rejects.toThrow(
      'could not load Address evidence versions from new',
    )
  } finally {
    data.close()
  }
})

test('evidence reads bound query parameters when a page selects many versions', async () => {
  const data = fixture()
  try {
    const versions: ResolvedSnapshotVersion[] = []
    const insert = requireDefined(
      data.databases[0],
    ).query(`INSERT INTO address2dEvidence
      (addressId,sources,versionHash,sourceReleaseId,snapshotId,isCurrent)
      VALUES(?,'[]',?,'release','snapshot',0)`)
    for (let index = 0; index < 205; index++) {
      const recordId = `opa-${index}`
      const versionHash = `hash-${index}`
      insert.run(recordId, versionHash)
      versions.push({
        recordType: 'address2dEvidence',
        recordId,
        versionHash,
        locale: '',
        sourceReleaseId: 'release',
        shard: requireDefined(data.shards.get('old')),
      })
    }
    expect((await loadReplayedAddressEvidence(versions)).size).toBe(205)
    expect(data.parameters.length).toBeGreaterThan(1)
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(100)
  } finally {
    data.close()
  }
})

test('address replay uses indexed exact identities within D1 limits across batches', async () => {
  const data = fixture()
  try {
    const db = requireDefined(data.databases[0])
    for (let index = 0; index < 205; index++) {
      const id = `address-${index}`
      db.query(
        `INSERT INTO address2d (id,versionHash,sourceReleaseId,snapshotId,isCurrent) VALUES(?, 'shared-base', 'release-batch', 'batch', 1)`,
      ).run(id)
      for (const locale of ['en', 'zh-Hant']) {
        db.query(
          `INSERT INTO address2dI18n (addressId,locale,formattedAddress,versionHash,sourceReleaseId,snapshotId,isCurrent) VALUES(?,?,?, 'shared-locale', 'release-batch', 'batch', 1)`,
        ).run(id, locale, `${id}-${locale}`)
        db.query(
          `INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('batch','address2dI18n',?,?,'shared-locale','upsert','release-batch')`,
        ).run(id, locale)
      }
      db.query(
        `INSERT INTO snapshotVersionChanges (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId) VALUES('batch','address2d',?,'','shared-base','upsert','release-batch')`,
      ).run(id)
    }
    const result = await data.replay('batch')
    expect(result.size).toBe(205)
    for (const [id, row] of result) {
      expect(row.localisedRows).toHaveLength(2)
      expect(row.localisedRows.map(value => value.formattedAddress).sort()).toEqual([
        `${id}-en`,
        `${id}-zh-Hant`,
      ])
    }
    expect(Math.max(...data.parameters)).toBeLessThanOrEqual(100)
    expect(data.queryPlans.some(detail => detail.includes('SEARCH address2d'))).toBe(
      true,
    )
    expect(data.queryPlans.filter(detail => /SCAN address2d/.test(detail))).toEqual([])
  } finally {
    data.close()
  }
})
