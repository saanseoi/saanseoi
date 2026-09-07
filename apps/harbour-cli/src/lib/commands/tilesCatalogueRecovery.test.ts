import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REGIONS } from './tilesConfig.ts'
import type { VersionEntry, VersionsIndex } from './tilesTypes.ts'
import {
  applyTilesCatalogueIntent,
  completeTilesCatalogueIntent,
  readTilesCatalogueIntent,
  writeTilesCatalogueIntent,
} from './tilesCatalogueRecovery.ts'

const entry: VersionEntry = {
  version: '2026-09-07',
  tileset: 'hk.pmtiles',
  key: 'hk/archive',
  manifestKey: 'hk/manifest',
  sha256: 'fixed',
  size: 42,
  createdAt: '2026-09-07T00:00:00Z',
}
const intent = {
  region: { code: 'hk' as const, ...REGIONS.hk },
  entry,
  promoteLatest: true,
  previousLatest: null,
}

test('catalogue publication resumes after its first global write and preserves unrelated regions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-catalogue-'))
  const path = join(root, 'pending.json')
  let index: VersionsIndex = {
    schemaVersion: 1,
    updatedAt: 'original',
    regions: { mo: { name: 'macau', versionsKey: 'mo/versions' } },
  }
  let regionsWritten = false
  try {
    await writeTilesCatalogueIntent(path, intent)
    await expect(
      completeTilesCatalogueIntent(path, async saved => {
        index = applyTilesCatalogueIntent(index, saved, 'hk/versions')
        throw new Error('second catalogue write interrupted')
      }),
    ).rejects.toThrow('interrupted')
    expect(await readTilesCatalogueIntent(path)).toEqual(intent)
    await completeTilesCatalogueIntent(path, async saved => {
      index = applyTilesCatalogueIntent(index, saved, 'hk/versions')
      regionsWritten = true
    })
    expect(regionsWritten).toBe(true)
    expect(index.regions.hk?.latest).toEqual(entry)
    expect(index.regions.mo).toEqual({ name: 'macau', versionsKey: 'mo/versions' })
    expect(await readTilesCatalogueIntent(path)).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('catalogue recovery rejects conflicting latest selections and corrupt intents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tiles-catalogue-conflict-'))
  const path = join(root, 'pending.json')
  try {
    const index: VersionsIndex = {
      schemaVersion: 1,
      updatedAt: 'later',
      regions: {
        hk: {
          name: 'hongkong',
          versionsKey: 'hk/versions',
          latest: { ...entry, version: '2026-09-08' },
        },
      },
    }
    expect(() => applyTilesCatalogueIntent(index, intent, 'hk/versions')).toThrow(
      'latest selection changed',
    )
    expect(
      applyTilesCatalogueIntent(
        index,
        { ...intent, promoteLatest: false },
        'hk/versions',
      ).regions.hk?.latest?.version,
    ).toBe('2026-09-08')
    await writeFile(
      path,
      JSON.stringify({ payload: JSON.stringify(intent), checksum: 'corrupt' }),
    )
    await expect(readTilesCatalogueIntent(path)).rejects.toThrow('checksum differs')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
