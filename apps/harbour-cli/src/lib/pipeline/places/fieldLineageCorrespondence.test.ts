import { expect, test } from 'bun:test'
import {
  hashPlaceMaterialisation,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import { placePreparedSpecification } from '../../../../../../libs/db/src/fieldLineagePlacePreparation'

test('Place lineage preserves publisher bbox and separates locale content from materialised base hash', async () => {
  const place = normaliseOverturePlace(
    {
      id: 'place',
      geometry: { type: 'Point', coordinates: [114, 22] },
      bbox: [113, 21, 115, 23],
      names: { primary: 'Example' },
      taxonomy: { primary: 'restaurant', alternates: ['cafe'] },
      categories: { primary: 'shop', alternate: ['bakery'] },
    },
    '2026-09-23.0',
  )!
  expect(place.taxonomyPrimary).toBe('restaurant')
  expect(place.taxonomyAlternates).toEqual(['bakery'])
  expect(place.bbox).toEqual([113, 21, 115, 23])
  expect(place.i18n.every(row => row.accessHint === undefined)).toBe(true)
  expect(place.firstSeenMonth).toBe('2026-09')
  const references = {
    addressSnapshotId: 'address',
    divisionSnapshotId: 'division',
    addressId: null,
    divisionIds: ['b', 'a', 'a'],
    effectiveLng: 0,
    effectiveLat: 0,
  }
  const hash = await hashPlaceMaterialisation(place, references)
  expect(
    await hashPlaceMaterialisation(
      {
        ...place,
        firstSeenMonth: '2020-01',
        i18n: [],
      },
      { ...references, divisionIds: ['a', 'b'] },
    ),
  ).toBe(hash)
  expect(
    await hashPlaceMaterialisation(place, { ...references, effectiveLng: 114 }),
  ).not.toBe(hash)
  expect(
    await hashPlaceMaterialisation(place, {
      ...references,
      addressDependencyHash: 'changed',
    }),
  ).not.toBe(hash)
  const contract = placePreparedSpecification('contentHash')!
  expect(contract.inputs).toContain('effectiveCoordinates')
  expect(contract.inputs).toContain('addressDependencyHash')
  expect(contract.inputs).not.toContain('i18n')
})
