import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { currentSchema, type MetaDatabase, type CurrentDatabase } from '@repo/db'
import {
  getPublicationReadiness,
  hasSupersedingPublication,
  publicationScopeCondition,
  publicationLogicalSnapshot,
  guardPublicationRead,
  type PublicationFamily,
} from './publicationState'

const families: PublicationFamily[] = [
  'address',
  'division',
  'place',
  'street',
  'divisionArea',
  'divisionBoundary',
]

for (const family of families) {
  test(`${family} publication readiness requires exact, complete receipts and permits empty materialisations`, async () => {
    const sqlite = new Database(':memory:')
    const db = drizzle({ client: sqlite }) as never
    const table = `${family}PublicationState`
    try {
      sqlite.exec(
        `CREATE TABLE ${table}(snapshotId TEXT PRIMARY KEY, status TEXT, publicationToken TEXT, preparedAt TEXT, updatedAt TEXT)`,
      )
      expect(await getPublicationReadiness(db, family, ['selected'])).toBeNull()
      sqlite.exec(
        `INSERT INTO ${table} VALUES ('selected','publishing','generation-1',NULL,'same-time')`,
      )
      expect(await getPublicationReadiness(db, family, ['selected'])).toBeNull()
      sqlite.exec(`UPDATE ${table} SET status='current'`)
      expect(await getPublicationReadiness(db, family, ['selected'])).toBeNull()
      sqlite.exec(`UPDATE ${table} SET preparedAt='prepared'`)
      sqlite.exec(`UPDATE ${table} SET publicationToken=''`)
      expect(await getPublicationReadiness(db, family, ['selected'])).toBeNull()
      sqlite.exec(`UPDATE ${table} SET publicationToken='generation-1'`)
      const token = await getPublicationReadiness(db, family, ['selected'])
      expect(token).not.toBeNull()
      expect(
        await getPublicationReadiness(db, family, ['selected', 'absent']),
      ).toBeNull()
      expect(await getPublicationReadiness(db, family, ['selected', 'selected'])).toBe(
        token,
      )
      expect(
        await guardPublicationRead(db, family, ['selected'], token, async () => []),
      ).toEqual([])
      const interrupted = await guardPublicationRead(
        db,
        family,
        ['selected'],
        token,
        async () => {
          sqlite.exec(`UPDATE ${table} SET publicationToken='generation-2'`)
          return ['partial']
        },
      )
      expect(interrupted).toBeNull()
      const replacement = await getPublicationReadiness(db, family, ['selected'])
      expect(replacement).not.toBe(token)
      expect(
        await guardPublicationRead(db, family, ['selected'], replacement, async () => {
          sqlite.exec(`UPDATE ${table} SET status='publishing'`)
          throw new Error('A required companion disappeared during publication')
        }),
      ).toBeNull()
    } finally {
      sqlite.close()
    }
  })
}

test('publication guards preserve unrelated failures and immutable history reads', async () => {
  const failure = new Error('storage error')
  await expect(
    guardPublicationRead({} as never, 'address', [], null, async () => {
      throw failure
    }),
  ).rejects.toThrow(failure)
  expect(
    await guardPublicationRead({} as never, 'address', [], null, async () => [
      'historical',
    ]),
  ).toEqual(['historical'])
})

for (const family of families) {
  test(`${family} reads two publications from one physical scope and returns logical identifiers`, async () => {
    const sqlite = new Database(':memory:')
    const db = drizzle({ client: sqlite }) as unknown as CurrentDatabase
    const table = `${family}PublicationState`
    try {
      sqlite.exec(`CREATE TABLE ${table}(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
        INSERT INTO ${table} VALUES ('stable-scope','first','current','first-token','prepared','updated');
        CREATE TABLE places(snapshotId TEXT,id TEXT);
        INSERT INTO places VALUES ('stable-scope','unchanged');`)
      const read = (snapshotId: string) =>
        db
          .select({
            id: currentSchema.places.id,
            snapshotId: publicationLogicalSnapshot(
              family,
              currentSchema.places.snapshotId,
            ),
          })
          .from(currentSchema.places)
          .where(
            publicationScopeCondition(family, currentSchema.places.snapshotId, [
              snapshotId,
            ]),
          )
          .all()
      expect(await read('first')).toEqual([{ id: 'unchanged', snapshotId: 'first' }])
      const stored = sqlite.query('SELECT rowid,* FROM places').all()
      sqlite.exec(
        `UPDATE ${table} SET snapshotId='second',publicationToken='second-token'`,
      )
      expect(await read('first')).toEqual([])
      expect(await read('second')).toEqual([{ id: 'unchanged', snapshotId: 'second' }])
      expect(sqlite.query('SELECT rowid,* FROM places').all()).toEqual(stored)
      const query = db
        .select({ id: currentSchema.places.id })
        .from(currentSchema.places)
        .where(
          publicationScopeCondition(
            family,
            currentSchema.places.snapshotId,
            Array.from({ length: 200 }, (_, i) => `revision-${i}`),
          ),
        )
        .toSQL()
      expect(query.params).toHaveLength(1)
      sqlite.exec(`UPDATE ${table} SET status='publishing'`)
      expect(await read('second')).toEqual([])
    } finally {
      sqlite.close()
    }
  })
}

test('geometry history fallback requires a ready replacement within the same lineage and cohort', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as unknown as CurrentDatabase & MetaDatabase
  try {
    sqlite.exec(`CREATE TABLE snapshots(id TEXT,resourceType TEXT,snapshotLineageId TEXT,cohortKey TEXT,status TEXT);
      INSERT INTO snapshots VALUES ('pinned','divisionArea','lineage','2021','published');
      CREATE TABLE divisionAreaPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT);
      INSERT INTO divisionAreaPublicationState VALUES ('["lineage","2021"]','replacement','current','token','prepared');`)
    expect(await hasSupersedingPublication(db, db, 'divisionArea', 'pinned')).toBe(true)
    sqlite.exec("UPDATE divisionAreaPublicationState SET status='publishing'")
    expect(await hasSupersedingPublication(db, db, 'divisionArea', 'pinned')).toBe(
      false,
    )
    sqlite.exec(
      "UPDATE divisionAreaPublicationState SET status='current',snapshotId='pinned'",
    )
    expect(await hasSupersedingPublication(db, db, 'divisionArea', 'pinned')).toBe(
      false,
    )
    sqlite.exec(
      `UPDATE divisionAreaPublicationState SET snapshotId='replacement',scopeId='["lineage","2022"]'`,
    )
    expect(await hasSupersedingPublication(db, db, 'divisionArea', 'pinned')).toBe(
      false,
    )
  } finally {
    sqlite.close()
  }
})
