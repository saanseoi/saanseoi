import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const retained = fixture.backfills.filter(
  d => d.id.startsWith('lai-kok-') && 'retention' in d,
)
const rowsFor = (version: string) =>
  fixture.backfills
    .filter(d => d.sourceVersionFrom <= version && d.sourceVersionTo >= version)
    .map(
      d =>
        ({
          hkgovCsuId: d.csu,
          enEstateName: d.estate,
          enBuildingName: d.enBuildingName,
          geometry: JSON.stringify({
            type: 'Point',
            coordinates: d.previousCoordinates,
          }),
          sources: JSON.stringify({
            publisherInventory:
              d.enBuildingName === 'LAI HO HOUSE' && version >= '2026-07-08.0'
                ? 420
                : 421,
          }),
        }) as PreparedHkgovAlsRow,
    )

test('Lai Kok keeps separate reviewed points through future releases without changing inventory', () => {
  expect(retained).toHaveLength(3)
  for (const version of ['2026-04-25.0', '2026-07-08.0', '2030-01-01.0']) {
    const rows = rowsFor(version)
    backfillAlsCoordinates(rows, version)
    for (const decision of retained) {
      const row = rows.find(r => r.hkgovCsuId === decision.csu)!
      expect(JSON.parse(row.geometry!).coordinates).toEqual(decision.currentCoordinates)
      const sources = JSON.parse(row.sources)
      expect(sources.hkgovAlsCoordinateBackfill.publisherGeometry.coordinates).toEqual([
        114.15717, 22.33301,
      ])
      expect(sources.hkgovAlsCoordinateBackfill.retention).toBe('until-revoked')
      if (decision.enBuildingName === 'LAI HO HOUSE')
        expect(sources.publisherInventory).toBe(version >= '2026-07-08.0' ? 420 : 421)
    }
  }
})

test('Lai Kok future retention fails closed for new publisher points', () => {
  for (const decision of retained) {
    const rows = rowsFor('2030-01-01.0')
    rows.find(r => r.hkgovCsuId === decision.csu)!.geometry = JSON.stringify({
      type: 'Point',
      coordinates: [0, 0],
    })
    expect(() => backfillAlsCoordinates(rows, '2030-01-01.0')).toThrow(
      'source point changed',
    )
  }
})

test('Lai Kok retention guards preserve the reviewed points and earlier backfills', () => {
  const reviewedPoints: Record<string, number[]> = {
    'LAI HO HOUSE': [114.15768, 22.33365],
    'LAI KWAI HOUSE': [114.15684, 22.33351],
    'LAI LAN HOUSE': [114.15717, 22.33292],
  }
  for (const decision of retained) {
    expect(decision.currentCoordinates).toEqual(
      reviewedPoints[decision.enBuildingName]!,
    )
    expect(decision.previousCoordinates).toEqual([114.15717, 22.33301])
    expect(
      fixture.backfills.find(
        d => d.csu === decision.csu && d.sourceVersionFrom === '2024-07-25.0',
      )!.currentCoordinates,
    ).toEqual(decision.currentCoordinates)
  }
})
