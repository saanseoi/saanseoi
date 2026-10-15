import { z } from '@hono/zod-openapi'
import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import { recordContent } from '@repo/core/pipeline/services/sources/recordContent.ts'
import type { AppBindings, AppEnv } from '../types'
import type { AccessAttribution } from './accessAnalytics'
import type { SourceChangesQuery, SourceChangesResponse } from '../schema/sourceChanges'
import {
  resolveRecordsRequest,
  toSourceRecord,
  type SourceFamily,
} from './sourceRecords'
import {
  readSourceChangeIdentities,
  readSourceChangeRecords,
  SOURCE_CHANGE_SCAN_SIZE,
  type SourceRecordIdentity,
} from './sourceChangeRecords'

export class SourceChangesError extends Error {
  constructor(
    public status: 404 | 409 | 422,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
const cursorSchema = z
  .object({
    version: z.literal(1),
    from: z.string(),
    to: z.string(),
    type: z.string(),
    after: z.string(),
  })
  .strict()
function decodeCursor(value?: string) {
  if (!value) return null
  try {
    return cursorSchema.parse(JSON.parse(decodeURIComponent(atob(value))))
  } catch {
    throw new SourceChangesError(
      422,
      'invalid_cursor',
      'The source change cursor is invalid.',
    )
  }
}

/** Batched merge of exact retained source versions, including cross-year shards. */
export async function listSourceChanges(args: {
  env: AppBindings
  metaDb: AppEnv['Variables']['metaDb']
  family: SourceFamily
  query: SourceChangesQuery
  onResolved?: (attribution: AccessAttribution) => void
}): Promise<SourceChangesResponse> {
  const { query } = args
  const cursorType = query.type ?? 'all'
  const cursor = decodeCursor(query.cursor)
  const [from, to] = await Promise.all([
    resolveRecordsRequest({
      ...args,
      region: query.region,
      resourceType: query.resourceType,
      sourceReleaseCode: query.fromRelease,
    }),
    resolveRecordsRequest({
      ...args,
      region: query.region,
      resourceType: query.resourceType,
      sourceReleaseCode: query.toRelease,
    }),
  ])
  if (!from || !to)
    throw new SourceChangesError(
      404,
      'source_comparison_unavailable',
      'Both resource releases and their source shards must be retained and published.',
    )
  if (
    from.release.datasetId !== to.release.datasetId ||
    from.release.resourceType !== to.release.resourceType
  )
    throw new SourceChangesError(
      409,
      'incompatible_resources',
      'Compare releases of the same dataset and resource type.',
    )
  if (from.release.sourceVersion >= to.release.sourceVersion)
    throw new SourceChangesError(
      422,
      'invalid_release_order',
      'The baseline must precede the target resource release.',
    )
  const pin = {
    datasetCode: to.release.datasetCode,
    resourceType: to.release.resourceType,
    fromRelease: from.release.resourceReleaseId,
    toRelease: to.release.resourceReleaseId,
  }
  if (
    cursor &&
    (cursor.from !== pin.fromRelease ||
      cursor.to !== pin.toRelease ||
      cursor.type !== cursorType)
  )
    throw new SourceChangesError(
      422,
      'cursor_comparison_mismatch',
      'The cursor belongs to a different resource comparison or filter.',
    )
  args.onResolved?.({
    datasetId: to.release.datasetId,
    publisherCodes: [to.release.publisherCode],
    sourceReleaseCode: to.release.sourceReleaseCode,
    sourceReleaseId: to.release.sourceReleaseId,
    surface: 'source',
  })
  if (query.view === 'summary') {
    if (query.cursor)
      throw new SourceChangesError(
        422,
        'invalid_cursor',
        'Summary requests do not accept a cursor.',
      )
    return {
      pin,
      records: [],
      nextCursor: null,
      summary: await summariseComparison(from, to, args.family),
    }
  }
  const records: SourceChangesResponse['records'] = []
  let after = cursor?.after
  const batchSize = SOURCE_CHANGE_SCAN_SIZE
  const index = <T extends SourceRecordIdentity>(rows: T[]) => {
    const map = new Map<string, T>()
    for (const row of rows) {
      if (map.has(row.sourceRecordId))
        throw new SourceChangesError(
          409,
          'ambiguous_source_identity',
          'Multiple retained versions are active for one source record.',
        )
      map.set(row.sourceRecordId, row)
    }
    return map
  }
  // Keep reads bounded, but fill the page with matching changes. One matching
  // lookahead establishes whether a continuation actually exists.
  while (records.length <= query.limit) {
    const [oldRows, newRows] = await Promise.all([
      readSourceChangeIdentities(from, after),
      readSourceChangeIdentities(to, after),
    ])
    const ends = [oldRows, newRows]
      .filter(rows => rows.length >= batchSize)
      .map(rows => rows.at(-1)!.sourceRecordId)
      .sort()
    const end = ends[0]
    const old = index(oldRows),
      current = index(newRows)
    const ids = [...new Set([...old.keys(), ...current.keys()])]
      .sort()
      .filter(id => !end || id <= end)
    const candidates = ids.filter(id => {
      const left = old.get(id),
        right = current.get(id)
      if (left && right && left.versionHash === right.versionHash) return false
      const type = !left ? 'added' : !right ? 'removed' : 'changed'
      return !query.type || query.type === type
    })
    for (
      let offset = 0;
      offset < candidates.length && records.length <= query.limit;
    ) {
      const batch = candidates.slice(offset, offset + query.limit + 1 - records.length)
      offset += batch.length
      const [beforeRows, afterRows] = await Promise.all([
        readSourceChangeRecords(
          from,
          batch.filter(id => old.has(id)),
        ),
        readSourceChangeRecords(
          to,
          batch.filter(id => current.has(id)),
        ),
      ])
      const beforeIndex = index(beforeRows),
        afterIndex = index(afterRows)
      for (const id of batch) {
        const left = beforeIndex.get(id),
          right = afterIndex.get(id)
        // Do not turn concurrent retention changes into invented additions/removals.
        if (
          left?.versionHash !== old.get(id)?.versionHash ||
          right?.versionHash !== current.get(id)?.versionHash
        )
          throw new SourceChangesError(
            409,
            'source_comparison_changed',
            'Source records changed during comparison. Retry the request.',
          )
        const type = !left ? 'added' : !right ? 'removed' : 'changed'
        const before = left
          ? toSourceRecord(left, from.release, from.entry, true, args.family)
          : null
        const afterRecord = right
          ? toSourceRecord(right, to.release, to.entry, true, args.family)
          : null
        const fields = jsonFieldDiff(recordContent(before), recordContent(afterRecord))
        if (type === 'changed' && !fields.length) continue
        records.push({ sourceRecordId: id, type, before, after: afterRecord, fields })
      }
    }
    after = ids.at(-1) ?? after
    if (!end) break
  }
  const hasMore = records.length > query.limit
  const pageRecords = records.slice(0, query.limit)
  const lastReturnedId = pageRecords.at(-1)?.sourceRecordId
  return {
    pin,
    records: pageRecords,
    nextCursor:
      hasMore && lastReturnedId
        ? btoa(
            encodeURIComponent(
              JSON.stringify({
                version: 1,
                from: pin.fromRelease,
                to: pin.toRelease,
                type: cursorType,
                after: lastReturnedId,
              }),
            ),
          )
        : null,
  }
}

type Resolved = NonNullable<Awaited<ReturnType<typeof resolveRecordsRequest>>>

/** Count retained records, independently of projection counts and page filters. */
async function summariseComparison(from: Resolved, to: Resolved, family: SourceFamily) {
  const summary = {
    count: 0,
    added_count: 0,
    changed_count: 0,
    removed_count: 0,
    unchanged_count: 0,
  }
  let after: string | undefined
  const index = (rows: SourceRecordIdentity[]) => {
    const result = new Map<string, SourceRecordIdentity>()
    for (const row of rows) {
      if (result.has(row.sourceRecordId))
        throw new SourceChangesError(
          409,
          'ambiguous_source_identity',
          'Multiple retained versions are active for one source record.',
        )
      result.set(row.sourceRecordId, row)
    }
    return result
  }
  while (true) {
    const [oldRows, newRows] = await Promise.all([
      readSourceChangeIdentities(from, after),
      readSourceChangeIdentities(to, after),
    ])
    const end = [oldRows, newRows]
      .filter(rows => rows.length >= SOURCE_CHANGE_SCAN_SIZE)
      .map(rows => rows.at(-1)!.sourceRecordId)
      .sort()[0]
    const old = index(oldRows),
      current = index(newRows)
    const ids = [...new Set([...old.keys(), ...current.keys()])]
      .sort()
      .filter(id => !end || id <= end)
    const changed: string[] = []
    for (const id of ids) {
      const left = old.get(id),
        right = current.get(id)
      if (right) summary.count++
      if (!left) summary.added_count++
      else if (!right) summary.removed_count++
      else if (left.versionHash === right.versionHash) summary.unchanged_count++
      else changed.push(id)
    }
    // Only possible semantic changes need payload reads. Ignore observation-only
    // differences exactly as the paginated records comparison does.
    for (let offset = 0; offset < changed.length; offset += 64) {
      const batch = changed.slice(offset, offset + 64)
      const [beforeRows, afterRows] = await Promise.all([
        readSourceChangeRecords(from, batch),
        readSourceChangeRecords(to, batch),
      ])
      const before = new Map(beforeRows.map(row => [row.sourceRecordId, row]))
      const currentRows = new Map(afterRows.map(row => [row.sourceRecordId, row]))
      for (const id of batch) {
        const left = before.get(id),
          right = currentRows.get(id)
        if (
          !left ||
          !right ||
          left.versionHash !== old.get(id)?.versionHash ||
          right.versionHash !== current.get(id)?.versionHash
        )
          throw new SourceChangesError(
            409,
            'source_comparison_changed',
            'Source records changed during comparison. Retry the request.',
          )
        const fields = jsonFieldDiff(
          recordContent(toSourceRecord(left, from.release, from.entry, true, family)),
          recordContent(toSourceRecord(right, to.release, to.entry, true, family)),
        )
        if (fields.length) summary.changed_count++
        else summary.unchanged_count++
      }
    }
    if (!end) return summary
    after = ids.at(-1) ?? after
  }
}
