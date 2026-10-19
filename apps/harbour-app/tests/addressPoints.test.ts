import { describe, expect, it } from 'vitest'
import { addressPoint } from '../addressInputsPlugin'

describe('ALS map points', () => {
  it('retains source identity and bilingual fields while counting nested units', () => {
    const point = addressPoint(
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [114.1, 22.3] },
        properties: {
          Address: {
            PremisesAddress: {
              BuildingCsuInformation: { CsuId: '001' },
              GeoAddress: 'geo-1',
              EngPremisesAddress: {
                EngDistrict: 'ISLANDS',
                BuildingName: 'HOUSE',
                Eng3dAddress: [{}, {}],
              },
              ChiPremisesAddress: { BuildingName: '大廈', Chi3dAddress: [{}, {}] },
            },
          },
        },
      },
      'housing.geojson',
      42,
    )
    expect(point?.id).toBe(42)
    expect(point?.properties).toMatchObject({
      csuId: '001',
      geoAddress: 'geo-1',
      units: 2,
      district: 'ISLANDS',
    })
    expect(JSON.parse(point?.properties?.english)).toEqual({
      EngDistrict: 'ISLANDS',
      BuildingName: 'HOUSE',
    })
    expect(JSON.parse(point?.properties?.chinese)).toEqual({ BuildingName: '大廈' })
  })
  it('omits a source Point without a coordinates member', () => {
    expect(
      addressPoint(
        JSON.parse('{"type":"Feature","geometry":{"type":"Point"},"properties":{}}'),
        'district.geojson',
        1,
      ),
    ).toBeNull()
  })
  it('omits missing, non-point and invalid coordinates', () => {
    for (const geometry of [
      null,
      {
        type: 'LineString' as const,
        coordinates: [
          [114, 22],
          [114, 23],
        ],
      },
      { type: 'Point' as const, coordinates: [NaN, 22] },
      { type: 'Point' as const, coordinates: [114, 91] },
      { type: 'Point' as const, coordinates: [] },
    ]) {
      expect(
        addressPoint(
          { type: 'Feature', geometry, properties: {} },
          'district.geojson',
          1,
        ),
      ).toBeNull()
    }
  })
})
