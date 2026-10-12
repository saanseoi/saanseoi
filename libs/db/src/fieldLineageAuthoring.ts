import type { ApiFieldFixture } from './apiFieldFixtures'
import { resolveApiResponseFields } from './apiResponseFields'
import { compileFieldLineage } from './fieldLineageCompiler'

/** Synthetic authoring graphs are resource-scoped and must never be published. */
export function compileAuthoringFieldLineage(fixture: ApiFieldFixture) {
  return [...new Set(fixture.fields.map(field => field.resourceType))].map(
    resourceType => {
      const fields = fixture.fields.filter(field => field.resourceType === resourceType)
      const datasets = [...new Set(fields.map(field => field.sourceDatasetCode))]
      const sourceResourceType = resourceType.startsWith('statistic')
        ? 'divisionStatistic'
        : resourceType
      const { definition } = compileFieldLineage(
        fields.map(field => ({
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
          apiReleaseSetId: 'authoring-only',
          apiVersionReleaseSetId: 'authoring-only',
          responseDefinition: resolveApiResponseFields(
            fixture.apiVersion,
            fixture.schemaVersion,
          ),
          sources: datasets.map(datasetCode => ({
            sourceDatasetId: datasetCode,
            datasetCode,
            resourceType: sourceResourceType,
            sourceSchemaVersion: fixture.publisherSchemaRanges[datasetCode]!.min,
            resourceReleaseId: `authoring-${datasetCode}-${sourceResourceType}`,
            processingRules: null,
          })),
          snapshots: [
            {
              resourceType: sourceResourceType,
              snapshotId: `authoring-${sourceResourceType}`,
            },
          ],
        },
      )
      return { fields, definition }
    },
  )
}
