import { divisionCartography } from './divisionTaxonomy'

export type DivisionCartography = {
  minZoom: number
  maxZoom: number
  prominence: number
}

/** Native domains retain their classifications; these are label policies, not taxonomy mappings. */
export const nativeDivisionCartography = {
  'planning-newtown': [10, 80, 15],
  'planning-ppu': [10, 75, 15],
  'planning-spu': [12, 65, 16],
  'planning-tpu': [14, 55, 18],
  'planning-subunit': [16, 40, 19],
  'housing-market-area': [13, 60, 18],
} as const

/** PLACE_TYPE values within LandsD's selected Settlement class. */
export const landsdSettlementCartography = {
  Town: divisionCartography.town,
  Area: divisionCartography.macrohood,
  Village: divisionCartography.village,
} as const

export function materialiseDivisionCartography(
  classification: string,
  publisher?: 'hkgov-landsd',
): DivisionCartography {
  const policies: Record<string, readonly [number, number, number]> =
    publisher === 'hkgov-landsd'
      ? landsdSettlementCartography
      : { ...divisionCartography, ...nativeDivisionCartography }
  if (!Object.hasOwn(policies, classification))
    throw new Error(
      `Missing cartography policy for ${publisher ?? 'division'} class ${classification}`,
    )
  const [minZoom, prominence, maxZoom] = policies[classification]!
  return { minZoom, maxZoom, prominence }
}

/** Retained bulk audit choices, generated from the policies executed by ingestion. */
export function divisionCartographyBranches(): import('./divisionClassificationBranches').RuleBranch[] {
  return [
    ...Object.entries({ ...divisionCartography, ...nativeDivisionCartography }).map(
      ([klass, policy], index) => ({
        id: `cartography.class.${klass}`,
        group: 'Cartography',
        precedence: index + 1,
        condition: { field: 'class', equals: klass },
        result: cartographyDescription({
          minZoom: policy[0],
          maxZoom: policy[2],
          prominence: policy[1],
        }),
      }),
    ),
    ...Object.entries(landsdSettlementCartography).map(([klass, policy], index) => ({
      id: `cartography.landsd.${klass}`,
      group: 'Cartography: LandsD PLACE_TYPE',
      precedence: index + 1,
      condition: { field: 'PLACE_TYPE', equals: klass },
      result: cartographyDescription({
        minZoom: policy[0],
        maxZoom: policy[2],
        prominence: policy[1],
      }),
    })),
  ]
}

export function cartographyDescription(value: DivisionCartography): string {
  return `minZoom: ${value.minZoom}, maxZoom: ${value.maxZoom}, prominence: ${value.prominence}`
}
