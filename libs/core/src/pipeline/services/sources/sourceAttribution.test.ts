import { expect, test } from 'bun:test'
import {
  normaliseOvertureAttribution,
  readSourceAttributions,
} from './sourceAttribution'

test('canonical attribution rejects legacy metadata, missing identity and malformed pointers', () => {
  for (const value of [
    { hkgovAls: [] },
    [{}],
    [{ publisherCode: ' ', dataset: 'd' }],
    [{ publisherCode: 'p', dataset: 'd', versionHash: 'internal' }],
    [{ publisherCode: 'p', dataset: 'd', property: '/bad~2' }],
  ])
    expect(() => readSourceAttributions(value)).toThrow()
  const sources = [
    { publisherCode: 'p', dataset: 'd', property: null, recordId: 'x', version: '3' },
  ]
  expect(readSourceAttributions(sources)).toEqual(sources)
})

test('preserves native attribution and excludes processing metadata', () => {
  expect(
    normaliseOvertureAttribution([
      {
        dataset: 'meta',
        record_id: '123',
        property: '/a~1b/~0',
        version: 3,
        confidence: 0.8,
        provider: 'meta',
        resource: 'places',
        release: 'internal',
        versionHash: 'hash',
      },
    ]),
  ).toEqual([
    {
      publisherCode: 'meta',
      upstreamOf: 'overture',
      dataset: 'meta',
      recordId: '123',
      property: '/a~1b/~0',
      version: '3',
      confidence: 0.8,
    },
  ])
})
test('preserves root and null pointers without manufacturing optional values', () => {
  expect(
    normaliseOvertureAttribution([
      { dataset: 'Microsoft', property: null },
      { dataset: 'Overture', property: '' },
      { dataset: 'PinMeTo' },
    ]),
  ).toEqual([
    {
      publisherCode: 'microsoft',
      upstreamOf: 'overture',
      dataset: 'microsoft',
      property: null,
    },
    { publisherCode: 'overture', dataset: 'overture', property: '' },
    { publisherCode: 'pinmeto', upstreamOf: 'overture', dataset: 'pinmeto' },
  ])
})
test('rejects unidentified datasets and invalid pointers', () => {
  expect(() => normaliseOvertureAttribution([{}])).toThrow('Unregistered')
  expect(() =>
    normaliseOvertureAttribution([{ dataset: 'meta', property: '/bad~escape' }]),
  ).toThrow('JSON Pointer')
  expect(() =>
    normaliseOvertureAttribution([{ dataset: 'meta', property: 'name' }]),
  ).toThrow('JSON Pointer')
})

test('retained camelCase references preserve identity without guessing unknown publishers', () => {
  expect(
    normaliseOvertureAttribution([
      { dataset: 'Esri Community Maps', recordId: '123', updateTime: '2026-01-01' },
    ]),
  ).toEqual([
    {
      publisherCode: 'esri',
      upstreamOf: 'overture',
      dataset: 'esri-community-maps',
      recordId: '123',
      updateTime: '2026-01-01',
    },
  ])
  expect(() =>
    normaliseOvertureAttribution([
      { dataset: 'Unregistered upstream dataset', recordId: 'unknown' },
    ]),
  ).toThrow('Unregistered')
  expect(() =>
    normaliseOvertureAttribution([
      { dataset: 'meta', record_id: 'one', recordId: 'two' },
    ]),
  ).toThrow('Conflicting')
})

test('attributes Maps Entity Variant Names to Overture under the explicit policy', () => {
  expect(
    normaliseOvertureAttribution([
      {
        dataset: 'Maps Entity Variant Names',
        property: '/properties/names/primary',
        recordId: 'R913110',
        license: 'CC0-1.0',
        updateTime: null,
        confidence: null,
      },
    ]),
  ).toEqual([
    {
      publisherCode: 'overture',
      dataset: 'overture',
      property: '/properties/names/primary',
      recordId: 'R913110',
      license: 'CC0-1.0',
    },
  ])
})

test('preprocessing orders attribution like the type and distinguishes inherited and direct publishers', () => {
  const [source] = normaliseOvertureAttribution([
    {
      license: 'ODbL-1.0',
      version: '2026-07-23',
      update_time: '2024-10-14',
      record_id: 'n11402980091@2',
      dataset: 'OpenStreetMap',
      property: '',
      confidence: 1,
    },
  ])
  expect(source?.upstreamOf).toBe('overture')
  expect(Object.keys(source!)).toEqual([
    'property',
    'publisherCode',
    'upstreamOf',
    'dataset',
    'recordId',
    'updateTime',
    'version',
    'confidence',
    'license',
  ])
  const [direct] = readSourceAttributions([
    {
      recordId: 'division',
      dataset: 'ds-hk-overture-division',
      publisherCode: 'overture',
    },
  ])
  expect(Object.keys(direct!)).toEqual(['publisherCode', 'dataset', 'recordId'])
  expect(direct).not.toHaveProperty('upstreamOf')
  for (const upstreamOf of ['', null, 4, 'openstreetmap'])
    expect(() => readSourceAttributions([{ ...source, upstreamOf }])).toThrow(
      'upstreamOf',
    )
})
