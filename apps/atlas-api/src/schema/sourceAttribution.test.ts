import { expect, test } from 'bun:test'
import { SourceAttributionSchema } from './sourceAttribution'
import { normaliseOvertureAttribution } from '@repo/core/pipeline/services/sources/sourceAttribution'

test('source attribution requires publisher and rejects publisherCode', () => {
  expect(
    SourceAttributionSchema.safeParse({ publisher: 'overture', dataset: 'overture' })
      .success,
  ).toBe(true)
  for (const source of [
    { publisherCode: 'overture', dataset: 'overture' },
    { publisher: 'overture', publisherCode: 'overture', dataset: 'overture' },
  ])
    expect(SourceAttributionSchema.safeParse(source).success).toBe(false)
})

test('the public schema preserves preprocessed inherited attribution and member order', () => {
  const [source] = normaliseOvertureAttribution([
    { dataset: 'OpenStreetMap', record_id: 'node', property: '', license: 'ODbL-1.0' },
  ])
  if (!source) throw new Error('Expected normalised source attribution.')
  const parsed = SourceAttributionSchema.parse(source)
  expect(parsed).toEqual(source)
  expect(Object.keys(parsed)).toEqual([
    'property',
    'publisher',
    'upstreamOf',
    'dataset',
    'recordId',
    'license',
  ])
  expect(
    SourceAttributionSchema.parse({
      publisher: 'overture',
      dataset: 'ds-hk-overture-division',
    }),
  ).not.toHaveProperty('upstreamOf')
})
