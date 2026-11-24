import type { Json, ObjectRef, ProvenanceStore } from './types'
import { hashValue, readObject } from './objects'
import { fixtureRowSearchText } from './auditFixtureRows'
import { auditSearchText, matchesAuditText } from './auditSearch'
import { AUDIT_FIXTURE_PAGE_SIZE } from './auditFixturePagination'

export const largeAuditFixture = (refs: ObjectRef[]) =>
  refs.reduce((size, ref) => size + ref.byteLength, 0) > 4 * 1024 * 1024

/** Retain only row digests and one result page, never the complete evidence graph. */
export async function readPartitionedFixture(
  store: ProvenanceStore,
  refs: ObjectRef[],
  query: string,
  offset?: number,
) {
  const seen = new Set<string>()
  const entries: Json[] = []
  let total = 0
  let matched = 0
  let text = ''
  let tabular = false
  const metadata: Record<string, Json> = {}
  for (const ref of refs) {
    const value = await readObject(store, ref)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid partitioned audit fixture.')
    if (!value.auditPartition)
      throw new Error('Large audit fixtures require retained partitions.')
    for (const [key, child] of Object.entries(value))
      if (!['entries', 'decisions', 'auditPartition'].includes(key))
        metadata[key] = child
    const rows = value.entries ?? value.decisions
    if (Array.isArray(rows)) {
      tabular = true
      for (const row of rows) {
        // Canonical hashes preserve exact deduplication without retaining raw rows.
        const key = await hashValue(row)
        if (seen.has(key)) continue
        seen.add(key)
        total++
        if (query.trim() && !matchesAuditText(query, fixtureRowSearchText(row)))
          continue
        if (
          offset !== undefined &&
          matched >= offset &&
          entries.length < AUDIT_FIXTURE_PAGE_SIZE
        )
          entries.push(row)
        matched++
      }
    } else if (text.length < 200_000) {
      text = `${text} ${auditSearchText(value)}`.slice(0, 200_000)
    }
  }
  return {
    group: {
      rows: [],
      text: tabular ? null : text,
      totalRows: total,
      matchingRows: matched,
    },
    value: {
      ...metadata,
      entries,
      fixturePage: {
        offset: offset ?? 0,
        total,
        matched,
        limit: AUDIT_FIXTURE_PAGE_SIZE,
      },
    },
  }
}
