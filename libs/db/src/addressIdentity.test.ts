import { expect, test } from 'bun:test'
import { address3dCollectionId, canonicalAddressId } from './addressIdentity'
import { buildDeterministicUuidV5 } from './versioning'

test('canonical address formatting preserves identity and is idempotent', () => {
  for (const id of ['6a9d2e03-8de0-59ad-b5b2-77e194aa1cc9', 'opa-abc']) {
    expect(canonicalAddressId(id)).toBe(`ss-${id}`)
    expect(canonicalAddressId(canonicalAddressId(id))).toBe(`ss-${id}`)
  }
  expect(() => canonicalAddressId('')).toThrow()
})

test('3D collection identity retains the existing UUID and ignores parent prefix formatting', () => {
  const parent = '6a9d2e03-8de0-59ad-b5b2-77e194aa1cc9'
  const existing = buildDeterministicUuidV5(
    '72a46f2d-4110-5ce2-b94b-1ed9320ab83e',
    `ss-${parent}`,
  )
  expect(address3dCollectionId(parent)).toBe(`ss-${existing}`)
  expect(address3dCollectionId(`ss-${parent}`)).toBe(`ss-${existing}`)
  expect(address3dCollectionId('another-parent')).not.toBe(`ss-${existing}`)
})
