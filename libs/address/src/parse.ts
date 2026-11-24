import { createAddressContent, type AddressContent } from './content.js'
import { parsePlaceAddress, type PlaceAddressMatcher } from './matcher.js'

export const ADDRESS_PARSER_VERSION = '0.2.3'
const floorTypes = {
  floor: 'F',
  ground_floor: 'G',
  upper_ground_floor: 'UG',
  lower_ground_floor: 'LG',
  basement: 'B',
  mezzanine: 'M',
  concourse: 'C',
  podium: 'P',
  roof: 'R',
  other: 'X',
} as const
const unitTypes = {
  flat: 'F',
  room: 'R',
  shop: 'S',
  suite: 'SU',
  unit: 'U',
  stall: 'ST',
  kiosk: 'K',
  office: 'O',
  other: 'X',
} as const
export type AddressParseResult = {
  content: AddressContent
  parserVersion: string
  source: Record<string, string>
  unresolved: Record<string, string>
  diagnostics: string[]
}
/** Propose structured content while retaining original text separately for review.
 * @param labels Localized source text. @param context Optional reviewed dictionaries.
 * @returns Schema-compatible content and unresolved evidence for human review.
 * @remarks No canonical identities are inferred. Ambiguous/conflicting units are not selected.
 */
export function parseAddressContent(
  labels: Record<string, string>,
  context?: Pick<
    PlaceAddressMatcher,
    'componentsByLongestName' | 'streetsByLongestName'
  >,
): AddressParseResult {
  const content = createAddressContent(labels)
  const unresolved: Record<string, string> = {},
    diagnostics: string[] = []
  let ambiguousUnits = false
  const units: {
    locale: string
    unit: NonNullable<AddressContent['unit']>
    floorExpression: string
    unitExpression: string
  }[] = []
  for (const [locale, text] of Object.entries(labels)) {
    const parsed = parsePlaceAddress(text, context)
    const translated = content.i18n[locale]!
    translated.formattedAddress = parsed.address2dText
    if (parsed.street) translated.streetName = parsed.street.name
    if (parsed.buildingNumberExpression)
      translated.buildingNumberExpression = parsed.buildingNumberExpression
    for (const part of parsed.recognised2dComponents) {
      const same = parsed.recognised2dComponents.filter(p => p.kind === part.kind)
      if (same.length === 1) translated[part.kind] = part.name
      else diagnostics.push(`${locale}: ambiguous ${part.kind}`)
    }
    if (parsed.unclassified2dText) unresolved[locale] = parsed.unclassified2dText
    const floors = parsed.address3dParts.filter(p => p.kind === 'floor')
    const foundUnits = parsed.address3dParts.filter(p => p.kind === 'unit')
    if (floors.length > 1 || foundUnits.length > 1) {
      ambiguousUnits = true
      diagnostics.push(`${locale}: multiple floors or units require review`)
    } else if (floors.length || foundUnits.length) {
      const floor = floors[0],
        unit = foundUnits[0]
      // Matcher references retain source prefixes; canonical references exclude the floor type.
      const floorType = floor ? floorTypes[floor.floorType] : 'X'
      const rawFloorRef = floor?.floorRef ?? ''
      const floorRef =
        !['F', 'X'].includes(floorType) && rawFloorRef.startsWith(floorType)
          ? rawFloorRef.slice(floorType.length)
          : rawFloorRef
      units.push({
        locale,
        unit: {
          floorRef,
          floorType,
          unitRef: unit?.unitRef ?? '',
          unitType: unit ? unitTypes[unit.unitType] : 'X',
          unitPortion: null,
        },
        floorExpression: floor?.floorExpression ?? '',
        unitExpression: unit?.unitExpression ?? '',
      })
    }
  }
  if (
    !ambiguousUnits &&
    units.length &&
    units.every(item => JSON.stringify(item.unit) === JSON.stringify(units[0]!.unit))
  ) {
    content.unit = units[0]!.unit
    for (const item of units)
      content.unitI18n[item.locale] = {
        floorExpression: item.floorExpression,
        unitExpression: item.unitExpression,
      }
  } else if (units.length)
    diagnostics.push('Conflicting multilingual floor/unit evidence requires review')
  // Keep all original unit text visible when the proposal cannot safely choose a unit.
  if (!content.unit) {
    for (const [locale, text] of Object.entries(labels))
      content.i18n[locale]!.formattedAddress = text
  }
  return {
    content,
    source: { ...labels },
    parserVersion: ADDRESS_PARSER_VERSION,
    unresolved,
    diagnostics,
  }
}
