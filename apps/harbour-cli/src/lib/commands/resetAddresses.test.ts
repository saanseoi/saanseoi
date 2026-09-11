import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  readBeforeImage,
  restoreBeforeImage,
  assertIdentityBeforeImageAvailable,
  resolveOwnedMaterialisedDivisionSnapshotIds,
  selectOwnedOfficialAddressApiReleaseSetIds,
  selectOwnedOfficialAddressSnapshotIds,
} from './resetAddresses.ts'

describe('official address reset ownership', () => {
  test('includes division projections created after the address baseline', () => {
    expect(
      resolveOwnedMaterialisedDivisionSnapshotIds(
        ['baseline', 'created-by-address-init-1', 'created-by-address-init-2'],
        ['baseline'],
      ),
    ).toEqual(['created-by-address-init-1', 'created-by-address-init-2'])
  })

  test('does not claim division projections that predate the address baseline', () => {
    expect(
      resolveOwnedMaterialisedDivisionSnapshotIds(
        ['baseline', 'unrelated-current-projection'],
        ['baseline', 'unrelated-current-projection'],
      ),
    ).toEqual([])
  })

  test('owns only snapshots that use an ALS release as their primary source', () => {
    expect(
      selectOwnedOfficialAddressSnapshotIds([
        { id: 'official-address', role: 'primary' },
        { id: 'derived-address', role: 'lookup' },
        { id: 'derived-place', role: 'lookup' },
        { id: 'official-address', role: 'primary' },
      ]),
    ).toEqual(['official-address'])
  })

  test('owns only Address API release sets', () => {
    expect(
      selectOwnedOfficialAddressApiReleaseSetIds([
        { id: 'addresses', familyType: 'addresses' },
        { id: 'places', familyType: 'places' },
        { id: 'addresses', familyType: 'addresses' },
      ]),
    ).toEqual(['addresses'])
  })
})

test('identity history backup stays outside the manifest and restores exact bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'address-before-image-'))
  try {
    const path = join(dir, 'history.json')
    const original = Buffer.alloc(9 * 1024 * 1024, 97)
    await writeFile(path, original)
    const image = await readBeforeImage(path, dir)
    expect(JSON.stringify(image).length).toBeLessThan(512)
    expect(image.contentBase64).toBeUndefined()
    await writeFile(path, 'changed')
    await assertIdentityBeforeImageAvailable(image)
    await restoreBeforeImage(path, image)
    expect((await readFile(path)).equals(original)).toBe(true)
    if (!image.backupPath) throw new Error('Expected separate backup')
    await rm(image.backupPath)
    await expect(assertIdentityBeforeImageAvailable(image)).rejects.toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('missing recovery before-image is rejected before reset can begin', async () => {
  await expect(assertIdentityBeforeImageAvailable({ exists: true })).rejects.toThrow(
    'before any database or asset changes',
  )
})
