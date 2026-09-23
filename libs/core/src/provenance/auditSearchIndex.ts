import type { AuditManifest } from './auditTypes'
import type { ObjectRef, ProvenanceStore } from './types'
import { readObject, retainObject, serialise, validateRef } from './objects'
import { retainFixturePartitions } from './fixtures'
import { buildAuditPageIndex, type AuditPageIndex } from './auditPageIndex'
import { loadAuditFixtures } from './auditFixtureRows'
import {
  auditFixtureCatalogue,
  type FixtureCatalogue,
  type FixtureSearchGroup,
} from './auditFixtureCatalogue'
import { alsAuditDecisions, type AlsDecision } from './auditAlsDecisions'
import { createBoundedBulkSearchText } from './boundedSearchText'
import { auditSearchText } from './auditSearch'
import { rowKeys } from './auditFixtureRows'
import type { Json } from './types'

type SearchIndex = {
  kind: 'audit-search'
  schemaVersion: 1
  audit: ObjectRef
  releaseCode: string
  actions: ObjectRef[]
  bulk: ObjectRef[]
  groups: Array<{ id: string; type: string; parts: ObjectRef[] }>
  als: ObjectRef[]
  decisions: Array<{ ref: ObjectRef; ids: string[] }>
}

export const auditSearchKey = (hash: string) => {
  if (!/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid audit hash.')
  return `provenance/search/v1/${hash.slice(7)}.json`
}

async function partitions(store: ProvenanceStore, entries: unknown[]) {
  return (await retainFixturePartitions(store, { entries }, 'entries')).map(
    p => p.object,
  )
}
async function entries<T>(store: ProvenanceStore, refs: ObjectRef[]): Promise<T[]> {
  const result: T[] = []
  for (const ref of refs) {
    const value = (await readObject(store, ref)) as unknown as { entries: T[] }
    result.push(...value.entries)
  }
  return result
}

/** Add derived search artefacts without changing an audit or its evidence. */
export async function retainAuditSearchIndex(
  store: ProvenanceStore,
  audit: ObjectRef,
  manifest: AuditManifest,
  releaseCode: string,
) {
  const key = auditSearchKey(audit.hash)
  const existing = await store.get(key)
  if (existing) {
    const index = await readAuditSearchIndex(store, audit.hash)
    if (index.releaseCode !== releaseCode)
      throw new Error('Audit search release mismatch.')
    return index
  }
  const page = await buildAuditPageIndex(store, manifest)
  const index: SearchIndex = {
    kind: 'audit-search',
    schemaVersion: 1,
    audit,
    releaseCode,
    actions: await partitions(store, page.actions),
    bulk: await partitions(
      store,
      page.bulk.flatMap(row => {
        const parts = []
        for (let i = 0; i < row.text.length || i === 0; i += 32_768)
          parts.push({ id: row.id, text: row.text.slice(i, i + 32_768) })
        return parts
      }),
    ),
    groups: [],
    als: [],
    decisions: [],
  }
  const alsFixtures: Record<string, Json> = {}
  for (const bulk of manifest.bulk) {
    for (const type of new Set(bulk.fixtures.map(fixture => fixture.type))) {
      const fixtures = bulk.fixtures.filter(fixture => fixture.type === type)
      let group: FixtureSearchGroup
      let largeNonTabular =
        fixtures.reduce((size, fixture) => size + fixture.object.byteLength, 0) >
          8 * 1024 * 1024 && bulk.id !== 'curate-als-addresses'
      if (largeNonTabular) {
        for (const fixture of fixtures) {
          const value = await readObject(store, fixture.object)
          if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            rowKeys.some(key => Array.isArray(value[key]))
          ) {
            largeNonTabular = false
            break
          }
        }
      }
      if (largeNonTabular) {
        // Large non-tabular evidence is searched through bounded derived text.
        // Its complete, immutable partitions remain available for audit reads.
        const text = createBoundedBulkSearchText()
        const seen = new Set<string>()
        let full = false
        for (const fixture of fixtures) {
          const value = await readObject(store, fixture.object)
          for (const token of auditSearchText(value).split(/\s+/)) {
            if (!token || seen.has(token)) continue
            if (!text.add(token)) {
              full = true
              break
            }
            seen.add(token)
          }
          if (full) break
        }
        group = { rows: [], text: text.text() }
      } else {
        const loaded = await loadAuditFixtures([{ id: bulk.id, fixtures }], (_id, i) =>
          readObject(store, fixtures[i]!.object),
        )
        const value = loaded[bulk.id]![type]!
        if (bulk.id === 'curate-als-addresses') alsFixtures[type] = value
        group = auditFixtureCatalogue(loaded, releaseCode).groups[bulk.id]![type]!
      }
      const parts = await retainFixturePartitions(store, group, 'rows')
      index.groups.push({ id: bulk.id, type, parts: parts.map(p => p.object) })
    }
  }
  const catalogue = auditFixtureCatalogue(
    { 'curate-als-addresses': alsFixtures },
    releaseCode,
  )
  index.als = await partitions(store, catalogue.als)
  const decisions = alsAuditDecisions(alsFixtures, releaseCode)
  for (let i = 0; i < decisions.length; i += 10) {
    const rows = decisions.slice(i, i + 10)
    for (const part of await retainFixturePartitions(
      store,
      { entries: rows },
      'entries',
    )) {
      index.decisions.push({
        ref: part.object,
        ids: rows
          .slice(part.firstOrdinal, part.firstOrdinal + part.count)
          .map(d => d.id),
      })
    }
  }
  const ref = await retainObject(store, index)
  // Publish the pointer last, after every referenced search object is retained.
  await store.put(key, new TextEncoder().encode(serialise(ref)).buffer as ArrayBuffer)
  return index
}

