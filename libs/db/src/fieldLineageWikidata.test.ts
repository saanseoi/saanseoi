import { expect, test } from 'bun:test'
import { listApiFieldFixtures } from './apiFieldFixtures'
import { resolveApiResponseFields } from './apiResponseFields'
import { compileFieldLineage } from './fieldLineageCompiler'

// Check both native Overture and prepared SaanSeoi Wikidata provenance.
for (const fixture of listApiFieldFixtures().filter(
  f => f.domainCode === 'geographic' && f.apiVersion.startsWith('api-divisions-'),
)) {
  test(`Wikidata identifier lineage ${fixture.apiVersion}/${fixture.domainCode}/${fixture.mappingVersion}`, () => {
    const datasets = [
      ...new Set(
        fixture.fields
          .filter(field => field.apiField === 'attributes.identifiers.wikidata.id')
          .map(field => field.sourceDatasetCode),
      ),
    ]
    const resources = [
      ...new Set(
        fixture.fields.map(field =>
          field.resourceType.startsWith('statistic')
            ? 'divisionStatistic'
            : field.resourceType,
        ),
      ),
    ]
    const result = compileFieldLineage(
      fixture.fields
        .filter(field => field.apiField === 'attributes.identifiers.wikidata.id')
        .map(field => ({
          ...field,
          variant: field.variant ?? null,
          confidence: field.confidence ?? null,
          sourceDatasetId: field.sourceDatasetCode,
          resolverRules: [],
        })),
      new Map(Object.entries(fixture.publisherFields)),
      {
        api: {
          version: fixture.apiVersion,
          responseSchemaVersion: fixture.schemaVersion,
          responseSchemaHash: fixture.responseFieldsVersionHash,
        },
        apiReleaseSetId: 'test-release',
        apiVersionReleaseSetId: 'test-version-release',
        responseDefinition: resolveApiResponseFields(
          fixture.apiVersion,
          fixture.schemaVersion,
        ),
        sources: datasets.map(datasetCode => ({
          sourceDatasetId: datasetCode,
          datasetCode,
          resourceType: 'division',
          sourceSchemaVersion: fixture.publisherSchemaRanges[datasetCode]!.min,
          resourceReleaseId: `test-source-${datasetCode}`,
          processingRules: null,
        })),
        snapshots: resources.map(resourceType => ({
          resourceType,
          snapshotId: `test-snapshot-${resourceType}`,
        })),
      },
    )
    const f = result.definition.fields.find(f => f.apiField.includes('wikidata'))!
    expect(f.completeness).toBe('complete')
  })
}
