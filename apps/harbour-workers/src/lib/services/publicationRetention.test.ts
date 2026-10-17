import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
} from '@repo/core/pipeline/services/publication/sql'
import {
  buildBeginAddressPublicationSql,
  buildPrepareAddressPublicationSql,
} from '@repo/core/pipeline/db/addressPublication'
import { retainedDivisionScopeId } from '@repo/core/pipeline/services/publication/scope'
import {
  placeDivisionDisplaySql,
  placeAddressSnapshotSql,
} from '@repo/core/pipeline/services/places/publicationDependencies'
import { cleanupSnapshotByResourceType } from './snapshotCleanup'

const timestamp = '2026-10-17T00:00:00Z'
const initialise = () => {
  const db = new Database(':memory:')
  db.exec(
    loadMigrationSql(resolve(import.meta.dir, '../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  db.exec('PRAGMA foreign_keys=ON')
  return db
}

test('Places and Addresses keep complete exact dependencies until every publication advances', async () => {
  const db = initialise()
  const run = (sql: string) => db.transaction(() => db.exec(sql))()
  try {
    db.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('d','d1','current','dt','ready');
      INSERT INTO divisions(scopeId,id,class,level,hierarchies) VALUES('d','district','district',3,'{}');
      INSERT INTO divisionsI18n(scopeId,divisionId,locale,name) VALUES('d','district','en','Original');
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,divisionSnapshotId) VALUES('a','a1','current','at','ready','d1');
      INSERT INTO address2d(scopeId,id,divisionSnapshotId,districtId) VALUES('a','building','d','district');
      INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt,divisionSnapshotId,addressSnapshotId) VALUES('p','p1','current','pt','ready','d1','a1'),('q','q1','current','qt','ready','d1','a1');
      INSERT INTO places(scopeId,id,resourceReleaseId,geometry,firstSeenMonth,districtId,addressRole,address2dId) VALUES('p','place','r','{"type":"Point","coordinates":[114,22]}','2026-01','district','address','building');`)
    const next = {
      table: 'divisionPublicationState' as const,
      scopeId: 'd',
      snapshotId: 'd2',
      publicationToken: 'dt2',
      timestamp,
      previous: { snapshotId: 'd1', publicationToken: 'dt' },
    }
    run(buildBeginPublicationSql(next))
    const d1 = retainedDivisionScopeId('d', 'd1')
    expect(db.query('SELECT divisionSnapshotId FROM address2d').get()).toEqual({
      divisionSnapshotId: d1,
    })
    db.exec("UPDATE divisionsI18n SET name='Changed' WHERE scopeId='d'")
    run(buildCompletePublicationSql(next))
    db.exec(
      "UPDATE divisionPublicationState SET status='current' WHERE snapshotId='d2'",
    )
    const definition = () =>
      JSON.parse(
        (
          db
            .query(`SELECT ${placeDivisionDisplaySql()} AS value FROM places`)
            .get() as { value: string }
        ).value,
      )
    expect(definition().district).toEqual({
      divisionSnapshotId: 'd1',
      level: 3,
      locales: [{ locale: 'en', name: 'Original' }],
    })
    const owner = {
      scopeId: 'a',
      snapshotId: 'a2',
      publicationToken: 'at2',
      divisionSnapshotId: 'd2',
    }
    run(
      buildBeginAddressPublicationSql(owner, {
        scopeId: 'a',
        snapshotId: 'a1',
        publicationToken: 'at',
        preparedAt: 'ready',
        status: 'current',
        updatedAt: timestamp,
      }),
    )
    db.exec("UPDATE address2d SET divisionSnapshotId='d' WHERE scopeId='a'")
    run(buildPrepareAddressPublicationSql(owner, '1'))
    db.exec("UPDATE addressPublicationState SET status='current' WHERE snapshotId='a2'")
    expect(
      db.query(`SELECT ${placeAddressSnapshotSql()} value FROM places`).get(),
    ).toEqual({ value: 'a1' })
    const clean = (resourceType: 'division' | 'address', snapshotId: string) =>
      cleanupSnapshotByResourceType(drizzle({ client: db }) as never, {
        resourceType,
        snapshotId,
      })
    expect(await clean('division', 'd1')).toBe(false)
    expect(await clean('address', 'a1')).toBe(false)
    db.exec(
      "UPDATE placePublicationState SET divisionSnapshotId='d2',addressSnapshotId='a2' WHERE scopeId='p'",
    )
    expect(definition().district.locales[0].name).toBe('Changed')
    expect(await clean('address', 'a1')).toBe(false)
    db.exec(
      "UPDATE placePublicationState SET divisionSnapshotId='d2',addressSnapshotId='a2' WHERE scopeId='q'",
    )
    // The retained Address still pins d1 until its own projection is cleaned.
    expect(await clean('division', 'd1')).toBe(false)
    expect(await clean('address', 'a1')).toBe(true)
    expect(await clean('division', 'd1')).toBe(true)
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.query('SELECT id FROM places').all()).toEqual([{ id: 'place' }])
  } finally {
    db.close()
  }
})

test('replaying a retained Division revision preserves the displaced revision and reclaims its exact scope', () => {
  const db = initialise()
  const run = (sql: string) => db.transaction(() => db.exec(sql))()
  try {
    db.exec(`INSERT INTO divisionPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt) VALUES('d','d1','current','one','ready');
      INSERT INTO divisions(scopeId,id,class,hierarchies) VALUES('d','district','district','{}');
      INSERT INTO divisionsI18n(scopeId,divisionId,locale,name) VALUES('d','district','en','One');
      INSERT INTO address2d(scopeId,id,divisionSnapshotId,districtId) VALUES('a','building','d','district');`)
    const second = {
      table: 'divisionPublicationState' as const,
      scopeId: 'd',
      snapshotId: 'd2',
      publicationToken: 'two',
      timestamp,
      previous: { snapshotId: 'd1', publicationToken: 'one' },
    }
    run(buildBeginPublicationSql(second))
    db.exec("UPDATE divisionsI18n SET name='Two' WHERE scopeId='d'")
    run(buildCompletePublicationSql(second))
    db.exec("UPDATE divisionPublicationState SET status='current'")
    const replay = {
      ...second,
      snapshotId: 'd1',
      publicationToken: 'replay',
      previous: { snapshotId: 'd2', publicationToken: 'two' },
    }
    run(buildBeginPublicationSql(replay))
    db.exec("UPDATE divisionsI18n SET name='One' WHERE scopeId='d'")
    run(buildCompletePublicationSql(replay))
    expect(db.query('SELECT divisionSnapshotId FROM address2d').get()).toEqual({
      divisionSnapshotId: 'd',
    })
    expect(
      db
        .query('SELECT snapshotId FROM divisionPublicationState ORDER BY snapshotId')
        .all(),
    ).toEqual([{ snapshotId: 'd1' }, { snapshotId: 'd2' }])
    expect(db.query('SELECT count(*) n FROM divisions').get()).toEqual({ n: 2 })
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    db.close()
  }
})
