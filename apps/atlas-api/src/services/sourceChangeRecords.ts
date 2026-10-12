import { runWithD1ReadRetry } from '../lib/d1'
import {
  type resolveRecordsRequest,
  type SourceRecordRow,
  sourceReleaseCondition,
  sourceValidityValues,
} from './sourceRecords'

type Resolved = NonNullable<Awaited<ReturnType<typeof resolveRecordsRequest>>>
export type SourceRecordIdentity = Pick<
  SourceRecordRow,
  'sourceRecordId' | 'versionHash'
>
export const SOURCE_CHANGE_SCAN_SIZE = 2048

function mergeRows<T extends SourceRecordIdentity>(pages: T[][]): T[] {
  return [
    ...new Map(
      pages
        .flat()
        .map(row => [JSON.stringify([row.sourceRecordId, row.versionHash]), row]),
    ).values(),
  ].sort((a, b) =>
    a.sourceRecordId < b.sourceRecordId
      ? -1
      : a.sourceRecordId > b.sourceRecordId
        ? 1
        : a.versionHash < b.versionHash
          ? -1
          : a.versionHash > b.versionHash
            ? 1
            : 0,
  )
}

/** Seek by complete record ID: comparisons never resume halfway through a record. */
export async function readSourceChangeIdentities(resolved: Resolved, after?: string) {
  const pages = await Promise.all(
    resolved.sourceDbs.map(async db => {
      const statement = db
        .prepare(`
      SELECT sourceRecordId, versionHash FROM ${resolved.entry.tableName}
      WHERE ${sourceReleaseCondition(resolved.entry)}
        ${after ? 'AND sourceRecordId > ?' : ''}
      ORDER BY sourceRecordId, versionHash LIMIT ?
    `)
        .bind(
          ...sourceValidityValues(resolved),
          ...(after ? [after] : []),
          SOURCE_CHANGE_SCAN_SIZE + 1,
        )
      return (await runWithD1ReadRetry(() => statement.all<SourceRecordIdentity>()))
        .results
    }),
  )
  const rows = mergeRows(pages)
  // Keep a second active version at the boundary so the comparison can reject
  // ambiguous identities instead of skipping it on the next strict-ID seek.
  const duplicateAtBoundary =
    rows[SOURCE_CHANGE_SCAN_SIZE]?.sourceRecordId ===
    rows[SOURCE_CHANGE_SCAN_SIZE - 1]?.sourceRecordId
  return rows.slice(0, SOURCE_CHANGE_SCAN_SIZE + (duplicateAtBoundary ? 1 : 0))
}

/** Fetch payloads only for candidates, with a fixed bound on parameters and memory. */
export async function readSourceChangeRecords(resolved: Resolved, ids: string[]) {
  const rows: SourceRecordRow[] = []
  for (let offset = 0; offset < ids.length; offset += 64) {
    const batch = ids.slice(offset, offset + 64)
    const pages = await Promise.all(
      resolved.sourceDbs.map(async db => {
        const statement = db
          .prepare(`
        SELECT sourceRecordId, versionHash, properties,
          ${resolved.entry.geometryColumn ?? 'NULL'} AS sourceGeometry
        FROM ${resolved.entry.tableName}
        WHERE ${sourceReleaseCondition(resolved.entry)}
          AND sourceRecordId IN (${batch.map(() => '?').join(',')})
      `)
          .bind(...sourceValidityValues(resolved), ...batch)
        return (await runWithD1ReadRetry(() => statement.all<SourceRecordRow>()))
          .results
      }),
    )
    rows.push(...mergeRows(pages))
  }
  return rows
}
