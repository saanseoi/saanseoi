import { preparationUpdatePolicy } from './preparationUpdatePolicy'
import { preparationChecks } from './preparationChecks'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { retainProducerAudit } from '../../api/producerAudit'
import { deliverProducerAudit } from '../../api/producerAuditDelivery'
import type { UploadTarget } from '../../cli/options'

export type PreparationEvidence = {
  rules?: import('./preparationRules').PreparationRuleEvidence
  recordNames?: Array<{ id: string; names: Record<string, string> }>
  definitions: Record<string, unknown>
  inputs: Record<string, number>
  outputs: Record<string, number>
  records: Record<string, unknown>[]
  names: Record<string, unknown>[]
  changes: Record<string, unknown>[]
  islandGroups?: Array<{ divisionId: string; memberIds: string[] }>
  boundaryPatches?: import('./boundaryPatchEvidence').BoundaryPatchEvidence[]
  geometryEvidence: unknown
  updateDecisions: unknown[]
  hierarchySpatialAudit?: import('./hierarchySpatialAudit').HierarchySpatialAudit[]
  nameAliasAudit?: import('./nameAliasAudit').AliasRuleAudit[]
}

/** The source archive freezes this evidence when preparation executes. */
export async function retainCuratedPreparationAudit(
  target: UploadTarget,
  resourceReleaseId: string,
  evidence: PreparationEvidence,
) {
  if (
    !evidence.definitions ||
    !evidence.inputs ||
    !evidence.outputs ||
    !Array.isArray(evidence.records)
  )
    throw Error('Invalid curated preparation evidence; rebuild the source edition.')
  const updatePolicy = preparationUpdatePolicy(evidence)
  const checks = preparationChecks(evidence)
  if (checks.some(check => check.failed))
    throw Error(
      `Preparation validation failed: ${JSON.stringify(checks.filter(check => check.failed))}`,
    )
  const document = JSON.stringify(evidence.definitions)
  const digest = createHash('sha256').update(document).digest('hex')
  // Geometry definitions may exceed one object. Ordered text parts retain exact JSON,
  // including every coordinate, without inventing individual editorial applications.
  const parts: Array<{ ordinal: number; json: string }> = []
  for (let offset = 0; offset < document.length; offset += 65536)
    parts.push({ ordinal: parts.length, json: document.slice(offset, offset + 65536) })
  await deliverProducerAudit({
    target,
    directory: resolve(
      import.meta.dir,
      '../../../../../../.local/curated-divisions/audits',
      target.environment,
      resourceReleaseId,
    ),
    identity: JSON.stringify({
      resourceReleaseId,
      digest: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    }),
    retain: store =>
      retainProducerAudit(store, {
        scope: { stage: 'preparation', ownerId: resourceReleaseId },
        resourceReleaseId,
        datasetCode: 'ds-hk-saanseoi-division',
        rules: [
          updatePolicy.rule,
          ...(evidence.rules
            ? [
                {
                  declaration: evidence.rules.declaration,
                  inputs: { 'overture-divisions': evidence.rules.normalised },
                  outputs: { 'prepared-divisions': evidence.records.length },
                  recordsAffected: evidence.rules.normalised,
                  decisions: {
                    overture_division_hong_kong_area_hierarchy_assigned:
                      evidence.rules.hierarchyAssigned,
                  },
                  branches: evidence.rules.branches,
                },
              ]
            : []),
          {
            declaration: {
              kind: 'processing-rule',
              schemaVersion: 1,
              id: 'prepare-curated-division-edition',
              scope: 'bulk',
              basis: 'fixture',
              summary:
                'Prepare the reviewed SaanSeoi Division edition and its paired geometry.',
              inputs: Object.keys(evidence.inputs),
              outputs: Object.keys(evidence.outputs),
              parameters: { evidenceHash: digest },
              implementation: {
                path: 'apps/harbour-cli/src/lib/pipeline/curatedDivisions/buildRelease.ts',
                symbol: 'buildCuratedDivisionRelease',
              },
            },
            inputs: evidence.inputs,
            outputs: evidence.outputs,
            recordsAffected: evidence.outputs.divisions ?? 0,
            decisions: { prepared: evidence.outputs.divisions ?? 0 },
            fixtures: [
              ...(evidence.hierarchySpatialAudit
                ? [
                    {
                      type: 'hierarchy-spatial-decisions',
                      document: { entries: evidence.hierarchySpatialAudit },
                      arrayKey: 'entries',
                    },
                  ]
                : []),
              ...(evidence.boundaryPatches
                ? [
                    {
                      type: 'boundary-patch-results',
                      document: { entries: evidence.boundaryPatches },
                      arrayKey: 'entries',
                    },
                  ]
                : []),
              ...(evidence.nameAliasAudit
                ? [
                    {
                      type: 'name-alias-results',
                      document: { entries: evidence.nameAliasAudit },
                      arrayKey: 'entries',
                    },
                  ]
                : []),
              {
                type: 'reviewed-updates',
                document: { entries: evidence.updateDecisions },
                arrayKey: 'entries',
              },
              ...(evidence.recordNames
                ? [
                    {
                      type: 'curation-record-names',
                      document: { entries: evidence.recordNames },
                      arrayKey: 'entries',
                    },
                  ]
                : []),
              {
                type: 'curation-definitions',
                document: { encoding: 'ordered-json-text', digest, parts },
                arrayKey: 'parts',
              },
              {
                type: 'prepared-division-changes',
                document: { entries: evidence.changes },
                arrayKey: 'entries',
              },
            ],
          },
        ],
        guards: [...(evidence.rules?.guards ?? []), updatePolicy.guard, ...checks],
      }),
  })
}
