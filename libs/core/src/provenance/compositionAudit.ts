import { retainAuditResult } from './audit'
import { retainObject } from './objects'
import type { ProvenanceStore } from './types'

/** Retain selection evidence; composition does not claim to edit canonical records. */
export async function retainCompositionAudits(
  store: ProvenanceStore,
  ownerId: string,
  sources: Array<{
    resourceReleaseId: string
    datasetCode: string
    producerSnapshotId: string
  }>,
  selection: unknown,
) {
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'select-api-release-set-snapshots',
    scope: 'bulk',
    basis: 'code',
    summary: 'Select canonical snapshots for the API release set.',
    inputs: ['canonical-snapshots'],
    outputs: ['release-set-memberships'],
    parameters: { selection },
    implementation: {
      path: 'libs/core/src/lib/db/metaRegistry.ts',
      symbol: 'publishReleaseArtefacts',
    },
  })
  const rows = []
  for (const source of new Map(
    sources.map(row => [row.resourceReleaseId, row]),
  ).values()) {
    const count = new Set(
      sources
        .filter(row => row.resourceReleaseId === source.resourceReleaseId)
        .map(row => row.producerSnapshotId),
    ).size
    const retained = await retainAuditResult(store, {
      scope: { stage: 'composition', ownerId },
      resourceReleaseId: source.resourceReleaseId,
      datasetCode: source.datasetCode,
      attempt: { id: ownerId, status: 'completed' },
      bulk: [
        {
          id: 'select-api-release-set-snapshots',
          basis: 'code',
          summary: 'Select canonical snapshots for the API release set.',
          definition,
          outcome: 'applied',
          fixtures: [],
          counts: {
            inputs: { 'canonical-snapshots': count },
            outputs: { 'release-set-memberships': count },
            recordsAffected: 0,
            decisions: { selected: count },
          },
        },
      ],
      individuals: [],
      guards: [],
    })
    rows.push({
      resourceReleaseId: source.resourceReleaseId,
      stage: 'composition' as const,
      ownerId,
      manifestHash: retained.ref.hash,
      byteLength: retained.ref.byteLength,
      applicationCount: retained.manifest.applicationCount,
      attemptStatus: 'completed' as const,
    })
  }
  return rows
}
