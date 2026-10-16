import { expect, test } from 'bun:test'
import {
  canonicalGeometryId,
  canonicalGeneratedId,
  canonicalStatisticId,
} from './canonicalIdentity'

test('canonical geometry identities are stable UUIDs scoped to provider and entity kind', () => {
  const id = canonicalGeometryId('divisionArea', 'hkgov-censtatd', 'CENSTATD:11')
  expect(id).toMatch(
    /^ss-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(canonicalGeometryId('divisionArea', 'hkgov-censtatd', 'CENSTATD:11')).toBe(id)
  expect(
    canonicalGeometryId('divisionBoundary', 'hkgov-censtatd', 'CENSTATD:11'),
  ).not.toBe(id)
  expect(canonicalGeometryId('divisionArea', 'overture', 'CENSTATD:11')).not.toBe(id)
  expect(canonicalGeneratedId(id)).toBe(id)
})

test('statistic UUID identity is stable and scoped by dataset, period and geography', () => {
  const input = {
    datasetCode: 'ds-hk-test',
    referencePeriodCode: '2021',
    geography: { kind: 'district', code: 'NTH' },
  }
  const id = canonicalStatisticId(input)
  expect(id).toBe('ss-67cca979-9fa8-55e7-969e-550740655438')
  expect(id).toMatch(
    /^ss-[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(
    canonicalStatisticId({
      ...input,
      geography: { code: 'NTH', kind: 'district', class: null, namespace: null },
    }),
  ).toBe(id)
  expect(canonicalStatisticId({ ...input, datasetCode: 'other' })).not.toBe(id)
  expect(canonicalStatisticId({ ...input, referencePeriodCode: '2022' })).not.toBe(id)
  for (const geography of [
    { ...input.geography, code: 'OTHER' },
    { ...input.geography, kind: 'hma' },
    { ...input.geography, class: 'other' },
    { ...input.geography, namespace: 'other' },
  ])
    expect(canonicalStatisticId({ ...input, geography })).not.toBe(id)
})
