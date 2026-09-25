import { test, expect } from 'bun:test'
import { buildFieldLineageDefinition } from './fieldLineage'

test('lineage shares root ruleset pins and ignores release-specific rule bindings', () => {
  const field = {
    apiField: 'attributes.i18n.en.name',
    resourceType: 'division',
    variant: null,
    sourceDatasetId: 'dataset',
    inputs: [{ origin: 'source' as const, fieldPath: 'properties.name' }],
    canonicalInputs: ['division.i18n.en.name'],
    resolverCode: 'normalise',
    contributionType: 'resolver-input',
    priority: 1,
    confidence: null,
  }
  const pin = {
    ruleId: 'normalise',
    resourceReleaseId: 'release-one',
    rulesetVersion: 'v1',
    rulesetVersionHash: 'sha256:rules',
    definitionHash: 'sha256:definition',
  }
  const publisher = new Map([
    ['dataset', { 'properties.name': ['names.primary', 'names.common.en'] }],
  ])
  const a = buildFieldLineageDefinition([{ ...field, resolverRules: [pin] }], publisher)
  const b = buildFieldLineageDefinition(
    [{ ...field, resolverRules: [{ ...pin, resourceReleaseId: 'release-two' }] }],
    publisher,
  )
  expect(a).toEqual(b)
  expect(a.definition.rulesets).toHaveLength(1)
  expect(a.definition.ingestion[0]!.rawFields).toEqual([
    'names.primary',
    'names.common.en',
  ])
  expect(JSON.stringify(a)).not.toContain('release-one')
  expect(a.definition.fields[0]!.canonicalInputs).toEqual(['division.i18n.en.name'])
})