export async function readAuditSearchIndex(
  store: ProvenanceStore,
  hash: string,
): Promise<SearchIndex> {
  const pointer = await store.get(auditSearchKey(hash))
  if (!pointer)
    throw new Error('Audit search index is missing; backfill this retained audit.')
  const ref = JSON.parse(new TextDecoder().decode(await pointer.arrayBuffer()))
  validateRef(ref)
  const index = (await readObject(store, ref)) as unknown as SearchIndex
  if (
    index.kind !== 'audit-search' ||
    index.schemaVersion !== 1 ||
    index.audit.hash !== hash
  )
    throw new Error('Audit search index mismatch.')
  return index
}

export async function readAuditPageIndex(
  store: ProvenanceStore,
  hash: string,
): Promise<AuditPageIndex> {
  const index = await readAuditSearchIndex(store, hash)
  const bulk = new Map<string, string>()
  for (const row of await entries<AuditPageIndex['bulk'][number]>(store, index.bulk))
    bulk.set(row.id, (bulk.get(row.id) ?? '') + row.text)
  return {
    actions: await entries(store, index.actions),
    bulk: [...bulk].map(([id, text]) => ({ id, text })),
  }
}

export async function readAuditFixtureCatalogue(
  store: ProvenanceStore,
  hash: string,
): Promise<FixtureCatalogue> {
  const index = await readAuditSearchIndex(store, hash)
  const groups: FixtureCatalogue['groups'] = {}
  for (const group of index.groups) {
    const value: FixtureSearchGroup = { rows: [], text: null }
    for (const ref of group.parts) {
      const part = (await readObject(store, ref)) as unknown as FixtureSearchGroup
      value.rows.push(...part.rows)
      value.text = part.text
    }
    const tables = groups[group.id] ?? {}
    tables[group.type] = value
    groups[group.id] = tables
  }
  return { groups, als: await entries(store, index.als) }
}

export async function readAuditAlsDecisions(
  store: ProvenanceStore,
  hash: string,
  ids: string[],
): Promise<AlsDecision[]> {
  const index = await readAuditSearchIndex(store, hash)
  const selected = new Set(ids)
  const refs = index.decisions
    .filter(part => part.ids.some(id => selected.has(id)))
    .map(part => part.ref)
  return (await entries<AlsDecision>(store, refs)).filter(row => selected.has(row.id))
}
