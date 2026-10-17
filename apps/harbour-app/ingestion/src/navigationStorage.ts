export const navigationStorageKey = 'ingestion-review-navigation-v1'
export const columnSortStorageKey = 'ingestion-review-column-sort-v1'
export type ReviewNavigationSelection = {
  kind: string
  group: string
  table: string
  subset: string
  limit: number
}
export function readNavigation(value: string | null): ReviewNavigationSelection | null {
  try {
    const saved = JSON.parse(value ?? 'null')
    if (
      !saved ||
      !['META', 'CURRENT', 'HISTORY', 'SOURCE'].includes(saved.kind) ||
      !['group', 'table', 'subset'].every(key => typeof saved[key] === 'string') ||
      ![4, 8, 12, 20, 30].includes(saved.limit)
    )
      return null
    return {
      kind: saved.kind,
      group: saved.group,
      table: saved.table,
      subset: saved.subset,
      limit: saved.limit,
    }
  } catch {
    return null
  }
}
export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Optional preferences must not prevent reviewing when storage is unavailable.
  }
}
