/** Shared address scope vocabulary; independent of unit type and verification. */
export { ADDRESS_GRANULARITIES as addressGranularities } from '@saanseoi/address/content'
import type { ADDRESS_GRANULARITIES } from '@saanseoi/address/content'
export type AddressGranularity = (typeof ADDRESS_GRANULARITIES)[number]
