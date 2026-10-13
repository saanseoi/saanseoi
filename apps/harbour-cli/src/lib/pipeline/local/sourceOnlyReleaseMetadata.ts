import {
  buildSourceChurnCounts,
  type SourceChurnRecord,
} from '@repo/core/pipeline/services/sources/sourceChurn'
import { buildChurnStatsRows } from '@repo/core/pipeline/services/metrics/releaseStats'
import type { LocalD1ExecBinding } from '../../dbCache/localDbCacheTypes'

/** Source-only releases still need discoverable SOURCE shards and release facts. */
export async function prepareSourceOnlyReleaseMetadata(
  meta: LocalD1ExecBinding,
  sources: LocalD1ExecBinding[],
  input: {
    datasetCode: 'ds-hk-protomaps-island' | 'ds-hk-hkgov-rvd-division'
    resourceReleaseId: string
    sourceVersion: string
    sourceBindingName: string
    environment: 'preview' | 'production'
  },
) {
  const contract =
    input.datasetCode === 'ds-hk-protomaps-island'
      ? {
          label: 'Protomaps',
          table: 'protomapsIslandFeatures',
          geometry: 'sourceGeometry',
        }
      : { label: 'RVD', table: 'hkgovRvdAreas', geometry: 'NULL AS sourceGeometry' }
  const { results: shards } = await meta
    .prepare(
      "SELECT id FROM dataShards WHERE bindingName = ? AND environment = ? AND shardType = 'source' AND status = 'active'",
    )
    .bind(input.sourceBindingName, input.environment)
    .all()
  if (shards.length !== 1)
    throw new Error(`${contract.label} release requires one active source shard.`)
  const { results: previous } = await meta
    .prepare(
      `SELECT previous.sourceVersion FROM resourceReleaseDetails current
     JOIN resourceReleaseDetails previous ON previous.datasetId = current.datasetId AND previous.resourceType = current.resourceType
     WHERE current.id = ? AND previous.sourceVersion < ?
       AND previous.status IN ('current', 'archived') AND previous.revokedAt IS NULL
     ORDER BY previous.sourceVersion DESC LIMIT 1`,
    )
    .bind(input.resourceReleaseId, input.sourceVersion)
    .all()
  async function snapshot(version?: string) {
    const records = new Map<string, SourceChurnRecord>()
    if (!version) return records
    for (const source of sources) {
      const { results } = await source
        .prepare(
          `SELECT sourceRecordId, properties, ${contract.geometry} FROM ${contract.table}
         WHERE validFromRelease <= ? AND (validToRelease IS NULL OR validToRelease > ?)`,
        )
        .bind(version, version)
        .all()
      for (const row of results) {
        const id = String(row.sourceRecordId)
        if (records.has(id))
          throw new Error(
            `Ambiguous ${contract.label} source history at ${version}: ${id}`,
          )
        records.set(id, {
          properties: row.properties,
          sourceGeometry: row.sourceGeometry,
        })
      }
    }
    if (!records.size)
      throw new Error(`Missing retained ${contract.label} records at ${version}`)
    return records
  }
  const current = await snapshot(input.sourceVersion)
  const churn = buildSourceChurnCounts(
    await snapshot(previous[0]?.sourceVersion as string | undefined),
    current,
  )
  // Each source retains its own assertion kinds; these are not canonical division types.
  const kinds = new Map<string, number>()
  for (const row of current.values()) {
    const properties =
      typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties
    const kind = String((properties as { kind?: string })?.kind ?? 'unknown')
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
  }
  const rows = [
    ...buildChurnStatsRows({ totals: churn.totals, byType: new Map() }),
    {
      category: 'records',
      measure: 'count',
      unit: 'count',
      value: current.size,
      dimension: null,
      dimensionValue: null,
    },
    ...[...kinds].map(([kind, value]) => ({
      category: 'records',
      measure: 'count',
      unit: 'count',
      value,
      dimension: 'type',
      dimensionValue: kind,
    })),
  ]
  return {
    assignment: {
      resourceReleaseId: input.resourceReleaseId,
      dataShardId: shards[0]!.id,
    },
    stats: rows.map(row => ({
      ...row,
      id: crypto.randomUUID(),
      resourceReleaseId: input.resourceReleaseId,
      apiReleaseSetId: null,
    })),
    totals: churn.totals,
  }
}
