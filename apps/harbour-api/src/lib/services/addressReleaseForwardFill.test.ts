import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import { ensureDraftReleaseSetForRelease } from '@repo/core/db/metaRegistry'
import { initDb, seedSnapshot } from './controlFixtures.fixtures'
import { prepareAddressReleaseForwardFill } from './addressReleaseForwardFill'
import { releaseSetVersionsForPublication } from './releaseSetVersions'

test('late supplementary assemblies fill intermediate published cohorts in place without changing pinned inputs', async () => {
  const sqlite = initDb(':memory:')
  const db = createLocalHarbourDb(sqlite)
  try {
    sqlite.exec(
      "DELETE FROM apiVersionReleaseSets WHERE apiVersionId IN (SELECT id FROM apiVersions WHERE familyType='addresses')",
    )
    sqlite.exec(
      `INSERT OR IGNORE INTO datasets(id,publisherId,code,regionCode,resourceTypes,releaseType,releaseFrequency,theme,versionHash) SELECT 'overture-place-fixture',id,'ds-hk-overture-place','hk','["place","address"]','static','monthly','places','fixture' FROM publishers WHERE code='overture'`,
    )
    const seed = (source: 'hkgov-dpo' | 'overture', date: string) => {
      const release = insertFixtureRelease(sqlite, {
        source,
        resourceType: 'address',
        regionCode: 'hk',
        cohortKey: date,
        sourceVersion: date,
        datasetCode:
          source === 'overture' ? 'ds-hk-overture-place' : 'ds-hk-hkgov-dpo-address',
        rawObjectKey: 'fixture',
        originalFileName: 'fixture',
        status: 'current',
        ingestedAt: '2026-10-18T00:00:00.000Z',
        createdAt: '2026-10-18T00:00:00.000Z',
        updatedAt: '2026-10-18T00:00:00.000Z',
      })
      const row = sqlite
        .query('SELECT datasetId FROM resourceReleaseDetails WHERE id=?')
        .get(release.resourceReleaseId) as { datasetId: string }
      const id = seedSnapshot(sqlite, {
        code: `ss-${source}-${date}`,
        cohortKey: date,
        datasetId: row.datasetId,
        resourceType: 'address',
        resourceReleaseId: release.resourceReleaseId,
        status: 'published',
      })
      if (source === 'overture')
        sqlite
          .query(
            "UPDATE snapshotLineages SET variant='overture-places' WHERE id=(SELECT snapshotLineageId FROM snapshots WHERE id=?)",
          )
          .run(id)
      return id
    }
    const official = seed('hkgov-dpo', '2026-04-03.0')
    const create = async (date: string) => {
      const set = await ensureDraftReleaseSetForRelease(
        db,
        'address',
        { cohortKey: date, regionCode: 'hk' },
        {
          ...releaseSetVersionsForPublication('address', 'saanseoi', 'hkgov-dpo'),
          domainCode: 'saanseoi',
        },
      )
      sqlite
        .query(
          "INSERT INTO apiReleaseSetSnapshots(apiReleaseSetId,snapshotId,variant,role,isRequired,cohortMatchingMode) VALUES (?,?,'hkgov-dpo','primary',1,'exact_ref')",
        )
        .run(set.id, official)
      sqlite
        .query(
          "UPDATE apiVersionReleaseSets SET status='archived' WHERE apiReleaseSetId=?",
        )
        .run(set.id)
      return set
    }
    const early = await create('2026-02-01.0')
    const april = await create('2026-04-03.0')
    expect(await prepareAddressReleaseForwardFill(db, 'hk')).toEqual([])
    const march = seed('overture', '2026-03-18.0')
    seed('overture', '2026-04-15.0')
    const prepared = await prepareAddressReleaseForwardFill(db, 'hk')
    expect(prepared).toHaveLength(1)
    const draft = sqlite
      .query(
        "SELECT s.id FROM apiReleaseSets s JOIN apiVersionReleaseSets v ON v.apiReleaseSetId=s.id WHERE v.status='draft'",
      )
      .get() as { id: string }
    const members = (id: string) =>
      sqlite
        .query(
          'SELECT snapshotId,variant FROM apiReleaseSetSnapshots WHERE apiReleaseSetId=? ORDER BY variant',
        )
        .all(id)
    expect(members(draft.id)).toEqual([
      { snapshotId: official, variant: 'hkgov-dpo' },
      { snapshotId: march, variant: 'overture-places' },
    ])
    expect(draft.id).toBe(april.id)
    expect(members(early.id)).toHaveLength(1)
    expect(await prepareAddressReleaseForwardFill(db, 'hk')).toEqual([])
    expect(
      sqlite
        .query("SELECT count(*) AS n FROM apiReleaseSets WHERE code LIKE '%-r1'")
        .get(),
    ).toEqual({ n: 0 })
    sqlite
      .query(
        "UPDATE apiVersionReleaseSets SET status='current' WHERE apiReleaseSetId=?",
      )
      .run(draft.id)
    expect(await prepareAddressReleaseForwardFill(db, 'hk')).toEqual([])
  } finally {
    sqlite.close()
  }
})
