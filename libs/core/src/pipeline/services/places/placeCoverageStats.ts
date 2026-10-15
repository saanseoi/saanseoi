import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import type { NormalisedPlace } from './place'

/** Canonical fields only: source payloads and alternate categories are not counts. */
export type PlaceCoverageInput = Pick<
  NormalisedPlace,
  | 'basicCategory'
  | 'taxonomyPrimary'
  | 'operatingStatus'
  | 'websites'
  | 'socials'
  | 'emails'
  | 'phones'
  | 'identifiers'
  | 'confidence'
> & {
  addresses: unknown
  districtId?: string | null
  areaId?: string | null
  address2dId?: string | null
  address3dId?: string | null
  divisionLinked: boolean
}

export const placeCoverageFields = [
  'basicCategory',
  'taxonomyPrimary',
  'operatingStatus',
  'website',
  'social',
  'email',
  'phone',
  'anyContact',
  'brandIdentity',
  'publisherAddress',
  'linkedAddress',
  'linkedAddress3d',
  'division',
  'area',
  'district',
  'confidence',
] as const
type CoverageField = (typeof placeCoverageFields)[number]
export type PlaceCoverageAccumulator = {
  total: number
  fields: Map<CoverageField, number>
  distributions: Map<string, Map<string, number>>
}

export function createPlaceCoverageAccumulator(): PlaceCoverageAccumulator {
  return { total: 0, fields: new Map(), distributions: new Map() }
}

const text = (value: string | null | undefined) => Boolean(value?.trim())
// Do not count empty strings, empty arrays or empty contact objects as coverage.
function populated(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.some(populated)
  if (value && typeof value === 'object') return Object.values(value).some(populated)
  return false
}

export function addPlaceCoverage(
  accumulator: PlaceCoverageAccumulator,
  place: PlaceCoverageInput,
) {
  accumulator.total += 1
  const website = populated(place.websites)
  const social = populated(place.socials)
  const email = populated(place.emails)
  const phone = populated(place.phones)
  const available: Record<CoverageField, boolean> = {
    basicCategory: text(place.basicCategory),
    taxonomyPrimary: text(place.taxonomyPrimary),
    operatingStatus: text(place.operatingStatus),
    website,
    social,
    email,
    phone,
    anyContact: website || social || email || phone,
    brandIdentity: text(place.identifiers?.wikidata.brandId),
    publisherAddress: populated(place.addresses),
    linkedAddress: text(place.address2dId) || text(place.address3dId),
    linkedAddress3d: text(place.address3dId),
    division: place.divisionLinked,
    area: text(place.areaId),
    district: text(place.districtId),
    confidence: place.confidence !== null && Number.isFinite(place.confidence),
  }
  for (const field of placeCoverageFields) {
    if (available[field])
      accumulator.fields.set(field, (accumulator.fields.get(field) ?? 0) + 1)
  }
  const increment = (dimension: string, value: string) => {
    const group = accumulator.distributions.get(dimension) ?? new Map<string, number>()
    group.set(value, (group.get(value) ?? 0) + 1)
    accumulator.distributions.set(dimension, group)
  }
  for (const dimension of [
    'basicCategory',
    'taxonomyPrimary',
    'operatingStatus',
  ] as const)
    increment(dimension, place[dimension]?.trim() || 'unspecified')
  // One resolved scalar district per place; ambiguous/unmatched membership stays null.
  if (text(place.districtId)) increment('district', place.districtId!)
}

export function buildPlaceCoverageStatsRows(
  accumulator: PlaceCoverageAccumulator,
  timestamp = new Date().toISOString(),
): ReleaseScopedStatsRow[] {
  const row = (
    category: string,
    measure: string,
    dimension: string,
    dimensionValue: string,
    value: number,
  ): ReleaseScopedStatsRow => ({
    category,
    measure,
    unit: measure === 'coverage' ? 'percentage' : 'count',
    dimension,
    dimensionValue,
    value,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return [
    ...[...accumulator.distributions].flatMap(([dimension, counts]) =>
      [...counts]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([value, count]) => row('records', 'count', dimension, value, count)),
    ),
    ...placeCoverageFields.flatMap(field => {
      const count = accumulator.fields.get(field) ?? 0
      return [
        row('completeness', 'count', 'placeField', field, count),
        row(
          'completeness',
          'missing_count',
          'placeField',
          field,
          accumulator.total - count,
        ),
        row(
          'completeness',
          'coverage',
          'placeField',
          field,
          accumulator.total
            ? Number(((count / accumulator.total) * 100).toFixed(2))
            : 0,
        ),
      ]
    }),
  ]
}
