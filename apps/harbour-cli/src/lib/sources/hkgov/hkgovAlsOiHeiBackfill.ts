import { AssertionError, strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-oi-hei-backfill.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

export function backfillOiHei(
  rows: PreparedHkgovAlsRow[],
  version: string,
  skip = false,
) {
  const evidence = fixture.assertions.find(a => a.version === version)
  if (!evidence) return
  const targets = rows.filter(r => r.hkgovCsuId === fixture.csu)
  if (!targets.length) return
  try {
    assert.equal(targets.length, 1, 'Oi Hei backfill: ambiguous owner')
    const row = targets[0]!
    assert.deepEqual(
      {
        BuildingCsuInformation: { CsuId: row.hkgovCsuId },
        EngPremisesAddress: JSON.parse(row.engPremisesAddressJson ?? '{}'),
        ChiPremisesAddress: JSON.parse(row.chiPremisesAddressJson ?? '{}'),
        GeoAddress: row.geoAddress,
      },
      evidence.premises,
      'Oi Hei backfill: source identity changed',
    )
    assert.deepEqual(
      JSON.parse(row.geometry ?? 'null'),
      evidence.geometry,
      'Oi Hei backfill: source point changed',
    )
    row.geoAddress = fixture.geoAddress
    row.geometry = JSON.stringify({ type: 'Point', coordinates: fixture.coordinates })
    row.identitySummary = {
      ...row.identitySummary,
      longitude: fixture.coordinates[0]!.toFixed(5),
      latitude: fixture.coordinates[1]!.toFixed(5),
    }
    row.sources = JSON.stringify({
      ...JSON.parse(row.sources),
      hkgovAlsOiHeiBackfill: {
        curationFile: 'hkgov-dpo-address-oi-hei-backfill.json',
        sourceVersion: version,
        publisherPremises: evidence.premises,
        publisherGeometry: evidence.geometry,
        geoAddress: fixture.geoAddress,
        coordinates: fixture.coordinates,
      },
    })
  } catch (error) {
    if (!skip || !(error instanceof AssertionError)) throw error
  }
}
