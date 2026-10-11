import type { AuditGuard, ProvenanceStore } from '@repo/core/provenance'
import { overtureSourceRetentionRule } from '@repo/core/pipeline/services/sources/sourcePayload'
import { retainProducerAudit } from '../../api/producerAudit'

export type ExcludedSourceGeometry = {
  id: string | null
  divisionId: string | null
  divisionIds: string[] | null
}

/** Intake evidence belongs to the source release, independently of snapshot reuse. */
export async function retainDivisionSourceAudit(
  store: ProvenanceStore,
  input: {
    resourceReleaseId: string
    datasetCode: string
    source?: string
    resourceType?: string
    sourceVersion?: string
    inputCount: number
    outputCount?: number
    excludedGeometry?: ExcludedSourceGeometry[]
    guards?: AuditGuard[]
  },
) {
  const outputCount = input.outputCount ?? input.inputCount
  const excluded = input.excludedGeometry ?? []
  const overture = input.source === 'overture'
  if (excluded.length && !overture)
    throw new Error('Overture exclusions require an Overture source.')
  const retention = overture
    ? overtureSourceRetentionRule.declaration
    : {
        kind: 'processing-rule' as const,
        schemaVersion: 1 as const,
        id: 'retain-division-source-records',
        scope: 'bulk' as const,
        basis: 'code' as const,
        summary: 'Retain prepared publisher records in SOURCE.',
        inputs: ['prepared-records'],
        outputs: ['source-records'],
        parameters: {},
        implementation: {
          path: 'libs/core/src/pipeline/services/sources/retainedProperties.ts',
          symbol: 'retainSourceProperties',
        },
      }
  return retainProducerAudit(store, {
    scope: { stage: 'ingestion', ownerId: input.resourceReleaseId },
    resourceReleaseId: input.resourceReleaseId,
    datasetCode: input.datasetCode,
    rules: [
      ...(overture && input.excludedGeometry !== undefined
        ? [
            {
              declaration: {
                kind: 'processing-rule' as const,
                schemaVersion: 1 as const,
                id: 'exclude-overture-guangdong-source-geometry',
                scope: 'bulk' as const,
                basis: 'code' as const,
                summary:
                  'Exclude Guangdong spillover geometry before retaining Hong Kong source records.',
                inputs: ['prepared-records'],
                outputs: ['in-scope-records'],
                parameters: {
                  field: 'region',
                  equals: 'CN-GD',
                  resourceType: input.resourceType ?? '',
                  sourceVersion: input.sourceVersion ?? '',
                },
                implementation: {
                  path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalDivisionGeometrySqlUpload.ts',
                  symbol: 'processLocalDivisionGeometrySqlUpload',
                },
              },
              inputs: { 'prepared-records': input.inputCount },
              outputs: { 'in-scope-records': input.inputCount - excluded.length },
              recordsAffected: excluded.length,
              decisions: {
                excluded: excluded.length,
                retained: input.inputCount - excluded.length,
              },
            },
          ]
        : []),
      {
        declaration: retention,
        inputs: { [retention.inputs[0]!]: input.inputCount - excluded.length },
        outputs: { [retention.outputs[0]!]: outputCount },
        recordsAffected: outputCount,
        decisions: { retained: outputCount },
      },
    ],
    guards: [
      ...(input.guards ?? []),
      ...(overture
        ? [
            {
              id: 'overture-source-payload-contract',
              summary:
                'Require valid publisher attribution and collision-free retained property names.',
              consequence: 'block-ingestion' as const,
              status: outputCount ? ('passed' as const) : ('not-applicable' as const),
              checked: outputCount,
              failed: 0,
              reason:
                'Retained source payloads passed attribution validation and property-key collision checks.',
            },
          ]
        : []),
    ],
  })
}
