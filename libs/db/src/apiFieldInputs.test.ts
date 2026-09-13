import { resolveApiFieldCurationInput } from './apiFieldCurationContexts'
import { expect, test } from 'bun:test'
import {
  pinApiFieldRules,
  resolvePublisherFieldPaths,
  validateApiFieldInputs,
} from './apiFieldInputs'
import { computeVersionHash } from './versioning'

test('source inputs resolve through the dataset publisher mapping', () => {
  const inputs = [
    { origin: 'source' as const, fieldPath: 'properties.year' },
    { origin: 'source' as const, fieldPath: 'sourceRecordId' },
    { origin: 'registry' as const, fieldPath: 'dataset.code' },
  ]
  const mapping = {
    'properties.year': ['properties.YEAR', 'properties.Year'],
    sourceRecordId: 'properties.OBJECTID',
  }
  expect(() => validateApiFieldInputs(inputs, mapping)).not.toThrow()
  expect(() => validateApiFieldInputs([])).toThrow()
  expect(() => validateApiFieldInputs(inputs, {})).toThrow('Unmapped source input')
  expect(() =>
    validateApiFieldInputs(inputs, { ...mapping, 'properties.year': [] }),
  ).toThrow()
  expect(() =>
    validateApiFieldInputs(inputs, { ...mapping, 'properties.year': 'raw_properties' }),
  ).toThrow()
  expect(() =>
    validateApiFieldInputs([{ origin: 'constant', value: null }]),
  ).not.toThrow()
})

test('processing references pin the selected release definition, not a current rule with the same ID', () => {
  const definition = { id: 'normalise-example', parameters: { multiplier: 1000 } }
  const release = {
    releaseId: 'retained-release',
    processingRules: {
      rulesets: [
        {
          rulesetVersion: 'rules-v1',
          rulesetVersionHash: 'retained-ruleset-hash',
          rules: [{ definition }],
        },
      ],
    },
  }
  const field = { resolverCode: definition.id }
  const pins = pinApiFieldRules(field, [release])
  expect(pins).toEqual([
    {
      ruleId: definition.id,
      releaseId: 'retained-release',
      rulesetVersion: 'rules-v1',
      rulesetVersionHash: 'retained-ruleset-hash',
      definitionHash: computeVersionHash(definition),
    },
  ])
  expect(() => pinApiFieldRules(field, [])).toThrow('absent from selected releases')
  expect(() =>
    pinApiFieldRules({ resolverCode: 'direct_copy', processingRuleIds: ['missing'] }, [
      release,
    ]),
  ).toThrow()
  expect(pinApiFieldRules({ resolverCode: 'direct_copy' }, [])).toEqual([])
  expect(
    pinApiFieldRules(field, [
      release,
      { releaseId: 'unrelated-derived-release', processingRules: null },
    ]),
  ).toEqual(pins)
  const conflicting = structuredClone(release)
  conflicting.processingRules.rulesets[0]!.rules.push({
    definition: { ...definition, parameters: { multiplier: 1 } },
  })
  expect(() => pinApiFieldRules(field, [conflicting])).toThrow('Conflicting')
})

test('parent mappings preserve array indices and distinct dictionary locale keys', () => {
  const mapping = {
    'properties.divisionIds': 'division_ids',
    'properties.names.common': 'names.common',
  }
  expect(resolvePublisherFieldPaths('properties.divisionIds[0]', mapping)).toEqual([
    'division_ids[0]',
  ])
  expect(resolvePublisherFieldPaths('properties.divisionIds[1]', mapping)).toEqual([
    'division_ids[1]',
  ])
  for (const locale of ['en', 'zh-cn', 'zh-hans', 'zh-hant', 'zh-hk']) {
    expect(
      resolvePublisherFieldPaths(`properties.names.common.${locale}`, mapping),
    ).toEqual([`names.common.${locale}`])
  }
  expect(() =>
    validateApiFieldInputs(
      [{ origin: 'source', fieldPath: 'properties.divisionIds[1]' }],
      mapping,
    ),
  ).not.toThrow()
  expect(() =>
    resolvePublisherFieldPaths('properties.divisionIdsExtra[0]', mapping),
  ).toThrow('Unmapped')
  expect(() =>
    resolvePublisherFieldPaths('properties.divisionIds[no]', mapping),
  ).toThrow('Invalid')
})

test('specific renamed descendants override parents and alternative publisher paths retain suffixes', () => {
  const mapping = {
    'properties.sources': 'sources',
    'properties.sources[0].recordId': 'sources[0].record_id',
    'properties.addresses': ['addresses[]', 'alternateAddresses[]'],
  }
  expect(resolvePublisherFieldPaths('properties.sources[0].recordId', mapping)).toEqual(
    ['sources[0].record_id'],
  )
  expect(
    resolvePublisherFieldPaths('properties.addresses[2].locality', mapping),
  ).toEqual(['addresses[2].locality', 'alternateAddresses[2].locality'])
})

test('curation paths use named camelCase contexts while preserving registered identifiers and selectors', () => {
  expect(resolveApiFieldCurationInput('divisionClassification')).toEqual({
    contextId: 'division-classification',
    fieldPath: '',
  })
  expect(resolveApiFieldCurationInput('overturePlaceAddress.coordinates')).toEqual({
    contextId: 'overture-place-address',
    fieldPath: 'coordinates',
  })
  const selector = '[datasetCode=ds-hk-example].fields[sourceField=age_1]'
  expect(resolveApiFieldCurationInput(`statisticFields${selector}`)).toEqual({
    contextId: 'statistic-fields',
    fieldPath: selector,
  })
  expect(() =>
    validateApiFieldInputs([
      { origin: 'curation', fieldPath: 'division-classification' },
    ]),
  ).toThrow('Unknown')
  expect(() =>
    validateApiFieldInputs([
      { origin: 'curation', fieldPath: 'overturePlaceAddress.access-hint' },
    ]),
  ).toThrow('camelCase')
})
