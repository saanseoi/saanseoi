const SQLITE_BUSY_RETRY_LIMIT = 5
const SQLITE_BUSY_RETRY_DELAY_MS = 25
const D1_MAX_SQL_VARIABLES = 99

/**
 * Derives a safe insert batch size from the number of columns per row.
 */
export function getMaxRowsPerInsert(columnCount: number) {
  return Math.max(1, Math.floor(D1_MAX_SQL_VARIABLES / columnCount))
}

/**
 * Splits an array into fixed-size chunks.
 */
export function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

/**
 * Retries transient SQLite write failures with a small linear backoff.
 */
export async function runWithWriteRetry<T>(
  operation: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isRetryableSqliteWriteError(error) || attempt >= SQLITE_BUSY_RETRY_LIMIT) {
      throw error
    }

    await sleep(SQLITE_BUSY_RETRY_DELAY_MS * (attempt + 1))
    return runWithWriteRetry(operation, attempt + 1)
  }
}

/**
 * Detects SQLite lock/busy errors that are usually safe to retry.
 */
export function isRetryableSqliteWriteError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const messages = [error.message]

  if (error.cause instanceof Error) {
    messages.push(error.cause.message)
  }

  return messages.some(message => /sqlite_busy|database is locked/i.test(message))
}

/**
 * Adds a trimmed localized value while keeping per-locale values unique.
 */
export function addLocalizedValue(
  target: Map<string, Set<string>>,
  locale: string,
  value: string,
) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return
  }

  const values = target.get(locale) ?? new Set<string>()
  values.add(normalizedValue)
  target.set(locale, values)
}

/**
 * Normalizes locale keys to lowercase and rejects empty values.
 */
export function normalizeLocale(value?: string | null) {
  const trimmed = value?.trim().toLowerCase()

  return trimmed ? trimmed : null
}

/**
 * Returns a trimmed string or null when the input is empty or not a string.
 */
export function asNonEmptyString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Coerces simple scalar values to strings and drops unsupported inputs.
 */
export function asString(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

/**
 * Serializes JSON after sorting object keys for deterministic comparisons.
 */
export function stableJsonStringify(value: unknown): string | null {
  if (value === undefined) {
    return null
  }

  return JSON.stringify(sortJsonValue(value))
}

/**
 * Recursively sorts object keys for deterministic JSON output.
 */
export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    )
  }

  return value
}

/**
 * Creates a SHA-256 hash for a string or JSON-compatible value.
 */
export async function createHash(value: unknown) {
  const bytes = new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(sortJsonValue(value)),
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Waits for the given number of milliseconds.
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
