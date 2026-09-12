/** Compact storage codes. Unit and floor codes have independent vocabularies. */
export const address3dUnitTypes = [
  'F', // Flat or apartment.
  'R', // Room.
  'S', // Shop.
  'SU', // Suite.
  'U', // Unit.
  'ST', // Stall.
  'K', // Kiosk.
  'O', // Office.
  'X', // Other or unclassified unit type.
] as const
export const address3dFloorTypes = [
  'F', // Floor.
  'G', // Ground floor.
  'UG', // Upper ground floor.
  'LG', // Lower ground floor.
  'B', // Basement.
  'M', // Mezzanine.
  'C', // Concourse.
  'P', // Podium.
  'R', // Roof.
  'X', // Other or unclassified floor type.
] as const

export type Address3dUnit = {
  id: string
  unitRef: string
  unitType: (typeof address3dUnitTypes)[number]
  floorRef: string
  floorType: (typeof address3dFloorTypes)[number]
  unitPortion: string | null
}

export type Address3dUnitI18n = {
  unitExpression: string
  floorExpression: string
  /** Only store an override when expressions cannot reproduce the source form. */
  formattedAddressPart?: string
}

export type Address3dCoverage =
  | { kind: 'none' }
  | {
      kind: 'direct' | 'ancestor'
      ownerAddress2dId: string
      address3dId: string
      membership: 'established' | 'unresolved'
    }

export function formatAddress3dPart(value: Address3dUnitI18n, locale: string) {
  return (
    value.formattedAddressPart ??
    (locale === 'zh-hant'
      ? `${value.floorExpression}${value.unitExpression}`
      : [value.unitExpression, value.floorExpression].filter(Boolean).join(', '))
  )
}

export type Address3dCollectionMetadata = {
  id: string
  address2dId: string
  unresolvedSectionIds: string[]
}

/** The caller supplies metadata from the same selected snapshot. */
export function resolveAddress3dCoverage(
  address: { id: string; parentAddressId: string | null },
  collections: Address3dCollectionMetadata[],
): Address3dCoverage {
  const direct = collections.find(collection => collection.address2dId === address.id)
  if (direct)
    return {
      kind: 'direct',
      ownerAddress2dId: address.id,
      address3dId: direct.id,
      membership: 'established',
    }
  const ancestor = collections.find(
    collection =>
      collection.address2dId === address.parentAddressId &&
      collection.unresolvedSectionIds.includes(address.id),
  )
  return ancestor
    ? {
        kind: 'ancestor',
        ownerAddress2dId: ancestor.address2dId,
        address3dId: ancestor.id,
        membership: 'unresolved',
      }
    : { kind: 'none' }
}

export function validatePlaceAddress3dReference(args: {
  address: { id: string; parentAddressId: string | null }
  collection: Address3dCollectionMetadata & { units: Address3dUnit[] }
  unitId: string
  membership: 'established' | 'unresolved'
}) {
  const coverage = resolveAddress3dCoverage(args.address, [args.collection])
  if (
    coverage.kind === 'none' ||
    coverage.membership !== args.membership ||
    !args.collection.units.some(unit => unit.id === args.unitId)
  ) {
    throw new Error(
      'Place unit reference is inconsistent with the selected address collection and section coverage',
    )
  }
}
