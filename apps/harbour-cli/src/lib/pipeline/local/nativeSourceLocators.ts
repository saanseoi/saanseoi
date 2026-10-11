import { sourceLocatorFromReferences } from '@repo/core/pipeline/services/sources/sourcePayload'

/** Table-wide acquisition coordinates are retained once in the META processing receipt. */
export function nativeSourceLocatorDefaults(
  rows: Array<{ sourceRecordId: string; sources?: unknown }>,
  archiveObjectKey?: string,
) {
  const locators = rows.map(
    row =>
      sourceLocatorFromReferences(row.sources, {
        sourceRecordId: row.sourceRecordId,
        archiveObjectKey,
      }) ?? {},
  )
  const first = locators[0] ?? {}
  return Object.fromEntries(
    Object.entries(first).filter(([key, value]) =>
      locators.every(locator => JSON.stringify(locator[key]) === JSON.stringify(value)),
    ),
  )
}
