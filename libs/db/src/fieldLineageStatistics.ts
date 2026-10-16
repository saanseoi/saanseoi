import {
  statisticFieldSource,
  type StatisticFieldSources,
} from './statisticFieldSources'
import type { LineageDefinition, ReleaseBinding } from './fieldLineageTypes'
import { expandFieldLineage, validateFieldLineageBinding } from './fieldLineageGraph'

type RetainedField = {
  datasetCode: string
  fieldName: string
  sourceField: string
  versionHash: string
}

/** Expand using the same compound field-definition key as the Statistics API reader. */
export function expandStatisticFieldLineage(
  definition: LineageDefinition,
  binding: ReleaseBinding,
  record: {
    snapshotId: string
    datasetCode: string
    values: Record<string, unknown>
    fieldDefinitionHashes: Record<string, string>
    fieldSources: StatisticFieldSources
  },
  definitions: ReadonlyMap<string, RetainedField>,
) {
  validateFieldLineageBinding(definition, binding)
  const field = definition.fields.find(
    field => field.apiField === 'attributes.values.{field}',
  )
  if (!field)
    throw new Error('Selected lineage has no dynamic Statistics values field.')
  const selector = field.dynamicSelectors?.find(
    selector => selector.parameter === 'field',
  )
  const canonical = binding.scopes.find(scope => scope.scopeId === selector?.scopeId)
  if (
    !canonical ||
    ![canonical.snapshotId, ...(canonical.snapshotIds ?? [])].includes(
      record.snapshotId,
    )
  )
    throw new Error(
      'Statistic record is outside the selected lineage snapshot binding.',
    )
  return Object.keys(record.values)
    .sort()
    .map(fieldName => {
      const hash = record.fieldDefinitionHashes[fieldName]
      const retained = hash
        ? definitions.get(`${record.datasetCode}\0${fieldName}\0${hash}`)
        : undefined
      if (
        !retained ||
        retained.datasetCode !== record.datasetCode ||
        retained.fieldName !== fieldName ||
        retained.versionHash !== hash ||
        !retained.sourceField
      )
        throw new Error(`Missing retained Statistics field definition: ${fieldName}`)
      const source = statisticFieldSource(record.fieldSources, fieldName)
      const candidates = definition.scopes.filter(
        scope =>
          scope.kind === 'source-release' &&
          (!scope.resourceType || scope.resourceType === 'divisionStatistic') &&
          scope.datasetCode === record.datasetCode &&
          binding.scopes.some(
            bound =>
              bound.scopeId === scope.id &&
              bound.sourceReleaseId === source?.sourceReleaseId,
          ),
      )
      if (candidates.length !== 1)
        throw new Error(`Ambiguous or missing Statistics source scope: ${fieldName}`)
      return {
        ...expandFieldLineage(definition, field),
        apiField: `attributes.values[${JSON.stringify(fieldName)}]`,
        apiFieldSegments: ['attributes', 'values', fieldName],
        selectorBindings: {
          field: fieldName,
          sourceField: retained.sourceField,
          fieldDefinitionHash: hash,
          selectedSourceScope: candidates[0]!.id,
        },
        sourceFieldPath: ['properties', retained.sourceField],
        sourceFeatureRef: source!.sourceFeatureRef,
        evidence: 'derived-from-retained-definitions' as const,
      }
    })
}
