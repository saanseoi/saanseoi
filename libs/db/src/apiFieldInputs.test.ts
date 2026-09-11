import { expect, test } from 'bun:test'
import { pinApiFieldRules, validateApiFieldInputs } from './apiFieldInputs'
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
  expect(() =>
    pinApiFieldRules(field, [
      release,
      { releaseId: 'missing-policy', processingRules: null },
    ]),
  ).toThrow('missing-policy')
  const conflicting = structuredClone(release)
  conflicting.processingRules.rulesets[0]!.rules.push({
    definition: { ...definition, parameters: { multiplier: 1 } },
  })
  expect(() => pinApiFieldRules(field, [conflicting])).toThrow('Conflicting')
})
