import { retainedLocalePropertyName } from './retainedProperties'
import { buildDeterministicUuidV5 } from '@repo/db'
import { createHash } from '../../utils'
import { publisherSourceHashInput } from './sourcePayload'

const premise = '/Address/PremisesAddress'

/** Explicit renames only. Values are never trimmed, formatted or corrected. */
export const alsSourcePropertyNames: Readonly<Record<string, string>> = Object.freeze({
  '/Easting': 'easting',
  '/Northing': 'northing',
  [`${premise}/GeoAddress`]: 'geoAddress',
  [`${premise}/BuildingCsuInformation/CsuId`]: 'hkgovCsuId',
  ...Object.fromEntries(
    (
      [
        ['Eng', 'en'],
        ['Chi', 'zhHant'],
      ] as const
    )
      .flatMap(([upstream, locale]) => {
        const base = `${premise}/${upstream}PremisesAddress`
        return [
          [`${base}/Region`, `${locale}Region`],
          [`${base}/${upstream}District`, `${locale}District`],
          [`${base}/BuildingName`, `${locale}BuildingName`],
          [`${base}/${upstream}3dAddress`, `${locale}3dAddress`],
          ...['PhaseName', 'PhaseNo'].map(field => [
            `${base}/${upstream}Estate/${upstream}Phase/${field}`,
            `${locale}${field}`,
          ]),
          ...(
            ['Street', 'Village', 'Estate', 'Block', 'Phase', 'Unit'] as const
          ).flatMap(section =>
            ({
              Street: ['StreetName', 'LocationName', 'BuildingNoFrom', 'BuildingNoTo'],
              Village: [
                'VillageName',
                'LocationName',
                'BuildingNoFrom',
                'BuildingNoTo',
              ],
              Estate: ['EstateName'],
              Block: [
                'BlockDescriptor',
                'BlockNo',
                'BlockDescriptorPrecedenceIndicator',
              ],
              Phase: ['PhaseName', 'PhaseNo'],
              Unit: ['UnitDescriptor', 'UnitNo'],
            })[section].map(field => [
              `${base}/${upstream}${section}/${field}`,
              `${locale}${field === 'BuildingNoFrom' ? `${section}NumberFrom` : field === 'BuildingNoTo' ? `${section}NumberTo` : field === 'LocationName' ? `${section}LocationName` : field}`,
            ]),
          ),
        ]
      })
      .map(([path, name]) => [path!, retainedLocalePropertyName(name!)]),
  ),
})

export function alsSourcePropertyName(path: string) {
  if (alsSourcePropertyNames[path]) return alsSourcePropertyNames[path]
  const words = path
    .split('/')
    .slice(1)
    .flatMap(
      part =>
        part
          .replaceAll('~1', '/')
          .replaceAll('~0', '~')
          .match(/[\p{L}\p{N}]+/gu) ?? [],
    )
  if (!words.length)
    throw new Error(`ALS property requires an explicit mapping: ${path}`)
  return words
    .map((word, index) =>
      index
        ? word[0]!.toUpperCase() + word.slice(1)
        : word[0]!.toLowerCase() + word.slice(1),
    )
    .join('')
}

/** Offline storage mapping: retain values and reject ambiguous field collisions. */
export function remapAlsSourceProperties(raw: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(raw)) {
    const key = name.startsWith('/')
      ? alsSourcePropertyName(name)
      : retainedLocalePropertyName(name)
    if (Object.hasOwn(mapped, key))
      throw new Error(`Duplicate ALS source property mapping: ${key}`)
    mapped[key] = value
  }
  return mapped
}

/**
 * Flat source values with camel-case names for unmapped attributes.
 * Arrays, explicit nulls and empty objects retain their upstream representation.
 * The fallback preserves newly introduced publisher fields without inventing a
 * meaning for them or silently dropping them.
 */
