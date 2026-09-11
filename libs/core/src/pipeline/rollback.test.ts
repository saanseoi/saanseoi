import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'

import { buildDraftReleasePurgeSql } from './rollback'

describe('draft release purge SQL', () => {
  test('purges a draft PLAND release without reopening or retaining its rows', () => {
    const sql = buildDraftReleasePurgeSql({
      apiReleaseSetId: 'release-set-draft',
      releaseId: 'release-draft',
      snapshotId: 'snapshot-draft',
      source: 'hkgov-pland-new-town',
      sourceVersion: '2006',
      resourceType: 'division',
    })

    expect(sql.source).toBe(
      "DELETE FROM hkgovPlandNewTowns WHERE releaseId = 'release-draft';\n",
    )
    expect(sql.current).toContain(
      "DELETE FROM divisionsI18n WHERE snapshotId IN (SELECT scopeId FROM divisionPublicationState WHERE snapshotId = 'snapshot-draft');",
    )
    expect(sql.current).toContain(
      "DELETE FROM divisions WHERE snapshotId IN (SELECT scopeId FROM divisionPublicationState WHERE snapshotId = 'snapshot-draft');",
    )
    expect(sql.current).not.toContain('SET isCurrent')
    expect(sql.history).toContain(
      "DELETE FROM divisions WHERE snapshotId = 'snapshot-draft' AND sourceReleaseId = 'release-draft';",
    )
    expect(sql.history).toContain(
      "DELETE FROM divisionsI18n WHERE snapshotId = 'snapshot-draft' AND sourceReleaseId = 'release-draft';",
    )
    expect(sql.history).not.toContain('SET isCurrent')
    expect(sql.meta).toContain(
      "DELETE FROM apiReleaseSets WHERE id = 'release-set-draft';",
    )
    expect(sql.meta).toContain("DELETE FROM releases WHERE id = 'release-draft';")

    const planningCellSql = buildDraftReleasePurgeSql({
      apiReleaseSetId: 'release-set-draft',
      releaseId: 'release-draft',
      snapshotId: 'snapshot-draft',
      source: 'hkgov-pland-pu',
      sourceVersion: '2006',
      resourceType: 'division',
    })
    expect(planningCellSql.source).toBe(
      "DELETE FROM hkgovPlandPlanningCells WHERE releaseId = 'release-draft';\n",
    )
  })

  test('purges Places children before the parent', () => {
    const sql = buildDraftReleasePurgeSql({
      apiReleaseSetId: 'places-release-set-new',
      releaseId: 'places-release-new',
      snapshotId: 'places-snapshot-new',
      source: 'overture',
      sourceVersion: '2026-08-19.0',
      resourceType: 'place',
    })

    const placesDelete = 'DELETE FROM places WHERE'
    expect(sql.current.indexOf('DELETE FROM placesCells')).toBeLessThan(
      sql.current.indexOf(placesDelete),
    )
    expect(sql.current).toContain(
      "DELETE FROM placesDivision WHERE placeSnapshotId IN (SELECT scopeId FROM placePublicationState WHERE snapshotId = 'places-snapshot-new');",
    )
    expect(sql.current).toContain(
      "DELETE FROM placeSearchScopes WHERE snapshotId = 'places-snapshot-new';",
    )
    expect(sql.history).toContain(
      "DELETE FROM places WHERE snapshotId = 'places-snapshot-new' AND sourceReleaseId = 'places-release-new';",
    )
    expect(sql.source).toContain(
      "DELETE FROM overturePlaces WHERE releaseId = 'places-release-new';",
    )
    expect(sql.source).toContain(
      "UPDATE overturePlaces SET isCurrent = 1, validToRelease = NULL WHERE isCurrent = 0 AND validToRelease = '2026-08-19.0';",
    )
  })

  test('reopens Place source predecessors in the shard that owned them', () => {
    const sql = buildDraftReleasePurgeSql({
      apiReleaseSetId: 'places-release-set-new',
      releaseId: 'places-release-new',
      snapshotId: 'places-snapshot-new',
      source: 'overture',
      sourceVersion: '2026-08-19.0',
      resourceType: 'place',
    })
    const old = new Database(':memory:')
    const active = new Database(':memory:')
    try {
      for (const database of [old, active])
        database.exec(`
          CREATE TABLE overturePlaces (
            sourceRecordId TEXT,
            releaseId TEXT,
            validFromRelease TEXT,
            validToRelease TEXT,
            isCurrent INTEGER
          );
        `)
      old.exec(
        "INSERT INTO overturePlaces VALUES ('place-1','old-release','2025-01-01.0','2026-08-19.0',0)",
      )
      active.exec(
        "INSERT INTO overturePlaces VALUES ('place-1','places-release-new','2026-08-19.0',NULL,1)",
      )

      old.exec(sql.source)
      active.exec(sql.source)

      expect(old.query('SELECT * FROM overturePlaces').all()).toEqual([
        {
          sourceRecordId: 'place-1',
          releaseId: 'old-release',
          validFromRelease: '2025-01-01.0',
          validToRelease: null,
          isCurrent: 1,
        },
      ])
      expect(active.query('SELECT * FROM overturePlaces').all()).toEqual([])
    } finally {
      old.close()
      active.close()
    }
  })

  test('rejects unsupported source/type combinations', () => {
    expect(() =>
      buildDraftReleasePurgeSql({
        apiReleaseSetId: 'release-set-new',
        releaseId: 'release-new',
        snapshotId: 'snapshot-new',
        source: 'unknown',
        sourceVersion: '2026-05-20.0',
        resourceType: 'address',
      }),
    ).toThrow('Rollback is not implemented for source unknown/address.')
  })
})

test('draft purge resolves the selected logical revision to its scope and leaves a newer owner alone', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE divisionSearchScopes(scopeId PRIMARY KEY,snapshotId);
    CREATE TABLE divisions(snapshotId,id,PRIMARY KEY(snapshotId,id));
    CREATE TABLE divisionsI18n(snapshotId,divisionId,locale);
    CREATE TABLE divisionPublicationState(scopeId PRIMARY KEY,snapshotId UNIQUE);
    INSERT INTO divisionPublicationState VALUES('selected-scope','selected'),('other-scope','newer');
    INSERT INTO divisions VALUES('selected-scope','a'),('other-scope','b');
    INSERT INTO divisionsI18n VALUES('selected-scope','a','en'),('other-scope','b','en');`)
  const input = {
    apiReleaseSetId: 'set',
    releaseId: 'release',
    snapshotId: 'selected',
    source: 'overture',
    sourceVersion: '2026',
    resourceType: 'division' as const,
  }
  try {
    db.exec(buildDraftReleasePurgeSql(input).current)
    expect(db.query('SELECT * FROM divisions').all()).toEqual([
      { snapshotId: 'other-scope', id: 'b' },
    ])
    expect(db.query('SELECT * FROM divisionPublicationState').all()).toEqual([
      { scopeId: 'other-scope', snapshotId: 'newer' },
    ])
    db.exec(buildDraftReleasePurgeSql({ ...input, snapshotId: 'old-revision' }).current)
    expect(db.query('SELECT count(*) AS n FROM divisions').get()).toEqual({ n: 1 })
  } finally {
    db.close()
  }
})
