import { expect, test } from 'bun:test'
import { initialDatasets } from '../../../db/src/registry/meta'
import {
  resolveIngestionProcessingRules,
  resolveSnapshotProcessingRules,
} from './processingPolicyCatalogue'
import {
  validateProcessingFields,
  resolveProcessingReferences,
} from './processingPolicy'
import { resolveRuleFixtureCatalog } from './ruleFixture'
import population from '../../../../fixtures/meta/processing-rules/assembly/censtatd-population-thousands-to-persons.json'

test('implemented datasets describe SOURCE ingestion with typed field references and localised definitions', () => {
  expect(initialDatasets.filter(dataset => dataset.processingRules)).toHaveLength(24)
  for (const dataset of initialDatasets) {
    if (!dataset.processingRules) {
      expect(dataset.code).toBe('ds-hk-dpang-street')
      continue
    }
    expect(dataset.processingRules.stage).toBe('ingestion')
    const rules = dataset.processingRules.rulesets.flatMap(ruleset => ruleset.rules)
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.kind).toBe('bulk')
      expect(rule.definition?.implementation).toBeDefined()
      expect(rule).not.toHaveProperty('type')
      expect(rule).not.toHaveProperty('sourceFieldPath')
      expect(rule).not.toHaveProperty('targetFieldPath')
      expect(rule.targetFields?.every(field => field.origin !== 'canonical')).toBe(true)
      expect(() => validateProcessingFields(rule.targetFields)).not.toThrow()
      for (const locale of ['en', 'zh-hant', 'zh-hans'])
        expect(rule.i18n[locale]?.description).toBeTruthy()
    }
  }
})

test('Protomaps extraction and retention remain distinct from SaanSeoi snapshot assembly', () => {
  const input = initialDatasets.find(
    dataset => dataset.code === 'ds-hk-protomaps-island',
  )!.processingRules!
  expect(
    input.rulesets.flatMap(ruleset => ruleset.rules.map(rule => rule.definition?.id)),
  ).toEqual(['extract-protomaps-source', 'saanseoi.native-source-import.v1'])
  expect(
    resolveSnapshotProcessingRules(['ds-hk-protomaps-island'], 'divisionArea').rulesets,
  ).toEqual([])
  const divisions = resolveSnapshotProcessingRules(
    ['ds-hk-saanseoi-division'],
    'division',
  )
  expect(divisions.stage).toBe('assembly')
  expect(
    divisions.rulesets[0]!.rules.some(
      rule => rule.operationCode === 'normalise-divisions',
    ),
  ).toBe(true)
  expect(() =>
    resolveIngestionProcessingRules([
      {
        rulesetVersion: 'rs-division-assembly-v1',
        operationCodes: ['normalise-divisions'],
      },
    ]),
  ).toThrow('Wrong or missing ingestion')
})

test('Area and Boundary recipes declare only their own geometry operation', () => {
  const area = resolveSnapshotProcessingRules(
    ['ds-hk-overture-division'],
    'divisionArea',
  )
  const boundary = resolveSnapshotProcessingRules(
    ['ds-hk-overture-division'],
    'divisionBoundary',
  )
  expect(area.rulesets[0]!.rules.map(rule => rule.definition?.id)).toEqual([
    'normalise-division-area-geometry',
  ])
  expect(boundary.rulesets[0]!.rules.map(rule => rule.definition?.id)).toEqual([
    'normalise-division-boundary-geometry',
  ])
  expect(area.rulesets[0]!.rules[0]!.definition?.dependencies?.[0]?.id).toBe(
    'exclude-division-geometry',
  )
})

test('paths reject prose, comma-separated lists, absent source columns and canonical writes during ingestion', () => {
  for (const path of [
    'SaanSeoi island geometry selection',
    'properties, sourceGeometry',
    'properties..names',
  ])
    expect(() =>
      validateProcessingFields([
        { origin: 'source', collection: 'protomapsIslandFeatures', path },
      ]),
    ).toThrow()
  expect(() =>
    validateProcessingFields([
      { origin: 'source', collection: 'protomapsIslandFeatures', path: 'canonicalId' },
    ]),
  ).toThrow('Unknown source field')
  expect(() =>
    validateProcessingFields([
      { origin: 'canonical', collection: 'divisions', path: 'type' },
    ]),
  ).toThrow('Unknown canonical field')
  const definitions = resolveRuleFixtureCatalog({ population })
  expect(() =>
    resolveProcessingReferences(
      [{ rulesetVersion: 'invalid', operationCodes: ['scale'] }],
      'ingestion',
      [
        {
          code: 'invalid',
          versionHash: '',
          stage: 'ingestion',
          mergeRules: [
            {
              operationCode: 'scale',
              ruleFixture: 'population',
              targetFields: [
                { origin: 'canonical', collection: 'statsRecords', path: 'values' },
              ],
            },
          ],
        },
      ],
      definitions,
    ),
  ).toThrow('cannot write canonical')
})

test('operation references reject missing, duplicate and wrong-stage selections', () => {
  expect(() =>
    resolveIngestionProcessingRules([
      { rulesetVersion: 'rs-source-ingestion-v1', operationCodes: ['missing'] },
    ]),
  ).toThrow('does not define operation')
  expect(() =>
    resolveIngestionProcessingRules([
      { rulesetVersion: 'rs-source-ingestion-v1', operationCodes: [] },
    ]),
  ).toThrow('non-empty and unique')
  expect(() =>
    resolveIngestionProcessingRules([
      {
        rulesetVersion: 'rs-source-ingestion-v1',
        operationCodes: ['ingest-overture-place', 'ingest-overture-place'],
      },
    ]),
  ).toThrow('non-empty and unique')
  const reference = {
    rulesetVersion: 'rs-source-ingestion-v1',
    operationCodes: ['ingest-overture-place'],
  }
  expect(() => resolveIngestionProcessingRules([reference, reference])).toThrow(
    'Duplicate processing ruleset selection',
  )
})
