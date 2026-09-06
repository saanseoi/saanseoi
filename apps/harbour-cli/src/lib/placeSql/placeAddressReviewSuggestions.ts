import {
  normaliseAddressText,
  type PlaceAddressDefinition,
} from './placeAddressMatcher.ts'

/** Review evidence only: never participates in automatic address assignment. */
export function suggestBuildingInitialVariants(
  buildingName: string,
  estateName: string,
  definitions: PlaceAddressDefinition[],
) {
  const normaliseBuilding = (value: string) =>
    normaliseAddressText(value).replace(/\bHSE\b/g, 'HOUSE')
  const source = normaliseBuilding(buildingName).split(' ')
  const estate = normaliseAddressText(estateName)
  if (!estate) return []
  return definitions.flatMap(definition => {
    if (
      definition.locale !== 'en' ||
      !definition.buildingName ||
      !definition.estateName ||
      normaliseAddressText(definition.estateName) !== estate
    )
      return []
    const target = normaliseBuilding(definition.buildingName).split(' ')
    if (target.length !== source.length) return []
    let differences = 0
    for (let index = 0; index < source.length; index++) {
      const a = source[index]!,
        b = target[index]!
      if (a === b) continue
      if (a.slice(1) !== b.slice(1) || !['LN', 'NL'].includes(a[0]! + b[0]!)) return []
      differences++
    }
    return differences === 1
      ? [
          {
            addressId: definition.addressId,
            sourceBuildingName: buildingName,
            canonicalBuildingName: definition.buildingName,
            estateName: definition.estateName,
            reason: 'same-estate-single-l-n-initial' as const,
            reviewRequired: true as const,
          },
        ]
      : []
  })
}
