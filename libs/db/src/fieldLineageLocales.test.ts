import { expect, test } from 'bun:test'
import { compileFieldLineage } from './fieldLineageCompiler'
import { expandLocaleFieldLineage } from './fieldLineageLocales'
import { computeVersionHash } from './versioning'

const response = { i18n: { name: 'name' } }
const result = compileFieldLineage(
  [
    {
      resourceType: 'division',
      apiField: 'attributes.i18n.*.name',
      variant: null,
      sourceDatasetId: 'dataset',
      inputs: [{ origin: 'source', fieldPath: 'properties.names' }],
      canonicalInputs: ['division.i18n.*.name'],
      resolverCode: 'normalise-divisions',
      contributionType: 'primary',
      priority: 0,
      confidence: 1,
      resolverRules: [],
    },
  ],
  new Map([['dataset', { 'properties.names': 'names' }]]),
  {
    api: {
      version: 'api-divisions-v0.2',
      responseSchemaVersion: 'schema',
      responseSchemaHash: computeVersionHash(response),
    },
    apiReleaseSetId: 'release',
    apiVersionReleaseSetId: 'version',
    responseDefinition: response,
    sources: [
      {
        sourceDatasetId: 'dataset',
        datasetCode: 'ds-hk-saanseoi-division',
        sourceSchemaVersion: '1.0',
        resourceReleaseId: 'resource-release',
        processingRules: null,
      },
    ],
    snapshots: [{ snapshotId: 'snapshot', resourceType: 'division' }],
  },
)
test('dynamic locales expand from the selected snapshot and preserve literal map keys', () => {
  const fields = expandLocaleFieldLineage(
    result.definition,
    result.binding,
    'division',
    {
      snapshotId: 'snapshot',
      i18n: { 'zh-hant': { name: '名稱' }, 'x.test': { name: 'literal' } },
    },
  )
  expect(fields.map(field => field.apiFieldSegments)).toEqual([
    ['attributes', 'i18n', 'x.test', 'name'],
    ['attributes', 'i18n', 'zh-hant', 'name'],
  ])
  expect(result.definition.fields[0]!.dynamicSelectors?.[0]?.domainRole).toBe(
    'snapshot-locales',
  )
})
test('locale expansion rejects a record from another snapshot', () => {
  expect(() =>
    expandLocaleFieldLineage(result.definition, result.binding, 'division', {
      snapshotId: 'another',
      i18n: { en: {} },
    }),
  ).toThrow('outside')
})
