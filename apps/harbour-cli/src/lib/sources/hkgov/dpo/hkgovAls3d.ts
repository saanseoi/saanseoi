import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { buildDeterministicUuidV5 } from '@repo/db'
import type { Address3dUnit, Address3dUnitI18n } from '@repo/db/address3d'

const UNIT_NAMESPACE = '02d7be43-4f84-50b1-8eee-1945163ff10a'
export const ADDRESS3D_ROW_BYTE_BUDGET = 1_000_000

type SourceUnit = {
  EngFloor?: { FloorNum?: string | number; FloorDescription?: string }
  ChiFloor?: { FloorNum?: string | number; FloorDescription?: string }
  EngUnit?: { UnitNo?: string | number; UnitDescriptor?: string }
  ChiUnit?: { UnitNo?: string | number; UnitDescriptor?: string }
}
export type Als3dLocale = {
  BuildingName?: string
  EngDistrict?: string
  ChiDistrict?: string
  EngEstate?: { EstateName?: string }
  ChiEstate?: { EstateName?: string }
  EngBlock?: {
    BlockNo?: string
    BlockDescriptor?: string
    BlockDescriptorPrecedenceIndicator?: string
  }
  ChiBlock?: { BlockNo?: string; BlockDescriptor?: string }
  EngStreet?: { StreetName?: string; BuildingNoFrom?: string; BuildingNoTo?: string }
  ChiStreet?: { StreetName?: string; BuildingNoFrom?: string; BuildingNoTo?: string }
  Eng3dAddress?: SourceUnit[]
  Chi3dAddress?: SourceUnit[]
}
export type Als3dFeature = {
  geometry: { type: string; coordinates: number[] }
  properties: {
    Address: {
      PremisesAddress: {
        BuildingCsuInformation?: { CsuId?: string }
        EngPremisesAddress?: Als3dLocale
        ChiPremisesAddress?: Als3dLocale
      }
    }
  }
}

/** ALS deliveries use one indented feature per block; reject other layouts. */
export async function* readAls3dFeatures(path: string) {
  let lines: string[] | null = null
  let count = 0
  for await (const line of createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  })) {
    if (line === '    {') {
      if (lines) throw new Error(`Nested feature boundary in ${path}`)
      lines = []
    }
    if (!lines) continue
    lines.push(line)
    if (line !== '    },' && line !== '    }') continue
    const feature = JSON.parse(lines.join('\n').replace(/,$/, '')) as Als3dFeature
    if (!feature.properties?.Address?.PremisesAddress)
      throw new Error(`Invalid ALS feature in ${path}`)
    yield { feature, featureIndexOneBased: ++count }
    lines = null
  }
  if (lines || !count)
    throw new Error(`Incomplete or unsupported ALS GeoJSON layout: ${path}`)
}

const token = (value: unknown) => (value == null ? '' : String(value).trim())
export const als3dHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Identity is scoped to the enduring physical building, never its collection owner. */
export function normaliseAls3dInventory(
  feature: Als3dFeature,
  physicalBuildingId: string,
) {
  const premise = feature.properties.Address.PremisesAddress
  const en = premise.EngPremisesAddress?.Eng3dAddress ?? []
  const zh = premise.ChiPremisesAddress?.Chi3dAddress ?? []
  const units = new Map<string, Address3dUnit>()
  const locales: Record<string, Record<string, Address3dUnitI18n>> = {
    en: {},
    'zh-hant': {},
  }
  for (const [locale, input, prefix] of [
    ['en', en, 'Eng'],
    ['zh-hant', zh, 'Chi'],
  ] as const) {
    for (const row of input) {
      const floor = row[`${prefix}Floor`]
      const unit = row[`${prefix}Unit`]
      const floorExpression = token(floor?.FloorDescription)
      const describedFloor =
        locale === 'en'
          ? floorExpression.match(/^(.+)\/F$/)?.[1]
          : floorExpression.match(/^(.+)樓$/)?.[1]
      const floorRef = token(floor?.FloorNum) || token(describedFloor)
      const unitRef = token(unit?.UnitNo)
      if (!floorRef || !unitRef)
        throw new Error(`Missing floor/unit token in ${physicalBuildingId}`)
      const descriptor = token(unit?.UnitDescriptor)
      if (descriptor !== (locale === 'en' ? 'FLAT' : '室')) {
        throw new Error(
          `Review unfamiliar ALS unit descriptor ${descriptor} in ${physicalBuildingId}`,
        )
      }
      const floorType = floorRef === 'G' ? 'G' : 'F'
      const id = buildDeterministicUuidV5(
        UNIT_NAMESPACE,
        JSON.stringify([physicalBuildingId, floorRef, unitRef, 'F', floorType]),
      )
      const localised = {
        unitExpression:
          locale === 'en' ? `${descriptor} ${unitRef}` : `${unitRef}${descriptor}`,
        floorExpression,
      }
      const output = locales[locale]
      if (!output) throw new Error(`Unsupported locale ${locale}`)
      if (output[id])
        throw new Error(
          `Duplicate floor/unit ${floorRef}/${unitRef} in ${physicalBuildingId}`,
        )
      output[id] = localised
      units.set(id, {
        id,
        unitRef,
        unitType: 'F',
        floorRef,
        floorType,
        unitPortion: null,
      })
    }
  }
  const enIds = Object.keys(locales.en ?? {}).sort()
  const zhIds = Object.keys(locales['zh-hant'] ?? {}).sort()
  if (JSON.stringify(enIds) !== JSON.stringify(zhIds)) {
    throw new Error(`Unpaired ALS unit inventories in ${physicalBuildingId}`)
  }
  const sortedUnits = [...units.values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const locale of Object.keys(locales)) {
    locales[locale] = Object.fromEntries(
      Object.entries(locales[locale] ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    )
  }
  const inventory = { units: sortedUnits, locales }
  return {
    ...inventory,
    contentHash: als3dHash(inventory),
    unitCount: sortedUnits.length,
  }
}

export function assertAddress3dRowBudget(row: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8')
  if (bytes > ADDRESS3D_ROW_BYTE_BUDGET)
    throw new Error(
      `Address3D row requires review: ${bytes} bytes exceeds ${ADDRESS3D_ROW_BYTE_BUDGET}`,
    )
  return bytes
}
