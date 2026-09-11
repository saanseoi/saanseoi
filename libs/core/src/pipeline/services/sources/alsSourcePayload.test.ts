import { expect, test } from 'bun:test'
import { readAlsPublisherSource } from './alsSourcePayload'

test('publisher envelope accepts native and JSON null without inventing provenance', () => {
  expect(readAlsPublisherSource({ publisherSource: null })).toBeNull()
  expect(readAlsPublisherSource({ publisherSource: 'null' })).toBeNull()
})

test('publisher envelope still rejects malformed values', () => {
  for (const publisherSource of ['{}', 'false', '[]', '"null"', '{']) {
    expect(() => readAlsPublisherSource({ publisherSource })).toThrow()
  }
})

test('publisher envelope preserves complete evidence', () => {
  const source = {
    sourceRecordId: 'source',
    versionHash: 'hash',
    sources: [],
    rawProperties: {},
    sourceGeometry: null,
  }
  expect(readAlsPublisherSource({ publisherSource: JSON.stringify(source) })).toEqual(
    source,
  )
})
