import { expect, test } from 'bun:test'
import { SourceAttributionSchema } from './sourceAttribution'
import { normaliseOvertureAttribution } from '@repo/core/pipeline/services/sources/sourceAttribution'

test('the public schema preserves preprocessed inherited attribution and member order', () => {
  const [source] = normaliseOvertureAttribution([
    { dataset: 'OpenStreetMap', record_id: 'node', property: '', license: 'ODbL-1.0' },
  ])
  const parsed = SourceAttributionSchema.parse(source)
  expect(parsed).toEqual(source)
  expect(Object.keys(parsed)).toEqual([
    'property',
    'publisherCode',
    'upstreamOf',
    'dataset',
    'recordId',
    'license',
  ])
  expect(
    SourceAttributionSchema.parse({
      publisherCode: 'overture',
      dataset: 'ds-hk-overture-division',
    }),
  ).not.toHaveProperty('upstreamOf')
})
