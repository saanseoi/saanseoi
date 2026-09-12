import { createHash } from '@repo/core/pipeline/utils'
import type { PreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadTypes'
import { decodeStoredGeoJsonGeometry } from './processLocalDivisionGeometrySqlUploadStatistics'

/** Publication assertions advance independently of unchanged canonical content. */
export async function reusePlanningCanonicalProvenance(
  records: PreparedDivision[],
  previous: Array<Record<string, unknown>>,
) {
  const byId = new Map(previous.map(row => [row.id, row]))
  const unchangedBaseIds = new Set<string>()
  for (const record of records) {
    const before = byId.get(record.base.id)
    if (!before || !before.geometry || typeof before.versionHash !== 'string') continue
    const fields = Object.keys(record.base)
    const comparable = (row: Record<string, unknown>) =>
      Object.fromEntries(
        fields.map(field => [
          field,
          field === 'geometry'
            ? decodeStoredGeoJsonGeometry(row[field])
            : field === 'sources'
              ? withoutPublicationVersion(row[field])
              : (row[field] ?? null),
        ]),
      )
    if (
      (await createHash(comparable(record.base))) !==
      (await createHash(comparable(before)))
    )
      continue
    record.base.sources = before.sources as PreparedDivision['base']['sources']
    unchangedBaseIds.add(record.base.id)
    record.versionHash = await createHash({
      base: record.base,
      i18n: record.i18n.toSorted((a, b) => a.locale.localeCompare(b.locale)),
    })
  }
  return unchangedBaseIds
}

function withoutPublicationVersion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPublicationVersion)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'sourceVersion')
        .map(([key, item]) => [key, withoutPublicationVersion(item)]),
    )
  return value
}
