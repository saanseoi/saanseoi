import { buildDeterministicUuidV5 } from './versioning'

/** Canonical address IDs carry the SaanSeoi prefix; source IDs do not use this helper. */
export function canonicalAddressId(id: string): string {
  if (!id || id.trim() !== id)
    throw new Error('Address identity must be non-empty and trimmed.')
  return id.startsWith('ss-') ? id : `ss-${id}`
}

const COLLECTION_NAMESPACE = '72a46f2d-4110-5ce2-b94b-1ed9320ab83e'

/** Preserve the existing ALS seed while making parent prefix formatting immaterial. */
export function address3dCollectionId(address2dId: string): string {
  return canonicalAddressId(
    buildDeterministicUuidV5(COLLECTION_NAMESPACE, canonicalAddressId(address2dId)),
  )
}
