import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

test('Kwong Yan retains its reviewed original point until revoked with raw provenance', () => {
  for (const version of ['2026-04-25.0', '2026-08-05.0', '2030-01-01.0']) {
    const rows = fixture.backfills
      .filter(d => d.sourceVersionFrom <= version && d.sourceVersionTo >= version)
      .map(
        d =>
          ({
            hkgovCsuId: d.csu,
            enEstateName: d.estate,
            enBuildingName: d.enBuildingName,
            ...('expectedPremises' in d && d.expectedPremises
              ? {
                  engPremisesAddressJson: JSON.stringify(
                    d.expectedPremises.EngPremisesAddress,
                  ),
                  chiPremisesAddressJson: JSON.stringify(
                    d.expectedPremises.ChiPremisesAddress,
                  ),
                  geoAddress: d.expectedPremises.GeoAddress,
                  enBlockNumber: null,
                  zhHantBlockNumber: null,
                }
              : {}),
            geometry: JSON.stringify({
              type: 'Point',
              coordinates: d.previousCoordinates,
            }),
            sources: JSON.stringify({ publisherInventory: 974 }),
          }) as PreparedHkgovAlsRow,
      )
    backfillAlsCoordinates(rows, version)
    const row = requireDefined(rows.find(r => r.hkgovCsuId === '3609034391T20050430'))
    expect(JSON.parse(requireDefined(row.geometry)).coordinates).toEqual([
      114.17515, 22.44896,
    ])
    const sources = JSON.parse(row.sources)
    expect(sources.publisherInventory).toBe(974)
    expect(sources.hkgovAlsCoordinateBackfill.publisherGeometry.coordinates).toEqual([
      114.17485, 22.44949,
    ])
    expect(sources.hkgovAlsCoordinateBackfill.retention).toBe('until-revoked')
  }
})

test('Kwong Yan rejects an unreviewed future publisher point', () => {
  const row = {
    hkgovCsuId: '3609034391T20050430',
    enEstateName: 'KWONG FUK ESTATE',
    enBuildingName: 'KWONG YAN HOUSE',
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.17, 22.44] }),
    sources: '{}',
  } as PreparedHkgovAlsRow
  expect(() => backfillAlsCoordinates([row], '2030-01-01.0')).toThrow(
    'source point changed',
  )
})
