export type ProductionReview = {
  kind: string
  group: string
  groupLabel: string
  table: string
  markedAt: string
}
export type ProductionReviews = Record<string, ProductionReview>
export const productionReviewStorageKey = 'ingestion-review-production-v1'
export function tableKey(kind: string, group: string, table: string) {
  return JSON.stringify([kind, group, table])
}
export function needsProductionReview(
  reviews: ProductionReviews,
  kind: string,
  group: string,
  table: string,
) {
  return Boolean(reviews[tableKey(kind, group, table)])
}
export function readProductionReviews(value: string | null): ProductionReviews {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, entry]) => {
        if (!entry || typeof entry !== 'object') return false
        const record = entry as Record<string, unknown>
        return (
          ['META', 'CURRENT', 'HISTORY', 'SOURCE'].includes(String(record.kind)) &&
          ['kind', 'group', 'groupLabel', 'table', 'markedAt'].every(
            field => typeof record[field] === 'string',
          ) &&
          key ===
            tableKey(String(record.kind), String(record.group), String(record.table))
        )
      }),
    )
  } catch {
    return {}
  }
}