export function alsSourcePayload(feature: {
  properties?: unknown
  geometry?: unknown
}) {
  const properties: Record<string, unknown> = {}
  const visit = (value: unknown, path: string) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length
    ) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)
      }
      return
    }
    const key = alsSourcePropertyName(path)
    if (Object.hasOwn(properties, key))
      throw new Error(`Duplicate ALS source property mapping: ${key}`)
    properties[key] = structuredClone(value)
  }
  if (feature.properties != null) {
    if (typeof feature.properties !== 'object' || Array.isArray(feature.properties)) {
      throw new Error('ALS feature properties must be an object or null.')
    }
    for (const [key, value] of Object.entries(feature.properties)) {
      visit(value, `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)
    }
  }
  return {
    properties: feature.properties == null ? null : properties,
    sourceGeometry: structuredClone(feature.geometry ?? null),
  }
}

export type Als3dSourceUnit = {
  floorNum?: number | string | null
  floorDescription?: string | null
  unitNo?: number | string | null
  unitDescriptor?: string | null
}

export type Als3dSourceProperties = {
  address3dEn?: Als3dSourceUnit[] | null
  address3dZhHant?: Als3dSourceUnit[] | null
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

function compactAls3dUnits(value: unknown, prefix: 'Chi' | 'Eng') {
  if (!Array.isArray(value)) return structuredClone(value)
  return value.map(row => {
    const source = record(row) ?? {}
    const floor = record(source[`${prefix}Floor`]) ?? {}
    const unit = record(source[`${prefix}Unit`]) ?? {}
    return {
      ...(Object.hasOwn(floor, 'FloorNum') ? { floorNum: floor.FloorNum } : {}),
      ...(Object.hasOwn(floor, 'FloorDescription')
        ? { floorDescription: floor.FloorDescription }
        : {}),
      ...(Object.hasOwn(unit, 'UnitNo') ? { unitNo: unit.UnitNo } : {}),
      ...(Object.hasOwn(unit, 'UnitDescriptor')
        ? { unitDescriptor: unit.UnitDescriptor }
        : {}),
    }
  })
}

/**
 * The 3D delivery contributes only its unit inventory. Its matching 2D source
 * record retains the shared premises fields and publisher identifiers.
 */
export function als3dSourcePayload(feature: {
  properties?: unknown
  geometry?: unknown
}) {
  const properties = record(feature.properties)
  const address = record(properties?.Address)
  const premises = record(address?.PremisesAddress)
  const en = record(premises?.EngPremisesAddress)
  const zhHant = record(premises?.ChiPremisesAddress)
  const output: Als3dSourceProperties = {}
  if (en && Object.hasOwn(en, 'Eng3dAddress'))
    output.address3dEn = compactAls3dUnits(en.Eng3dAddress, 'Eng') as
      | Als3dSourceUnit[]
      | null
  if (zhHant && Object.hasOwn(zhHant, 'Chi3dAddress'))
    output.address3dZhHant = compactAls3dUnits(zhHant.Chi3dAddress, 'Chi') as
      | Als3dSourceUnit[]
      | null
  return {
    properties: output,
    sourceGeometry: structuredClone(feature.geometry ?? null),
  }
}

export type AlsPublisherSource = ReturnType<typeof alsSourcePayload> & {
  sourceRecordId: string
  versionHash: string
  sources: Array<{
    dataset: string
    sourceFile: string
    featureIndexOneBased: number
    sourceVersion: string
  }>
}

/** Capture the complete upstream collection before any canonical curation. */
export async function captureAlsPublisherSources(
  features: Array<{
    feature: Parameters<typeof alsSourcePayload>[0]
    sourceFile: string
    featureIndexOneBased: number
  }>,
  sourceVersion: string,
) {
  const occurrences = new Map<string, number>()
  const result = new Map<string, AlsPublisherSource>()
  for (const input of features) {
    const payload = alsSourcePayload(input.feature)
    const nativeKey = JSON.stringify([
      input.sourceFile,
      payload.properties?.hkgovCsuId ?? null,
      payload.properties?.geoAddress ?? null,
    ])
    const occurrence = (occurrences.get(nativeKey) ?? 0) + 1
    occurrences.set(nativeKey, occurrence)
    result.set(alsSourceLocator(input), {
      ...payload,
      sourceRecordId: buildDeterministicUuidV5(
        '1d778e6c-54ba-5c7c-945e-18e9ad885e6a',
        JSON.stringify([nativeKey, occurrence]),
      ),
      versionHash: await createHash(publisherSourceHashInput(payload)),
      sources: [
        {
          dataset: 'hkgov-dpo-als-2d',
          sourceFile: input.sourceFile,
          featureIndexOneBased: input.featureIndexOneBased,
          sourceVersion,
        },
      ],
    })
  }
  return result
}

export function alsSourceLocator(input: {
  sourceFile: string
  featureIndexOneBased: number
}) {
  return JSON.stringify([input.sourceFile, input.featureIndexOneBased])
}

/** Prepared rows carry source evidence explicitly; never infer it from enriched fields. */
export function readAlsPublisherSource(
  row: Record<string, unknown>,
): AlsPublisherSource | null {
  if (row.publisherSource == null) return null
  const value =
    typeof row.publisherSource === 'string'
      ? JSON.parse(row.publisherSource)
      : row.publisherSource
  if (value === null) return null
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.sourceRecordId !== 'string' ||
    typeof value.versionHash !== 'string' ||
    !Array.isArray(value.sources) ||
    !Object.hasOwn(value, 'properties') ||
    !Object.hasOwn(value, 'sourceGeometry')
  ) {
    throw new Error('Invalid ALS publisher source envelope; prepare the release again.')
  }
  return value as AlsPublisherSource
}
