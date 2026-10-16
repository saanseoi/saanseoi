import { expect, test } from 'bun:test'
import { currentFieldRule } from './fieldLineageCurrentRules'
import { sourceRetentionSpecification } from './fieldLineageSourceRules'
import { listApiFieldFixtures } from './apiFieldFixtures'

test('Address identifier lineage uses the canonical publisher-qualified key', () => {
  const address = listApiFieldFixtures().find(
    fixture => fixture.apiVersion === 'api-addresses-v0.1',
  )!
  expect(
    address.fields.some(
      field => field.apiField === 'attributes.identifiers.hkgov-dpo.csuId',
    ),
  ).toBe(true)
  expect(
    address.fields.some(
      field => field.apiField === 'attributes.identifiers.hkgovCsuId',
    ),
  ).toBe(false)
  expect(
    currentFieldRule(
      'address',
      'attributes.identifiers.hkgov-dpo.csuId',
      'ds-hk-hkgov-dpo-address',
    )?.expression,
  ).toBe("canonicalIdentifiers(row.identifiers)?.['hkgov-dpo']?.csuId")
})

test('independent geometry and identity outputs do not claim unrelated publisher dependencies', () => {
  expect(
    currentFieldRule('divisionArea', 'attributes.bbox', 'ds-hk-overture-division-area')
      ?.inputs,
  ).toEqual(['geometry'])
  expect(
    currentFieldRule('division', 'attributes.identifiers', 'ds-hk-overture-division')
      ?.inputs,
  ).toEqual(['identifiers', 'wikidata'])
  expect(
    currentFieldRule('place', 'attributes.taxonomy.primary', 'ds-hk-overture-place')
      ?.inputs,
  ).toEqual(['taxonomy.primary', 'categories.primary'])
})
test('supplementary addresses use accepted structured values, not ALS component normalisation', () => {
  const supplementary = currentFieldRule(
    'address',
    'attributes.i18n',
    'ds-hk-overture-place',
  )!
  expect(supplementary.implementation.symbol).toBe('buildSupplementaryAddressRows')
  expect(supplementary.inputs).toEqual(['resolutions'])
  expect(
    currentFieldRule('address', 'attributes.geometry', 'ds-hk-overture-place')
      ?.expression,
  ).toBe('null')
  expect(
    currentFieldRule('address', 'attributes.geometry', 'ds-hk-hkgov-dpo-address')
      ?.expression,
  ).toBe('parseOptionalJson(row.geometry)')
})
test('native C&SD divisions dispatch before the generic WKB normaliser', () => {
  const native = currentFieldRule(
    'division',
    'attributes.geometry',
    'ds-hk-hkgov-censtatd-new-towns',
  )!
  expect(native.implementation.symbol).toBe(
    'normaliseHkgovCenstatdStatisticDivisionRow',
  )
  expect(native.expression).toContain('parseJsonGeometry')
})
test('SOURCE retention preserves publisher geometry independently of canonical repairs', () => {
  expect(
    sourceRetentionSpecification('ds-hk-hkgov-pland-division-pu', 'geometry')
      ?.expression,
  ).toContain('record.sourceGeometry')
  expect(
    sourceRetentionSpecification('ds-hk-overture-place', 'geometry')?.expression,
  ).toContain('wkb-base64')
  expect(sourceRetentionSpecification('unknown-future-dataset', 'geometry')).toBeNull()
})
