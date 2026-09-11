import { expect, test } from 'bun:test'
import { assertUploadApiFieldCompatibility } from './uploadApiFields'

const division = {
  resourceType: 'division' as const,
  source: 'overture',
  datasetCode: 'ds-hk-overture-division',
  releaseCode: 'dr-hk-overture-division-example',
}

test('upload preflight accepts reviewed publisher schemas across mapping versions', () => {
  expect(assertUploadApiFieldCompatibility(division, '1.12.0')).toEqual({
    status: 'covered',
    mappings: ['api-divisions-v0.1@geographic-v1.json'],
  })
  expect(assertUploadApiFieldCompatibility(division, '1.18.0')).toEqual({
    status: 'covered',
    mappings: ['api-divisions-v0.1@geographic-v2.json'],
  })
})

test('upload preflight blocks unknown future and older schemas with review instructions', () => {
  for (const version of ['1.19.0', '1.9.0']) {
    expect(() => assertUploadApiFieldCompatibility(division, version)).toThrow(
      'Review the publisher schema changes',
    )
    expect(() => assertUploadApiFieldCompatibility(division, version)).toThrow(
      `publisher schema ${version}`,
    )
  }
})

test('upload preflight cannot borrow another API family or dataset range', () => {
  expect(() =>
    assertUploadApiFieldCompatibility(
      { ...division, datasetCode: 'unmapped-source' },
      '1.18.0',
    ),
  ).toThrow('No publisher schema range')
  expect(() =>
    assertUploadApiFieldCompatibility(
      { ...division, resourceType: 'place', datasetCode: 'ds-hk-overture-place' },
      '1.19.0',
    ),
  ).toThrow('preflight failed')
  expect(
    assertUploadApiFieldCompatibility(
      {
        ...division,
        resourceType: 'address',
        source: 'hkgov-dpo',
        datasetCode: 'ds-hk-hkgov-dpo-address',
      },
      '3.2',
    ).status,
  ).toBe('covered')
})

test('upload preflight uses the Planning domain and leaves uncovered Streets outside its scope', () => {
  expect(
    assertUploadApiFieldCompatibility(
      {
        ...division,
        source: 'hkgov-pland-new-town',
        datasetCode: 'ds-hk-hkgov-pland-division-new-town',
      },
      '1.0',
    ).status,
  ).toBe('covered')
  expect(
    assertUploadApiFieldCompatibility(
      { ...division, resourceType: 'street', source: 'hkgov-landsd' },
      '1.0',
    ),
  ).toEqual({ status: 'not-covered' })
})
