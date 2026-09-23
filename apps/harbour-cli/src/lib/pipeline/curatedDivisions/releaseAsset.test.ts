import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import {
  linkCuratedReleaseAsset,
  prepareCuratedReleaseAsset,
  uploadCuratedReleaseAsset,
} from './releaseAsset'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true })))
})

test('asset links update both release rows atomically and cannot replace another archive', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`CREATE TABLE sourceReleases (id TEXT PRIMARY KEY, rawObjectKey TEXT, originalFileName TEXT);
      CREATE TABLE releases (id TEXT PRIMARY KEY, rawObjectKey TEXT, originalFileName TEXT);
      INSERT INTO sourceReleases (id) VALUES ('source');
      INSERT INTO releases (id) VALUES ('release');`)
    const input = {
      sourceReleaseId: 'source',
      releaseId: 'release',
      assetKey: 'archive',
      fileName: 'edition.zip',
    }
    linkCuratedReleaseAsset(db, input)
    for (const table of ['sourceReleases', 'releases'])
      expect(
        db.query(`SELECT rawObjectKey, originalFileName FROM ${table}`).get(),
      ).toEqual({ rawObjectKey: 'archive', originalFileName: 'edition.zip' })
    db.exec('UPDATE sourceReleases SET rawObjectKey=NULL, originalFileName=NULL')
    expect(() =>
      linkCuratedReleaseAsset(db, { ...input, assetKey: 'changed' }),
    ).toThrow('changed while retaining')
    expect(db.query('SELECT rawObjectKey FROM sourceReleases').get()).toEqual({
      rawObjectKey: null,
    })
    expect(db.query('SELECT rawObjectKey FROM releases').get()).toEqual({
      rawObjectKey: 'archive',
    })
  } finally {
    db.close()
  }
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'curated-asset-'))
  directories.push(directory)
  return {
    directory,
    datasetCode: 'ds-hk-saanseoi-division-area',
    releaseCode: 'dr-hk-saanseoi-division-area-2026-09-01.0',
    resourceType: 'divisionArea' as const,
    sourceVersion: '2026-09-01.0',
    provenance: { baseline: { publisher: 'overture', cohortKey: '2026-08-19.0' } },
    rows: [
      { id: 'area', geometry: { coordinates: [[[1.23456789, 2]]] }, snapshotId: 'old' },
    ],
  }
}

test('archive preserves geometry and provenance and is stable across snapshot replay', async () => {
  const input = await fixture()
  const first = await prepareCuratedReleaseAsset(input)
  const zip = unzipSync(await readFile(first.filePath))
  expect(JSON.parse(strFromU8(zip['records.json']!))).toEqual({
    rows: [{ id: 'area', geometry: input.rows[0]!.geometry }],
  })
  expect(JSON.parse(strFromU8(zip['manifest.json']!)).provenance).toEqual(
    input.provenance,
  )
  const replay = await prepareCuratedReleaseAsset({
    ...input,
    rows: [
      { ...input.rows[0], snapshotId: 'new', createdAt: 'today', updatedAt: 'today' },
    ],
  })
  expect(replay.assetKey).toBe(first.assetKey)
  expect(replay.contentHash).toBe(first.contentHash)
  const changed = await prepareCuratedReleaseAsset({
    ...input,
    rows: [{ id: 'changed' }],
  })
  expect(changed.assetKey).not.toBe(first.assetKey)
})

test('division archive retains multilingual names', async () => {
  const input = await fixture()
  const asset = await prepareCuratedReleaseAsset({
    ...input,
    resourceType: 'division',
    names: [{ divisionId: 'division', locale: 'zh-Hant', name: '香港' }],
  })
  const zip = unzipSync(await readFile(asset.filePath))
  expect(JSON.parse(strFromU8(zip['records.json']!)).names[0].name).toBe('香港')
})

test('upload verifies an existing edition, rejects changed bytes and propagates failures', async () => {
  const asset = await prepareCuratedReleaseAsset(await fixture())
  const target = { environment: 'dev' as const, remote: false }
  const release = {
    datasetId: 'dataset',
    releaseId: 'release',
    existingObjectKeys: [null],
  }
  let uploads = 0
  const upload: Parameters<typeof uploadCuratedReleaseAsset>[3] = async (
    actualTarget,
    input,
  ) => {
    uploads++
    expect(actualTarget).toBe(target)
    expect(input.metadata.releaseId).toBe('release')
    expect(input.metadata.contentHash).toBe(asset.contentHash)
    return { assetId: 'asset', url: 'asset-url' }
  }
  expect(await uploadCuratedReleaseAsset(target, asset, release, upload)).toBe(
    asset.assetKey,
  )
  await uploadCuratedReleaseAsset(
    target,
    asset,
    { ...release, existingObjectKeys: [asset.assetKey] },
    upload,
  )
  expect(uploads).toBe(2)
  await expect(
    uploadCuratedReleaseAsset(
      target,
      asset,
      { ...release, existingObjectKeys: ['different'] },
      upload,
    ),
  ).rejects.toThrow('new release version')
  expect(uploads).toBe(2)
  await expect(
    uploadCuratedReleaseAsset(target, asset, release, async () => {
      throw Error('upload failed')
    }),
  ).rejects.toThrow('upload failed')
})
