import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { assertRollbackPublicationAvailable } from './rollbackPublication'

test('rollback requires a ready predecessor before changing any databases', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE placePublicationState(scopeId PRIMARY KEY, snapshotId UNIQUE, status, preparedAt, publicationToken);
    INSERT INTO placePublicationState VALUES('scope','new','current','complete','token');`)
  const db = createLocalHarbourDb(sqlite)
  const input = {
    resourceType: 'place' as const,
    snapshotId: 'new',
    previousSnapshotId: 'old',
    operation: 'rollback' as const,
  }
  try {
    await expect(assertRollbackPublicationAvailable(db, input)).rejects.toThrow(
      'Automatic restoration from history',
    )
    await expect(
      assertRollbackPublicationAvailable(db, { ...input, operation: 'purge' }),
    ).rejects.toThrow('Automatic restoration from history')
    await assertRollbackPublicationAvailable(db, {
      ...input,
      operation: 'purge',
      snapshotId: 'unprepared-draft',
    })
    await assertRollbackPublicationAvailable(db, { ...input, previousSnapshotId: null })
    sqlite.exec("UPDATE placePublicationState SET snapshotId='old',status='publishing'")
    await expect(assertRollbackPublicationAvailable(db, input)).rejects.toThrow(
      'no ready current projection',
    )
    sqlite.exec("UPDATE placePublicationState SET status='current'")
    await assertRollbackPublicationAvailable(db, input)
    expect(sqlite.query('SELECT snapshotId FROM placePublicationState').get()).toEqual({
      snapshotId: 'old',
    })
  } finally {
    sqlite.close()
  }
})
