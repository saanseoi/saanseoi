import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveAddressDivisionScope } from './divisionScope'

test('historical Division selection resolves the acknowledged lineage without changing the selected revision', async () => {
  const client = new Database(':memory:')
  client.exec(`CREATE TABLE snapshots(id TEXT PRIMARY KEY, snapshotLineageId TEXT, resourceType TEXT, status TEXT);
    CREATE TABLE divisionPublicationState(scopeId TEXT, snapshotId TEXT, publicationToken TEXT, preparedAt TEXT);
    INSERT INTO snapshots VALUES ('old', 'lineage', 'division', 'published'), ('latest', 'lineage', 'division', 'published'), ('draft', 'lineage', 'division', 'pending'), ('other', 'other-lineage', 'division', 'published');
    INSERT INTO divisionPublicationState VALUES ('lineage', 'latest', 'token', 'prepared');`)
  const db = drizzle({ client }) as unknown as HarbourReadableDb
  try {
    expect(await resolveAddressDivisionScope(db, db, 'old')).toBe('lineage')
    expect(await resolveAddressDivisionScope(db, db, 'latest')).toBe('lineage')
    await expect(resolveAddressDivisionScope(db, db, 'draft')).rejects.toThrow(
      'not a published',
    )
    await expect(resolveAddressDivisionScope(db, db, 'other')).rejects.toThrow(
      'no complete',
    )
    client.exec('UPDATE divisionPublicationState SET preparedAt = NULL')
    await expect(resolveAddressDivisionScope(db, db, 'old')).rejects.toThrow(
      'no complete',
    )
    client.exec(
      "UPDATE divisionPublicationState SET preparedAt = 'prepared', snapshotId = 'other'",
    )
    await expect(resolveAddressDivisionScope(db, db, 'old')).rejects.toThrow(
      'does not match',
    )
  } finally {
    client.close()
  }
})
