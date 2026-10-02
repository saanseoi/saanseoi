import { expect, test } from 'bun:test'
import {
  apiReleaseSchemas,
  apiReleaseRulesets,
  assertApiReleaseVersions,
} from './apiReleaseVersions'

test('registered release descriptors have valid hashes and compatible resource scopes', () => {
  for (const ruleset of apiReleaseRulesets) {
    const schema = apiReleaseSchemas.find(
      row => row.resourceType === ruleset.resourceType,
    )
    expect(schema).toBeDefined()
    assertApiReleaseVersions({
      schemaVersion: schema!.code,
      rulesetVersion: ruleset.code,
    })
  }
})

test('publication requires both pins and rejects unknown and incompatible references', () => {
  expect(() => assertApiReleaseVersions(undefined as never)).toThrow(
    'explicit schemaVersion and rulesetVersion',
  )
  expect(() =>
    assertApiReleaseVersions({ schemaVersion: 'sv-division-v1' } as never),
  ).toThrow('explicit schemaVersion and rulesetVersion')
  expect(() =>
    assertApiReleaseVersions({
      schemaVersion: 'sv-missing-v1',
      rulesetVersion: 'rs-division-merge-v1',
    }),
  ).toThrow('Unknown API release schemaVersion')
  expect(() =>
    assertApiReleaseVersions({
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-missing-v1',
    }),
  ).toThrow('Unknown API release rulesetVersion')
  expect(() =>
    assertApiReleaseVersions({
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-place-merge-v1',
    }),
  ).toThrow('Incompatible API release versions')
  expect(() =>
    assertApiReleaseVersions(
      { schemaVersion: 'sv-place-v1', rulesetVersion: 'rs-place-merge-v1' },
      'divisions',
    ),
  ).toThrow('Incompatible API release versions')
})
