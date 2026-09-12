import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { assertDraftPurgePublicationAvailable } from './rollbackPublication'

test('draft purge requires a ready predecessor when the draft owns current', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE placePublicationState(scopeId PRIMARY KEY, snapshotId UNIQUE, status, preparedAt, publicationToken);
    INSERT INTO placePublicationState VALUES('scope','new','current','complete','token');`)
  const db = createLocalHarbourDb(sqlite)
  const input = {
    resourceType: 'place' as const,
    snapshotId: 'new',
    previousSnapshotId: 'old',
  }
  try {
    await expect(assertDraftPurgePublicationAvailable(db, input)).rejects.toThrow(
      'Complete recovery of the draft-owned current scope',
    )
    await assertDraftPurgePublicationAvailable(db, {
      ...input,
      snapshotId: 'unprepared-draft',
    })
    await assertDraftPurgePublicationAvailable(db, {
      ...input,
      previousSnapshotId: null,
    })
    sqlite.exec("UPDATE placePublicationState SET snapshotId='old',status='publishing'")
    await expect(
      assertDraftPurgePublicationAvailable(db, { ...input, snapshotId: 'old' }),
    ).rejects.toThrow('no ready current projection')
    sqlite.exec("UPDATE placePublicationState SET status='current'")
    await assertDraftPurgePublicationAvailable(db, input)
    expect(sqlite.query('SELECT snapshotId FROM placePublicationState').get()).toEqual({
      snapshotId: 'old',
    })
  } finally {
    sqlite.close()
  }
})
