import { expect, test } from 'bun:test'
import { applyAlsDivisionMembership } from './hkgovAlsDivisionMembership'
import { createDivisionMembership } from '../../../pipeline/divisions/divisionMembership'
import type { DivisionLookupMaps, PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'

test('ALS points without publisher coordinates retain text-based Division membership', () => {
  const district = { id: 'north', name: 'North District', class: 'district' }
  const membership = createDivisionMembership(
    [
      district,
      {
        id: 'wo-hop-shek',
        name: 'WO HOP SHEK VILLAGE',
        locale: 'en',
        class: 'village',
        hierarchies: { full: [[district]] },
      },
    ],
    [],
  )
  // December 2024 publisher CSU 3359638359T20050430 has this geometry.
  const row = {
    geometry: JSON.stringify({ type: 'Point' }),
    enVillageName: 'WO HOP SHEK VILLAGE',
    districtId: 'north',
    sources: '{}',
  } as PreparedHkgovAlsRow
  applyAlsDivisionMembership([row], {
    snapshotId: 'divisions',
    membership,
  } as DivisionLookupMaps)
  expect(row.districtId).toBe('north')
  expect(row.villageId).toBe('wo-hop-shek')
  expect(JSON.parse(row.geometry!)).toEqual({ type: 'Point' })
  expect(JSON.parse(row.sources).divisionAssociation.evidence).toContainEqual({
    divisionId: 'wo-hop-shek',
    method: 'text',
  })
})

test('final ALS coordinate corrections, structured village names and islands reach persisted address fields', () => {
  const country = { id: 'country', name: 'China', class: 'country' }
  const district = { id: 'district', name: 'District', class: 'district' }
  const town = { id: 'town', name: 'Town', class: 'town' }
  const membership = createDivisionMembership(
    [
      { ...country, hierarchies: { full: [[country]] } },
      { ...district, hierarchies: { full: [[country, district]] } },
      { ...town, hierarchies: { full: [[country, district, town]] } },
      {
        id: 'village',
        name: '村',
        locale: 'zh-hant',
        class: 'village',
        hierarchies: { full: [[country, district, town]] },
      },
      { id: 'island', class: 'major_island', hierarchies: { full: [[country]] } },
    ],
    ['town', 'island'].map(divisionId => ({
      divisionId,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 23],
            [114, 22],
          ],
        ],
      },
    })),
  )
  const row = {
    id: 'address',
    canonicalId: 'address',
    divisionSnapshotId: 'divisions',
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.5, 22.5] }),
    enFormattedAddress: 'Example',
    zhHantVillageName: '村',
    districtId: 'district',
    countryId: 'country',
    sources: JSON.stringify({ hkgovAls: { sourceFile: 'original.geojson' } }),
  } as PreparedHkgovAlsRow
  applyAlsDivisionMembership([row], {
    snapshotId: 'divisions',
    areaSnapshotId: 'areas',
    membership,
  } as DivisionLookupMaps)
  expect(row).toMatchObject({
    townId: 'town',
    villageId: 'village',
    islandId: 'island',
  })
  expect(normaliseAddressRowForPipeline(row).base).toMatchObject({
    townId: 'town',
    villageId: 'village',
    islandId: 'island',
  })
  expect(JSON.parse(row.sources)).toMatchObject({
    hkgovAls: { sourceFile: 'original.geojson' },
    divisionAssociation: {
      divisionAreaSnapshotId: 'areas',
      evidence: expect.arrayContaining([
        { divisionId: 'village', method: 'text' },
        { divisionId: 'island', method: 'geometry' },
      ]),
    },
  })
})
