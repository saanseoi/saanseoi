import { expect, test } from 'bun:test'
import { normaliseOvertureAttribution } from './sourceAttribution'

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
    { publisherCode: 'microsoft', dataset: 'microsoft', property: null },
    { publisherCode: 'overture', dataset: 'overture', property: '' },
    { publisherCode: 'pinmeto', dataset: 'pinmeto' },
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
      dataset: 'esri-community-maps',
      recordId: '123',
      updateTime: '2026-01-01',
    },
  ])
  expect(() =>
    normaliseOvertureAttribution([
      { dataset: 'Maps Entity Variant Names', recordId: 'R913110' },
    ]),
  ).toThrow('Unregistered')
  expect(() =>
    normaliseOvertureAttribution([
      { dataset: 'meta', record_id: 'one', recordId: 'two' },
    ]),
  ).toThrow('Conflicting')
})
