import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveAddressDivisionScope } from './divisionScope'

test('historical Division selection resolves the acknowledged lineage without changing the selected revision', async () => {
  const client = new Database(':memory:')
  client.exec(`CREATE TABLE snapshotLineages (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      regionCode TEXT NOT NULL DEFAULT 'hk',
      resourceType TEXT,
      variant TEXT NOT NULL DEFAULT 'default',
      identityMode TEXT NOT NULL DEFAULT 'persistent',
      primaryDatasetId TEXT,
      versionHash TEXT NOT NULL DEFAULT 'fixture',
      createdAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
      updatedAt TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
    );
    CREATE TABLE snapshots(
      id TEXT PRIMARY KEY,
      snapshotLineageId TEXT NOT NULL,
      status TEXT
    );
    CREATE TABLE divisionPublicationState(scopeId TEXT, snapshotId TEXT, publicationToken TEXT, preparedAt TEXT);
    INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('lineage','lineage','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='lineage' AND resourceType IS NULL;
INSERT OR IGNORE INTO snapshotLineages (id,code,resourceType,regionCode,variant,identityMode,versionHash,createdAt,updatedAt) VALUES ('other-lineage','other-lineage','division','hk','default','persistent','fixture','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
UPDATE snapshotLineages SET resourceType='division' WHERE id='other-lineage' AND resourceType IS NULL;
INSERT INTO snapshots (id, snapshotLineageId, status) VALUES
('old', 'lineage', 'published'),
('latest', 'lineage', 'published'),
('draft', 'lineage', 'pending'),
('other', 'other-lineage', 'published');
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
