import { buildDeterministicUuidV5 } from '@repo/db'

import type { DatasetProcessingMessage } from '../../types'

const CANONICAL_DIVISION_ID_NAMESPACE = '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c'
const HONG_KONG_SAR_DIVISION_ID = 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'
const PRC_DIVISION_ID = 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be'

export const overtureHongKongAreas = [
  {
    censtatdCode: 'HK',
    code: 'hong-kong-island',
    districtNames: [
      'Central and Western District',
      'Wan Chai District',
      'Eastern District',
      'Southern District',
    ],
    names: { en: 'Hong Kong Island', 'zh-hans': '香港岛', 'zh-hant': '香港島' },
  },
  {
    censtatdCode: 'KLN',
    code: 'kowloon',
    districtNames: [
      'Yau Tsim Mong District',
      'Sham Shui Po District',
      'Kowloon City District',
      'Wong Tai Sin District',
      'Kwun Tong District',
    ],
    names: { en: 'Kowloon', 'zh-hans': '九龙', 'zh-hant': '九龍' },
  },
  {
    censtatdCode: 'NT',
    code: 'new-territories',
    districtNames: [
      'Kwai Tsing District',
      'Tsuen Wan District',
      'Tuen Mun District',
      'Yuen Long District',
      'North District',
      'Tai Po District',
      'Sha Tin District',
      'Sai Kung District',
      'Islands District',
    ],
    names: { en: 'New Territories', 'zh-hans': '新界', 'zh-hant': '新界' },
  },
] as const

export type OvertureHongKongArea = (typeof overtureHongKongAreas)[number]

export function overtureHongKongAreaDivisionId(code: string) {
  const area = overtureHongKongAreas.find(candidate => candidate.code === code)
  if (!area) return null
  return buildDeterministicUuidV5(
    CANONICAL_DIVISION_ID_NAMESPACE,
    `overture:hk:area:${area.code}`,
  )
}

export function overtureHongKongAreaForCenstatdCode(code: string) {
  return (
    overtureHongKongAreas.find(candidate => candidate.censtatdCode === code) ?? null
  )
}

export function missingOvertureHongKongAreaRows(
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'type'>,
  sourceRows: readonly Record<string, unknown>[],
) {
  if (
    message.source !== 'overture' ||
    message.type !== 'division' ||
    message.regionCode !== 'hk'
  ) {
    return []
  }

  const sourceAreaNames = new Set(
    sourceRows.flatMap(row => collectNames(row.names)).map(name => name.toLowerCase()),
  )
  return overtureHongKongAreas
    .filter(area => !sourceAreaNames.has(area.names.en.toLowerCase()))
    .map(area => {
      const districtIds = area.districtNames.map(name => {
        const division = sourceRows.find(row =>
          collectNames(row.names).some(candidate => candidate === name),
        )
        const id = typeof division?.id === 'string' ? division.id : null
        if (!id) {
          throw new Error(
            `Cannot synthesise ${area.names.en}: Overture does not contain ${name}.`,
          )
        }
        return id
      })
      const id = overtureHongKongAreaDivisionId(area.code)
      if (!id) throw new Error(`No canonical ID configured for ${area.code}.`)
      return {
        country: 'HK',
        geometry: null,
        hierarchies: [
          [
            { division_id: PRC_DIVISION_ID, name: 'China', subtype: 'country' },
            {
              division_id: HONG_KONG_SAR_DIVISION_ID,
              name: 'Hong Kong SAR',
              subtype: 'dependency',
            },
            {
              division_id: id,
              name: area.names.en,
              subtype: 'locality',
            },
          ],
        ],
        id,
        identifiers: {
          saanseoiCorrection: {
            code: area.code,
            districtDivisionIds: districtIds,
            method: 'union-overture-district-areas',
          },
        },
        names: {
          common: [
            { language: 'en', value: area.names.en },
            { language: 'zh-Hant', value: area.names['zh-hant'] },
            { language: 'zh-Hans', value: area.names['zh-hans'] },
          ],
          primary: area.names.en,
        },
        parent_division_id: HONG_KONG_SAR_DIVISION_ID,
        sources: [
          {
            dataset: 'SaanSeoi corrective processing',
            property: 'synthetic:missing-overture-hong-kong-area',
            record_id: `overture:hk:area:${area.code}`,
          },
        ],
        subtype: 'locality',
        type: 'division',
      }
    })
}

function collectNames(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(collectNames)
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const ownValue = typeof record.value === 'string' ? [record.value] : []
  return [...ownValue, ...Object.values(record).flatMap(collectNames)]
}
