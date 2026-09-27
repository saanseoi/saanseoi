import { expect, test } from 'bun:test'
import { protomapsSourceRecords, sourceNames } from './protomapsIslands'

const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}
test('source extraction retains unnamed features, native IDs and every explicit locale', () => {
  const rows = protomapsSourceRecords(
    [
      {
        id: 'w1',
        geometry,
        properties: {
          place: 'island',
          name: 'Bilingual label',
          'name:en': 'Island',
          'name:zh-Hant': '島',
        },
      },
      { id: 'w2', geometry, properties: { place: 'islet' } },
      {
        id: 'n3',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { place: 'island', 'name:zh': '島' },
      },
    ],
    [{ geometry }],
  )
  expect(rows).toHaveLength(4)
  expect(rows.find(r => r.sourceRecordId === 'OSM:w1')?.properties.names).toEqual({
    en: 'Island',
    'zh-Hant': '島',
  })
  expect(rows.find(r => r.sourceRecordId === 'OSM:w2')?.properties.names).toEqual({})
  expect(rows.find(r => r.sourceRecordId === 'OSM:n3')?.sourceGeometry.type).toBe(
    'Point',
  )
  expect(
    rows.find(r => r.properties.kind === 'coastline-land')?.sourceRecordId,
  ).toMatch(/^PROTOMAPS:LAND:[a-f0-9]{64}$/)
  expect(sourceNames({ name: 'Unspecified language' })).toEqual({})
})
test('source identities are independent of names and reject conflicting native records', () => {
  const first = protomapsSourceRecords(
    [{ id: 'w1', geometry, properties: { place: 'island', name: 'A' } }],
    [],
  )
  const second = protomapsSourceRecords(
    [{ id: 'w1', geometry, properties: { place: 'island', name: 'B' } }],
    [],
  )
  expect(first[0]?.sourceRecordId).toBe(second[0]?.sourceRecordId)
  expect(() =>
    protomapsSourceRecords(
      [
        { id: 'w1', geometry, properties: { place: 'island', name: 'A' } },
        { id: 'w1', geometry, properties: { place: 'island', name: 'B' } },
      ],
      [],
    ),
  ).toThrow('Conflicting source feature')
})
