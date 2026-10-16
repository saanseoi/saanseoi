import { compactStatisticFieldSources } from '@repo/db'
import { expect, test } from 'bun:test'
import { compileFieldLineage, type FieldLineageMapping } from './fieldLineageCompiler'
import { expandStatisticFieldLineage } from './fieldLineageStatistics'
import { computeVersionHash } from './versioning'

const datasetCode = 'ds-hk-hkgov-censtatd-land-area-population-density-district'
const fields: FieldLineageMapping[] = ['oldName', 'secondOldName'].map(name => ({
  apiField: `attributes.values.${name}`,
  resourceType: 'statistic',
  variant: null,
  sourceDatasetId: 'dataset',
  inputs: [{ origin: 'source', fieldPath: `properties.${name}` }],
  canonicalInputs: [`statistic.values.${name}`],
  resolverCode: 'normalise-censtatd-statistics',
  resolverRules: [],
  contributionType: 'primary',
  priority: 0,
  confidence: 1,
}))
const response = { values: 'statsRecords.values' }
const result = compileFieldLineage(fields, new Map(), {
  api: {
    version: 'api-stats-v0.1',
    responseSchemaVersion: 'schema',
    responseSchemaHash: computeVersionHash(response),
  },
  apiReleaseSetId: 'release',
  apiVersionReleaseSetId: 'version-release',
  responseDefinition: response,
  sources: [
    {
      sourceDatasetId: 'dataset',
      datasetCode,
      sourceSchemaVersion: '1.0',
      resourceReleaseId: 'resource-release',
      sourceReleaseId: 'source-release',
      processingRules: null,
    },
  ],
  snapshots: [{ snapshotId: 'snapshot', resourceType: 'divisionStatistic' }],
})
const record = {
  snapshotId: 'snapshot',
  datasetCode,
  values: { populationMidYear: '243300' },
  fieldDefinitionHashes: { populationMidYear: 'retained-definition-v1' },
  fieldSources: compactStatisticFieldSources({
    populationMidYear: {
      sourceReleaseId: 'source-release',
      sourceFeatureRef: 'feature',
    },
  }),
}
const definition = {
  datasetCode,
  fieldName: 'populationMidYear',
  sourceField: 'MYPOPN_LAND',
  versionHash: 'retained-definition-v1',
}
const definitions = new Map([
  [`${datasetCode}\0populationMidYear\0retained-definition-v1`, definition],
])

test('Statistics uses one dynamic field and expands it from the selected record definitions', () => {
  expect(result.definition.fields).toHaveLength(1)
  const expanded = expandStatisticFieldLineage(
    result.definition,
    result.binding,
    record,
    definitions,
  )
  expect(expanded[0]!.apiFieldSegments).toEqual([
    'attributes',
    'values',
    'populationMidYear',
  ])
  expect(expanded[0]!.sourceFieldPath).toEqual(['properties', 'MYPOPN_LAND'])
  expect(expanded[0]!.selectorBindings.fieldDefinitionHash).toBe(
    'retained-definition-v1',
  )
  expect(JSON.stringify(expanded)).not.toContain('oldName')
})

test('another snapshot or current-only field definition cannot explain this release', () => {
  expect(() =>
    expandStatisticFieldLineage(
      result.definition,
      result.binding,
      { ...record, snapshotId: 'another-snapshot' },
      definitions,
    ),
  ).toThrow('outside')
  expect(() =>
    expandStatisticFieldLineage(
      result.definition,
      result.binding,
      record,
      new Map([
        [
          `${datasetCode}\0populationMidYear\0current`,
          { ...definition, versionHash: 'current' },
        ],
      ]),
    ),
  ).toThrow('Missing retained')
})
