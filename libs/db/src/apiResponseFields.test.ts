import { expect, test } from 'bun:test'
import {
  canonicalResponseInputs,
  resolveApiResponseFields,
  validateApiResponseFields,
} from './apiResponseFields'
import { computeVersionHash } from './versioning'
import { listApiFieldFixtures } from './apiFieldFixtures'

test('ordinary projections preserve locale paths and canonical resource scope', () => {
  const schema = resolveApiResponseFields('api-addresses-v0.1', 'sv-address-v1')
  expect(canonicalResponseInputs(schema, 'address', 'id')).toEqual(['address.id'])
  expect(
    canonicalResponseInputs(schema, 'address', 'attributes.i18n.zh-hant.streetName'),
  ).toEqual(['address.i18n.zh-hant.streetName'])
  expect(canonicalResponseInputs(schema, 'address', 'relationships.divisions')).toEqual(
    ['address.divisions'],
  )
  expect(() =>
    canonicalResponseInputs(schema, 'address', 'relationships.unknown'),
  ).toThrow('explicit mapping')
  expect(() => canonicalResponseInputs(schema, 'unknown', 'id')).toThrow(
    'Unknown API response resource',
  )
  expect(() =>
    resolveApiResponseFields('api-addresses-v0.1', 'sv-address-v99'),
  ).toThrow('Missing API response fields')
})

test('shared Division joins retain every dependency across source mappings', () => {
  const schema = resolveApiResponseFields('api-divisions-v0.1', 'sv-division-v1')
  const areas = ['division.id', 'divisionArea.divisionId', 'divisionArea.id']
  expect(canonicalResponseInputs(schema, 'division', 'relationships.areas')).toEqual(
    areas,
  )
  expect(
    canonicalResponseInputs(schema, 'division', 'relationships.boundaries'),
  ).toEqual([
    'division.id',
    'divisionBoundary.leftDivisionId',
    'divisionBoundary.rightDivisionId',
    'divisionBoundary.id',
  ])
  for (const fixture of listApiFieldFixtures().filter(
    f => f.apiVersion === schema.apiVersion,
  )) {
    expect(fixture.responseFieldsVersionHash).toBe(schema.versionHash)
    expect(Object.hasOwn(fixture, 'responseFields')).toBe(false)
    for (const field of fixture.fields.filter(
      f => f.apiField === 'relationships.areas',
    ))
      expect(field.canonicalInputs).toEqual(areas)
  }
  canonicalResponseInputs(schema, 'division', 'relationships.areas').pop()
  expect(canonicalResponseInputs(schema, 'division', 'relationships.areas')).toEqual(
    areas,
  )
})

test('explicit aliases and computed inputs override ordinary projections', () => {
  const schema = resolveApiResponseFields('api-addresses-v0.1', 'sv-address-v1')
  schema.resources.address!['attributes.label'] = 'address.i18n.en.formattedAddress'
  schema.resources.address!['attributes.position'] = ['address.geometry', 'address.id']
  schema.versionHash = computeVersionHash(schema)
  validateApiResponseFields(schema)
  expect(canonicalResponseInputs(schema, 'address', 'attributes.label')).toEqual([
    'address.i18n.en.formattedAddress',
  ])
  expect(canonicalResponseInputs(schema, 'address', 'attributes.position')).toEqual([
    'address.geometry',
    'address.id',
  ])
  expect(
    resolveApiResponseFields(schema.apiVersion, schema.schemaVersion).resources.address,
  ).not.toHaveProperty('attributes.label')
})

test('shared response mappings validate their hashes and dependency declarations', () => {
  const schema = resolveApiResponseFields('api-places-v0.1', 'sv-place-v1')
  schema.resources.place!['relationships.address'] = 'place.changed'
  expect(() => validateApiResponseFields(schema)).toThrow('hash')
  for (const invalid of [[], ['place.id', 'place.id'], ['id'], '']) {
    schema.resources.place!['relationships.address'] = invalid
    schema.versionHash = computeVersionHash(schema)
    expect(() => validateApiResponseFields(schema)).toThrow('canonical input paths')
  }
})
