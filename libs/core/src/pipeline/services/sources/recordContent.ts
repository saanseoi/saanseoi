/** Bookkeeping metadata does not define a new record-content version. */
const observationKeys = new Set([
  'version',
  'sourceVersion',
  'source_version',
  'updateTime',
  'update_time',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'timestamp',
])

/** Preserve business dates, dependency hashes and binary geometry unchanged. */
export function recordContent<T>(value: T): T {
  if (Array.isArray(value)) return value.map(recordContent) as T
  if (!value || typeof value !== 'object') return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !observationKeys.has(key))
      .map(([key, item]) => [key, recordContent(item)]),
  ) as T
}
