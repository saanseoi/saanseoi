import { buildDeterministicUuidV5 } from '@repo/db'
import type { DatasetProcessingMessage } from '../../../types'
import {
  collectNames,
  overtureHongKongAreas,
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
} from './overtureHongKongAreas'
import { kowloonRestorationFixture } from './kowloonRestoration'

export const overtureHongKongCities = [
  {
    code: 'kowloon-city',
    id: kowloonRestorationFixture.divisionId,
    names: { en: 'Kowloon', 'zh-hant': '九龍', 'zh-hans': '九龙' },
    districtNames: overtureHongKongAreas[1].districtNames,
  },
  {
    code: 'hong-kong-city',
    id: buildDeterministicUuidV5(
      '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c',
      'saanseoi:hk:city:hong-kong',
    ),
    names: { en: 'Hong Kong', 'zh-hant': '香港', 'zh-hans': '香港' },
    districtNames: overtureHongKongAreas[0].districtNames.filter(
      name => name !== 'Southern District',
    ),
  },
] as const

export function missingOvertureHongKongCityRows(
  message: Pick<DatasetProcessingMessage, 'regionCode' | 'source' | 'resourceType'>,
  sourceRows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  if (
    message.regionCode !== 'hk' ||
    message.source !== 'overture' ||
    message.resourceType !== 'division'
  )
    return []
  return overtureHongKongCities.flatMap(city => {
    const existing = sourceRows.filter(
      row =>
        row.id === city.id ||
        (row.subtype === 'locality' &&
          row.class === 'city' &&
          collectNames(row.names).includes(city.names.en)),
    )
    if (existing.length > 1)
      throw new Error(`Ambiguous source city identity: ${city.names.en}.`)
    if (existing.length) return []
    const districtDivisionIds = city.districtNames.map(name => {
      const matches = sourceRows.filter(
        row => row.subtype === 'region' && collectNames(row.names).includes(name),
      )
      if (matches.length !== 1 || typeof matches[0]?.id !== 'string') {
        throw new Error(
          `Cannot reconstruct ${city.names.en}: expected one district named ${name}.`,
        )
      }
      return matches[0].id
    })
    return [
      {
        id: city.id,
        country: 'HK',
        theme: 'divisions',
        type: 'division',
        subtype: 'locality',
        class: 'city',
        geometry: null,
        parent_division_id: OVERTURE_HONG_KONG_SAR_DIVISION_ID,
        names: {
          primary: `${city.names['zh-hant']} ${city.names.en}`,
          common: Object.entries(city.names).map(([language, value]) => ({
            language,
            value,
          })),
        },
        hierarchies: districtDivisionIds.map((divisionId, index) => [
          {
            division_id: OVERTURE_HONG_KONG_SAR_DIVISION_ID,
            subtype: 'dependency',
            name: '香港 Hong Kong SAR',
          },
          {
            division_id: divisionId,
            subtype: 'region',
            name: city.districtNames[index],
          },
        ]),
        identifiers: {
          saanseoiCorrection: {
            code: city.code,
            districtDivisionIds,
            method: 'union-overture-district-areas',
          },
        },
        sources: [{ dataset: 'SaanSeoi city reconstruction', record_id: city.code }],
      },
    ]
  })
}
