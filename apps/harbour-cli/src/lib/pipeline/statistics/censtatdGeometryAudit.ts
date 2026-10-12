import type { HarbourReadableDb } from '@repo/core/db/types'
import type { ProvenanceStore, RuleDeclaration } from '@repo/core/provenance'
import { censtatdGeometryId } from '@repo/core/pipeline/services/sources/censtatdGeometry'
import { prepareCachedArtefact } from '../local/preparedArtefact'
import { retainProducerAudit } from '../../api/producerAudit'
import { inspectCenstatdGeometryReuse } from './censtatdGeometryStorage'

export const censtatdGeometryRule: RuleDeclaration = {
  kind: 'processing-rule',
  schemaVersion: 1,
  id: 'reuse-censtatd-statistics-geometry',
  scope: 'bulk',
  basis: 'code',
  summary:
    'Retain release-owned statistics with references to content-identical source geometry in the same yearly shard. DivisionArea publication separately checks canonical identity, geometry and publication context before reusing a snapshot.',
  inputs: ['statistic-geometry-references'],
  outputs: ['new-geometries', 'reused-geometries', 'geometry-references'],
  parameters: {
    identity: 'SHA-256 of canonical source geometry JSON',
    reuseScope: 'yearly SOURCE shard',
    divisionAreaPublication: 'Not performed by statistics ingestion',
    divisionAreaReuse:
      'Requires matching canonical IDs, Division IDs, geometry, type, land and territorial flags, cohort, region and variant, and a completed publication receipt',
    derivatives:
      'Keyed by geometry ID, transform and transform context including coverage geometry IDs and engine settings',
  },
  implementation: {
    path: 'apps/harbour-cli/src/lib/pipeline/statistics/censtatdGeometryAudit.ts',
    symbol: 'prepareCenstatdGeometryAudit',
  },
}

/** Seal the pre-write baseline: retries must not count their own inserts as reuse. */
export async function prepareCenstatdGeometryAudit(input: {
  directory: string
  db: HarbourReadableDb
  rows: Array<{ sourceGeometry: unknown }>
  resourceReleaseId: string
  datasetCode: string
  sourceVersion: string
}) {
  const [counts] = await prepareCachedArtefact({
    directory: input.directory,
    inputs: {
      contract: 'censtatd-geometry-audit-v1',
      resourceReleaseId: input.resourceReleaseId,
      datasetCode: input.datasetCode,
      sourceVersion: input.sourceVersion,
      geometryIds: input.rows.map(row => censtatdGeometryId(row.sourceGeometry)),
    },
    generate: async () => [await inspectCenstatdGeometryReuse(input.db, input.rows)],
  })
  if (!counts) throw new Error('Missing C&SD geometry audit baseline.')
  return counts
}

export async function retainCenstatdGeometryAudit(
  store: ProvenanceStore,
  input: {
    resourceReleaseId: string
    datasetCode: string
    counts: Awaited<ReturnType<typeof prepareCenstatdGeometryAudit>>
  },
) {
  const { counts } = input
  return retainProducerAudit(store, {
    scope: { stage: 'ingestion', ownerId: input.resourceReleaseId },
    resourceReleaseId: input.resourceReleaseId,
    datasetCode: input.datasetCode,
    rules: [
      {
        declaration: censtatdGeometryRule,
        inputs: { 'statistic-geometry-references': counts.references },
        outputs: {
          'new-geometries': counts.created,
          'reused-geometries': counts.reused,
          'geometry-references': counts.references,
        },
        recordsAffected: counts.references,
        decisions: { created: counts.created, reused: counts.reused },
      },
    ],
    guards: [],
  })
}
