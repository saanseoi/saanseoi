import { z } from '@hono/zod-openapi'
import { jsonFieldDiff } from '@repo/core/jsonFieldDiff'
import { recordContent } from '@repo/core/pipeline/services/sources/recordContent.ts'
import type { AppBindings, AppEnv } from '../types'
import type { AccessAttribution } from './accessAnalytics'
import type { SourceChangesQuery, SourceChangesResponse } from '../schema/sourceChanges'
import {
  readSourceRecordPage,
  resolveRecordsRequest,
  toSourceRecord,
  type SourceFamily,
  type SourceRecordRow,
} from './sourceRecords'

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
  const records: SourceChangesResponse['records'] = []
  let after = cursor?.after
  const batchSize = 64
  // Keep reads bounded, but fill the page with matching changes. One matching
  // lookahead establishes whether a continuation actually exists.
  while (records.length <= query.limit) {
    const read = (resolved: NonNullable<typeof from>) =>
      readSourceRecordPage({
        ...resolved,
        cursor: after ? { sourceRecordId: after, versionHash: '\uffff' } : null,
        includeGeometry: true,
        limit: batchSize,
        random: false,
      })
    const [oldRows, newRows] = await Promise.all([read(from), read(to)])
    const ends = [oldRows, newRows]
      .filter(rows => rows.length === batchSize)
      .map(rows => rows.at(-1)!.sourceRecordId)
      .sort()
    const end = ends[0]
    const index = (rows: SourceRecordRow[]) => {
      const map = new Map<string, SourceRecordRow>()
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
    const old = index(oldRows),
      current = index(newRows)
    const ids = [...new Set([...old.keys(), ...current.keys()])]
      .sort()
      .filter(id => !end || id <= end)
    for (const id of ids) {
      after = id
      const left = old.get(id),
        right = current.get(id)
      if (left && right && left.versionHash === right.versionHash) {
        continue
      }
      const type = !left ? 'added' : !right ? 'removed' : 'changed'
      if (query.type && query.type !== type) continue
      const before = left
        ? toSourceRecord(left, from.release, from.entry, true, args.family)
        : null
      const afterRecord = right
        ? toSourceRecord(right, to.release, to.entry, true, args.family)
        : null
      const fields = jsonFieldDiff(recordContent(before), recordContent(afterRecord))
      if (type === 'changed' && !fields.length) {
        continue
      }
      records.push({ sourceRecordId: id, type, before, after: afterRecord, fields })
      if (records.length > query.limit) break
    }
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
