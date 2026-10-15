import { releaseFixtureSchemaSql } from '../../../../../libs/core/src/testing/releaseFixtures'
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sourceOnlyCompletion } from './sourceOnlyCompletion'

test('source-only completion requires both archives, ingestion evidence and retained source membership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'source-completion-'))
  const meta = new Database(':memory:')
  const path = join(dir, 'source.sqlite')
  const source = new Database(path)
  const release = {
    id: 'release',
    code: 'dr-hk-protomaps-island-2026-10-01.0::divisionArea',
    resourceType: 'divisionArea',
  }
  try {
    meta.exec(`
      ${releaseFixtureSchemaSql()};
      CREATE TABLE datasets(id TEXT,code TEXT);
      CREATE TABLE processingAudits(resourceReleaseId TEXT,ownerId TEXT,stage TEXT,attemptStatus TEXT);
      CREATE TABLE assets(sourceReleaseId TEXT,resourceReleaseId TEXT,role TEXT,byteLength INTEGER,contentHash TEXT);
      INSERT OR IGNORE INTO sourceReleases (id, datasetId, code, sourceVersion, status) VALUES ('edition', 'dataset', 'source-' || 'release', '2026-10-01.0', 'current');
UPDATE sourceReleases SET datasetId = 'dataset', sourceVersion = '2026-10-01.0' WHERE id = 'edition';
INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status) VALUES ('release', 'edition', 'release', 'division', 'current');
      INSERT INTO datasets VALUES ('dataset','ds-hk-protomaps-island');
      INSERT INTO processingAudits VALUES ('release','release','ingestion','completed');
      INSERT INTO assets VALUES ('edition',NULL,'releaseSourceArchive',10,'hash');
      INSERT INTO assets VALUES (NULL,'release','resourceSourceArchive',10,'hash');
    `)
    source.exec(`CREATE TABLE protomapsIslandFeatures(validFromRelease TEXT,validToRelease TEXT);
      INSERT INTO protomapsIslandFeatures VALUES ('2026-09-01.0',NULL);`)
    const files = { DB_SOURCE_HK_2026: path }
    const check = () => sourceOnlyCompletion(meta, files, release)
    expect(check()).toBe(true)
    source.exec("UPDATE protomapsIslandFeatures SET validToRelease='2026-10-01.0'")
    expect(check()).toBe(false)
    source.exec('UPDATE protomapsIslandFeatures SET validToRelease=NULL')
    meta.exec("UPDATE processingAudits SET attemptStatus='failed'")
    expect(check()).toBe(false)
    meta.exec("UPDATE processingAudits SET attemptStatus='completed',ownerId='wrong'")
    expect(check()).toBe(false)
    meta.exec("UPDATE processingAudits SET ownerId='release'")
    expect(sourceOnlyCompletion(meta, {}, release)).toBe(false)
    meta.exec("DELETE FROM assets WHERE role='resourceSourceArchive'")
    expect(check()).toBe(false)
    expect(
      sourceOnlyCompletion(meta, files, {
        ...release,
        code: 'dr-hk-overture-division-2026-10-01.1',
      }),
    ).toBeNull()
  } finally {
    meta.close()
    source.close()
    await rm(dir, { recursive: true, force: true })
  }
})
