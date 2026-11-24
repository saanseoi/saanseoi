/** Shared address scope vocabulary; independent of unit type and verification. */
export { ADDRESS_SCOPES as addressScopes } from '@saanseoi/address/content'
export { premisesTypes as addressPremisesTypes } from './premises'
import type { ADDRESS_SCOPES } from '@saanseoi/address/content'
import type { premisesTypes } from './premises'
export type AddressScope = (typeof ADDRESS_SCOPES)[number]
export type AddressPremisesType = (typeof premisesTypes)[number]

export { premisesKinds as addressPremisesKinds } from './premises'
import type { premisesKinds } from './premises'
export type AddressPremisesKind = (typeof premisesKinds)[number]
