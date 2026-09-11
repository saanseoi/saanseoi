import { expect, test } from 'bun:test'
import { alsSourcePayload, captureAlsPublisherSources } from './alsSourcePayload'
import { overtureSourcePayload, sourceLocatorFromReferences } from './sourcePayload'

test('Overture envelope retains publisher values once and leaves the input untouched', () => {
  const input = {
    id: 'publisher-id',
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: [{ dataset: 'publisher', record_id: 'original' }],
    version: 4,
    names: { primary: ' Raw name ' },
    country: null,
  }
  const before = structuredClone(input)
  const result = overtureSourcePayload(input)
  expect(result.rawProperties).toEqual({
    version: 4,
    names: { primary: ' Raw name ' },
    sources: [{ dataset: 'publisher', recordId: 'original' }],
    country: null,
  })
  const expected = {
    ...before,
    sources: [{ dataset: 'publisher', recordId: 'original' }],
  }
  expect({
    id: input.id,
    ...result.rawProperties,
    geometry: result.sourceGeometry,
  }).toEqual(expected)
  expect(input).toEqual(before)
})

test('ALS flattening retains literal values and unknown fields without enriched duplicates', () => {
  const feature = {
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Easting: 123,
      Address: {
        PremisesAddress: {
          GeoAddress: 'geo',
          BuildingCsuInformation: { CsuId: '000123' },
          EngPremisesAddress: {
            Region: ' NT ',
            BuildingName: 'EXAMPLE III',
            EngEstate: { EngPhase: { PhaseName: ' Original ', PhaseNo: 2 } },
            EngStreet: { LocationName: null },
            Eng3dAddress: [{ EngFloor: { FloorNum: 1 } }],
            EngVillage: {
              VillageName: 'VILLAGE',
              LocationName: 'DISTRICT',
              BuildingNoFrom: '007',
            },
          },
        },
      },
      unknown: { 'a/b': false, empty: {}, absent: null, rows: [{ value: 1 }] },
    },
  }
  const result = alsSourcePayload(feature)
  expect(result.rawProperties).toEqual({
    easting: 123,
    geoAddress: 'geo',
    hkgovCsuId: '000123',
    regionEn: ' NT ',
    phaseNameEn: ' Original ',
    phaseNoEn: 2,
    streetLocationNameEn: null,
    address3dEn: [{ EngFloor: { FloorNum: 1 } }],
    buildingNameEn: 'EXAMPLE III',
    villageNameEn: 'VILLAGE',
    villageLocationNameEn: 'DISTRICT',
    villageNumberFromEn: '007',
    unknownAB: false,
    unknownEmpty: {},
    unknownAbsent: null,
    unknownRows: [{ value: 1 }],
  })
  feature.properties.Address.PremisesAddress.BuildingCsuInformation.CsuId = 'corrected'
  feature.geometry.coordinates[0] = 0
  expect(result.rawProperties?.hkgovCsuId).toBe('000123')
  expect(result.sourceGeometry).toEqual({ type: 'Point', coordinates: [114, 22] })
})

test('ALS source identity and versions are independent of canonical curation and retain duplicate occurrences', async () => {
  const feature = {
    properties: {
      Address: {
        PremisesAddress: {
          GeoAddress: 'geo',
          BuildingCsuInformation: { CsuId: 'csu' },
          EngPremisesAddress: { BuildingName: 'Original' },
        },
      },
    },
  }
  const input = [1, 2].map(featureIndexOneBased => ({
    feature,
    sourceFile: 'district.geojson',
    featureIndexOneBased,
  }))
  const first = [...(await captureAlsPublisherSources(input, '2026-01-01.0')).values()]
  const next = [...(await captureAlsPublisherSources(input, '2026-02-01.0')).values()]
  expect(new Set(first.map(row => row.sourceRecordId)).size).toBe(2)
  expect(next.map(row => row.sourceRecordId)).toEqual(
    first.map(row => row.sourceRecordId),
  )
  expect(next.map(row => row.versionHash)).toEqual(first.map(row => row.versionHash))
  feature.properties.Address.PremisesAddress.EngPremisesAddress.BuildingName =
    'Changed upstream'
  const changed = [
    ...(await captureAlsPublisherSources(input, '2026-03-01.0')).values(),
  ]
  expect(changed[0]!.sourceRecordId).toBe(first[0]!.sourceRecordId)
  expect(changed[0]!.versionHash).not.toBe(first[0]!.versionHash)
  expect(first[0]!.rawProperties?.buildingNameEn).toBe('Original')
})

test('source geometry retains exact WKB bytes rather than a GeoJSON derivative', () => {
  const backing = new Uint8Array([99, 1, 2, 3, 88])
  const input = backing.subarray(1, 4)
  const result = overtureSourcePayload({ id: 'native', geometry: input })
  expect(result.sourceGeometry).toEqual({ encoding: 'wkb-base64', data: 'AQID' })
  expect(result.rawProperties).not.toHaveProperty('geometry')
  expect([...input]).toEqual([1, 2, 3])
})

test('compact acquisition locators reject conflicting source occurrences', () => {
  expect(
    sourceLocatorFromReferences([
      {
        dataset: 'publisher',
        sourceVersion: '2026',
        sourceFile: 'a',
        featureIndexOneBased: 3,
      },
    ]),
  ).toEqual({ sourceFile: 'a', featureIndexOneBased: 3 })
  expect(() =>
    sourceLocatorFromReferences([{ sourceFile: 'a' }, { sourceFile: 'b' }]),
  ).toThrow('Conflicting source locator')
})
