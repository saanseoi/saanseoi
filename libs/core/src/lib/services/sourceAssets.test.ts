import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '../../testing/localDb'
import {
  linkManagedSourceAssetToRelease,
  linkSourceAssetManifest,
  resolveManagedAssetOwnership,
} from './sourceAssets'

function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE sourceReleases(id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE resourceReleases(id TEXT PRIMARY KEY, datasetId TEXT NOT NULL, sourceReleaseId TEXT, status TEXT);
    CREATE TABLE assets(id TEXT PRIMARY KEY, assetKey TEXT, datasetId TEXT, sourceReleaseId TEXT, resourceReleaseId TEXT, sourceAssetId TEXT, role TEXT, updatedAt TEXT);
    INSERT INTO sourceReleases VALUES ('source','current'),('other-source','current'),('old-source','failed');
    INSERT INTO resourceReleases VALUES ('release','dataset','source','current'),('sibling','dataset','source','current'),('other','other-dataset','other-source','current');
    INSERT INTO assets(id,assetKey,role) VALUES ('archive','archive.zip','releaseSourceArchive');
    INSERT INTO assets(id,assetKey,role,sourceAssetId) VALUES ('manifest','manifest.json','manifest','archive');
  `)
  return { sqlite, db: createLocalHarbourDb(sqlite) }
}

test('original archive belongs directly to its source release and is shared by sibling resources', async () => {
  const { sqlite, db } = fixture()
  try {
    expect(
      (
        await linkManagedSourceAssetToRelease(db, {
          assetKey: 'archive.zip',
          resourceReleaseId: 'release',
        })
      ).status,
    ).toBe('linked')
    expect(
      (
        await linkManagedSourceAssetToRelease(db, {
          assetKey: 'archive.zip',
          resourceReleaseId: 'sibling',
        })
      ).status,
    ).toBe('existing')
    expect(
      sqlite
        .query(
          'SELECT datasetId,sourceReleaseId,resourceReleaseId FROM assets WHERE id=?',
        )
        .get('archive'),
    ).toEqual({
      datasetId: 'dataset',
      sourceReleaseId: 'source',
      resourceReleaseId: null,
    })
    expect(
      sqlite
        .query('SELECT sourceReleaseId,resourceReleaseId FROM assets WHERE id=?')
        .get('manifest'),
    ).toEqual({ sourceReleaseId: 'source', resourceReleaseId: null })
    await expect(
      linkManagedSourceAssetToRelease(db, {
        assetKey: 'archive.zip',
        resourceReleaseId: 'other',
      }),
    ).rejects.toThrow('different release')
  } finally {
    sqlite.close()
  }
})

test('resource archives require Parquet and retain their exact resource owner', async () => {
  const { sqlite, db } = fixture()
  try {
    const metadata = {
      role: 'resourceSourceArchive',
      mediaType: 'application/vnd.apache.parquet',
      resourceReleaseId: 'release',
    }
    expect(await resolveManagedAssetOwnership(db, metadata)).toMatchObject({
      sourceReleaseId: null,
      resourceReleaseId: 'release',
    })
    await expect(
      resolveManagedAssetOwnership(db, { ...metadata, mediaType: 'application/zip' }),
    ).rejects.toThrow('require Parquet')
    await expect(
      resolveManagedAssetOwnership(db, { ...metadata, sourceReleaseId: 'source' }),
    ).rejects.toThrow('require Parquet')
    sqlite.run(
      "INSERT INTO assets(id,assetKey,role,resourceReleaseId) VALUES ('resource','resource.parquet','resourceSourceArchive','release')",
    )
    await expect(
      linkManagedSourceAssetToRelease(db, {
        assetKey: 'resource.parquet',
        resourceReleaseId: 'sibling',
      }),
    ).rejects.toThrow('different release')
    await expect(
      resolveManagedAssetOwnership(db, { ...metadata, role: 'sourceArchive' }),
    ).rejects.toThrow('Use releaseSourceArchive')
  } finally {
    sqlite.close()
  }
})

test('registration resolves original ownership and late manifests inherit it', async () => {
  const { sqlite, db } = fixture()
  try {
    expect(
      await resolveManagedAssetOwnership(db, {
        role: 'releaseSourceArchive',
        mediaType: 'application/zip',
        resourceReleaseId: 'release',
      }),
    ).toEqual({
      datasetId: 'dataset',
      sourceReleaseId: 'source',
      resourceReleaseId: null,
    })
    sqlite.run(
      "UPDATE assets SET sourceReleaseId='source',datasetId='dataset' WHERE id='archive'",
    )
    await linkSourceAssetManifest(db, 'manifest', {
      role: 'manifest',
      sourceAssetId: 'archive',
    })
    expect(
      await resolveManagedAssetOwnership(db, {
        role: 'manifest',
        mediaType: 'application/json',
        sourceAssetId: 'archive',
      }),
    ).toEqual({
      datasetId: 'dataset',
      sourceReleaseId: 'source',
      resourceReleaseId: null,
    })
  } finally {
    sqlite.close()
  }
})
