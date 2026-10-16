export type Approval = { revision: string; signedAt: string }
export type Signoffs = Record<string, Approval>
export const signoffStorageKey = 'ingestion-review-signoffs-v1'
export function viewKey(kind: string, group: string, table: string, subset = '') {
  return JSON.stringify([kind, group, table, subset])
}
export function isApproved(signoffs: Signoffs, key: string, revision: string) {
  return Boolean(revision && signoffs[key]?.revision === revision)
}
export function readSignoffs(value: string | null): Signoffs {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, approval]) => {
        try {
          const parts: unknown = JSON.parse(key)
          return (
            Array.isArray(parts) &&
            parts.length === 4 &&
            parts.every(p => typeof p === 'string') &&
            approval &&
            typeof approval === 'object' &&
            typeof approval.revision === 'string' &&
            typeof approval.signedAt === 'string'
          )
        } catch {
          return false
        }
      }),
    )
  } catch {
    return {}
  }
}
