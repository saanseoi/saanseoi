import type { MetaDatabase } from '@repo/db'

export type RegistryAccessMetrics = {
  metrics: Record<string, number>
  asOf: string | null
}

export async function getRegistryAccessMetrics(
  db: MetaDatabase,
  scope: 'publisher' | 'source_release' | 'api_release_set',
  entityId: string,
): Promise<RegistryAccessMetrics | null> {
  try {
    const row = await db.$client
      .prepare(
        `SELECT metrics, asOf
         FROM accessAnalyticsRollups
         WHERE period = 'all_time' AND scope = ? AND entityId = ?`,
      )
      .bind(scope, entityId)
      .first<RegistryAccessMetrics>()

    return row?.asOf
      ? {
          metrics:
            typeof row.metrics === 'string'
              ? (JSON.parse(row.metrics) as Record<string, number>)
              : row.metrics,
          asOf: row.asOf,
        }
      : null
  } catch {
    // Analytics are optional presentation data and must not block a release
    // page while the reporting table is absent or being migrated.
    return null
  }
}
