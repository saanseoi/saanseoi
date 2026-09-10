import { expect, test } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-oi-hei-backfill.json'
import { backfillOiHei } from './hkgovAlsOiHeiBackfill'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
test('Oi Hei latest GeoAddress and point backfill all 30 releases with unchanged CSU and raw provenance', () => {
  expect(fixture.assertions).toHaveLength(30)
  for (const a of fixture.assertions) {
    const row = {
      hkgovCsuId: fixture.csu,
      geoAddress: a.premises.GeoAddress,
      engPremisesAddressJson: JSON.stringify(a.premises.EngPremisesAddress),
      chiPremisesAddressJson: JSON.stringify(a.premises.ChiPremisesAddress),
      geometry: JSON.stringify(a.geometry),
      sources: '{}',
    } as PreparedHkgovAlsRow
    const changed = structuredClone(row)
    changed.geoAddress = 'changed'
    expect(() => backfillOiHei([changed], a.version)).toThrow('source identity changed')
    backfillOiHei([changed], a.version, true)
    expect(changed.geoAddress).toBe('changed')
    backfillOiHei([row], a.version)
    expect(row.geoAddress).toBe('1542227735T20110329')
    expect(JSON.parse(row.geometry!).coordinates).toEqual([113.97444, 22.38873])
    expect(row.hkgovCsuId).toBe(fixture.csu)
    expect(JSON.parse(row.sources).hkgovAlsOiHeiBackfill.publisherPremises).toEqual(
      a.premises,
    )
  }
})

test('Oi Hei retains raw publisher geometry when the bounded coordinate policy ran first', () => {
  const assertion = fixture.assertions.find(a => a.version === '2026-04-03.0')
  if (!assertion) throw new Error('Missing 2026-04-03.0 Oi Hei assertion')
  const derivedGeometry = { type: 'Point', coordinates: fixture.coordinates }
  const row = {
    hkgovCsuId: fixture.csu,
    geoAddress: assertion.premises.GeoAddress,
    engPremisesAddressJson: JSON.stringify(assertion.premises.EngPremisesAddress),
    chiPremisesAddressJson: JSON.stringify(assertion.premises.ChiPremisesAddress),
    geometry: JSON.stringify(derivedGeometry),
    sources: JSON.stringify({
      hkgovAlsCoordinateBackfill: {
        publisherGeometry: assertion.geometry,
        derivedGeometry,
      },
    }),
  } as PreparedHkgovAlsRow

  backfillOiHei([row], assertion.version)

  expect(JSON.parse(row.sources).hkgovAlsOiHeiBackfill.publisherGeometry).toEqual(
    assertion.geometry,
  )
})
