import {
  and,
  eq,
  inArray,
  metaAccessAnalyticsRollups,
  type MetaDatabase,
} from '@repo/db'

export type RegistryAccessMetrics = {
  metrics: Record<string, number>
  asOf: string | null
}

export type RegistryAccessMetricsInput = {
  scope: 'publisher' | 'dataset' | 'source_release' | 'api_release_set'
  entityId: string
}

const D1_ACCESS_METRICS_BATCH_SIZE = 90

export async function getRegistryAccessMetricsBatch(
  db: MetaDatabase,
  inputs: readonly RegistryAccessMetricsInput[],
) {
  const entityIds = [...new Set(inputs.map(input => input.entityId))]
  const batches: string[][] = []
  for (let index = 0; index < entityIds.length; index += D1_ACCESS_METRICS_BATCH_SIZE) {
    batches.push(entityIds.slice(index, index + D1_ACCESS_METRICS_BATCH_SIZE))
  }

  try {
    const rows = (
      await Promise.all(
        batches.map(ids =>
          db
            .select({
              asOf: metaAccessAnalyticsRollups.asOf,
              entityId: metaAccessAnalyticsRollups.entityId,
              metrics: metaAccessAnalyticsRollups.metrics,
              scope: metaAccessAnalyticsRollups.scope,
            })
            .from(metaAccessAnalyticsRollups)
            .where(
              and(
                eq(metaAccessAnalyticsRollups.period, 'all_time'),
                inArray(metaAccessAnalyticsRollups.entityId, ids),
              ),
            )
            .all(),
        ),
      )
    ).flat()
    const byEntity = new Map(
      rows.map(row => [
        `${row.scope}\u0000${row.entityId}`,
        { metrics: row.metrics, asOf: row.asOf } satisfies RegistryAccessMetrics,
      ]),
    )

    return inputs.map(
      input => byEntity.get(`${input.scope}\u0000${input.entityId}`) ?? null,
    )
  } catch {
    // Analytics are optional presentation data and must not block a release
    // page while the reporting table is absent or being migrated.
    return inputs.map(() => null)
  }
}

export async function getRegistryAccessMetrics(
  db: MetaDatabase,
  scope: 'publisher' | 'dataset' | 'source_release' | 'api_release_set',
  entityId: string,
): Promise<RegistryAccessMetrics | null> {
  return (await getRegistryAccessMetricsBatch(db, [{ scope, entityId }]))[0] ?? null
}
