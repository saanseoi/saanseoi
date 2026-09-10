import {
  MAX_OBJECT_BYTES,
  readObject,
  readValue,
  retainObject,
  serialise,
  validateRef,
} from './objects'
import type { AuditManifest, IndividualAudit } from './auditTypes'
import type { ObjectRef, ProvenanceStore } from './types'
import { createProvenanceReader } from './cache'
import type { BulkAudit } from './auditTypes'
import { auditActionCategory } from './auditTypes'
import { auditManifestSchema, individualAuditSchema } from './auditSchema'
import { validateShape } from './schema'
import { transferObjects } from './transferObjects'

const text = (v: unknown) => typeof v === 'string' && v.length > 0
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
function exact(value: object, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)))
    throw new Error('Unexpected audit property.')
}

export function validateAuditManifest(value: unknown): asserts value is AuditManifest {
  validateShape(value, auditManifestSchema)
  const m = value as AuditManifest
  if (
    m?.kind !== 'processing-audit' ||
    m.schemaVersion !== 1 ||
    !text(m.releaseId) ||
    !text(m.datasetCode) ||
    !m.attempt ||
    !text(m.attempt.id) ||
    !['completed', 'failed'].includes(m.attempt.status) ||
    !Array.isArray(m.bulk) ||
    !Array.isArray(m.guards) ||
    !Array.isArray(m.chunks) ||
    !count(m.applicationCount)
  )
    throw new Error('Invalid audit manifest.')
  exact(m, [
    'kind',
    'schemaVersion',
    'releaseId',
    'datasetCode',
    'attempt',
    'bulk',
    'guards',
    'individualFixtures',
    'apiFields',
    'chunks',
    'applicationCount',
  ])
  const ids = new Set<string>()
  if (m.apiFields) validateRef(m.apiFields)
  if (m.individualFixtures !== undefined && !Array.isArray(m.individualFixtures))
    throw new Error('Invalid individual fixture list.')
  for (const fixture of m.individualFixtures ?? []) {
    if (!text(fixture.type)) throw new Error('Invalid individual fixture type.')
    validateRef(fixture.object)
  }
  for (const b of m.bulk) {
    exact(b, [
      'id',
      'definition',
      'basis',
      'summary',
      'outcome',
      'counts',
      'fixtures',
      'search',
    ])
    if (
      !text(b.id) ||
      ids.has(b.id) ||
      !text(b.summary) ||
      !['code', 'fixture'].includes(b.basis) ||
      !['applied', 'not-applicable', 'not-run'].includes(b.outcome) ||
      !Array.isArray(b.fixtures)
    )
      throw new Error('Invalid bulk audit.')
    ids.add(b.id)
    validateRef(b.definition)
    if (b.search) validateRef(b.search)
    exact(b.counts, ['inputs', 'outputs', 'recordsAffected', 'decisions', 'branches'])
    if (b.counts.branches !== undefined) {
      if (!isObject(b.counts.branches)) throw new Error('Invalid branch counts.')
      for (const [id, branch] of Object.entries(b.counts.branches)) {
        if (
          !text(id) ||
          !isObject(branch) ||
          !count(branch.matched) ||
          !count(branch.changed) ||
          branch.changed > branch.matched
        )
          throw new Error('Invalid branch counts.')
        exact(branch, ['matched', 'changed'])
      }
    }
    if (
      !count(b.counts.recordsAffected) ||
      ![b.counts.inputs, b.counts.outputs, b.counts.decisions].every(
        c => isObject(c) && Object.values(c).every(count),
      )
    )
      throw new Error('Invalid bulk counts.')
    for (const f of b.fixtures) {
      if (!text(f.type)) throw new Error('Invalid fixture type.')
      validateRef(f.object)
    }
  }
  ids.clear()
  for (const g of m.guards) {
    if (
      !text(g.id) ||
      ids.has(g.id) ||
      !text(g.summary) ||
      !['block-ingestion', 'report'].includes(g.consequence) ||
      !['passed', 'failed', 'not-applicable', 'not-run'].includes(g.status) ||
      !count(g.checked) ||
      !count(g.failed) ||
      g.failed > g.checked ||
      (g.status === 'passed' && g.failed !== 0) ||
      (g.status === 'failed' && g.failed === 0)
    )
      throw new Error('Invalid audit guard.')
    ids.add(g.id)
    if (
      m.attempt.status === 'completed' &&
      g.status === 'failed' &&
      g.consequence === 'block-ingestion'
    )
      throw new Error('Completed audit contains a failed blocking guard.')
  }
  let total = 0
  for (const c of m.chunks) {
    validateRef(c)
    validateRef(c.index)
    if (c.firstOrdinal !== total || !count(c.count) || c.count === 0 || c.count > 256)
      throw new Error('Invalid audit chunk range.')
    total += c.count
  }
  if (total !== m.applicationCount)
    throw new Error('Incorrect individual action count.')
}

function validateIndividual(a: IndividualAudit) {
  validateShape(a, individualAuditSchema)
  if (
    !a ||
    !text(a.id) ||
    !text(a.operation) ||
    !text(a.summary) ||
    !text(a.reason) ||
    !['code', 'fixture'].includes(a.basis) ||
    !['applied', 'no-change', 'unmatched', 'skipped', 'guard-mismatch'].includes(
      a.outcome,
    ) ||
    !a.record ||
    !text(a.record.id) ||
    !Array.isArray(a.record.names) ||
    !a.record.names.every(text) ||
    !Array.isArray(a.record.parents) ||
    !a.record.parents.every(
      p => text(p.id) && Array.isArray(p.names) && p.names.every(text),
    ) ||
    !isObject(a.context)
  )
    throw new Error('Invalid individual audit.')
  validateRef(a.definition)
  if (a.review && a.basis !== 'fixture')
    throw new Error('Review origins require a reviewed fixture.')
  if (a.basis === 'fixture' && !a.fixture)
    throw new Error('Individual curation requires a retained fixture.')
  if (a.fixture) {
    validateRef(a.fixture.object)
    if (typeof a.fixture.pointer !== 'string')
      throw new Error('Invalid fixture pointer.')
  }
}

const searchText = (a: IndividualAudit) =>
  [
    a.operation,
    a.outcome,
    a.summary,
    a.record.id,
    ...a.record.names,
    ...a.record.parents.flatMap(p => [p.id, ...p.names]),
  ]
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
type SearchEntry = { id: string; text: string }

async function bulkSearchText(store: ProvenanceStore, bulk: BulkAudit) {
  const values = [
    bulk.id,
    bulk.summary,
    serialise(await readObject(store, bulk.definition)),
  ]
  for (const fixture of bulk.fixtures)
    values.push(serialise(await readObject(store, fixture.object)))
  const tokens = [
    ...new Set(
      values
        .join(' ')
        .normalize('NFKC')
        .toLowerCase()
        .split(/[\s"{},:[\]]+/)
        .filter(Boolean),
    ),
  ]
  // Search text is derived metadata. Keep it bounded when a large retained
  // fixture is split across many provenance objects; the complete fixture
  // partitions remain available for exact audit reads.
  const encoder = new TextEncoder()
  let bounded = ''
  for (const token of tokens) {
    const next = bounded ? `${bounded} ${token}` : token
    const candidate = serialise({
      kind: 'bulk-search',
      schemaVersion: 1,
      text: next,
    })
    if (encoder.encode(candidate).length > MAX_OBJECT_BYTES) break
    bounded = next
  }
  return bounded
}

export async function retainAuditResult(
  store: ProvenanceStore,
  input: Omit<
    AuditManifest,
    'kind' | 'schemaVersion' | 'chunks' | 'applicationCount'
  > & { individuals: Iterable<IndividualAudit> | AsyncIterable<IndividualAudit> },
) {
  const { individuals, ...metadata } = input
  const manifest: AuditManifest = {
    kind: 'processing-audit',
    schemaVersion: 1,
    ...metadata,
    chunks: [],
    applicationCount: 0,
  }
  let pending: IndividualAudit[] = []
  for (const bulk of manifest.bulk)
    bulk.search = await retainObject(store, {
      kind: 'bulk-search',
      schemaVersion: 1,
      text: await bulkSearchText(store, bulk),
    })
  const ids = new Set<string>()
  const envelope = (actions: IndividualAudit[]) => ({
    kind: 'individual-actions',
    schemaVersion: 1,
    actions,
  })
  const index = (actions: IndividualAudit[]) => ({
    kind: 'individual-search',
    schemaVersion: 1,
    entries: actions.map(a => ({ id: a.id, text: searchText(a) })),
  })
  const fits = (actions: IndividualAudit[]) =>
    [envelope(actions), index(actions)].every(
      v => new TextEncoder().encode(serialise(v)).length <= MAX_OBJECT_BYTES,
    )
  async function flush() {
    if (!pending.length) return
    manifest.chunks.push({
      ...(await retainObject(store, envelope(pending))),
      firstOrdinal: manifest.applicationCount,
      count: pending.length,
      index: await retainObject(store, index(pending)),
    })
    manifest.applicationCount += pending.length
    pending = []
  }
  for await (const a of individuals) {
    validateIndividual(a)
    if (ids.has(a.id)) throw new Error('Duplicate individual action.')
    ids.add(a.id)
    if (!fits([a])) throw new Error('Individual action exceeds retention limit.')
    if (pending.length === 256 || !fits([...pending, a])) await flush()
    pending.push(a)
  }
  await flush()
  await verifyAuditResult(store, manifest)
  return { manifest, ref: await retainObject(store, manifest) }
}

export async function readAuditPage(
  store: ProvenanceStore,
  manifest: AuditManifest,
  query = '',
  offset = 0,
  limit = 50,
  filter?: {
    category?: ReturnType<typeof auditActionCategory>
    fixture?: { hash: string; pointer: string }
  },
) {
  validateAuditManifest(manifest)
  if (!count(offset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 256)
    throw new Error('Invalid audit page.')
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const rows: IndividualAudit[] = []
  const bulkIds: string[] = []
  if (terms.length)
    for (const bulk of manifest.bulk) {
      const search = bulk.search
        ? ((await readObject(store, bulk.search)) as unknown as { text: string })
        : { text: `${bulk.id} ${bulk.summary}`.toLowerCase() }
      if (terms.every(term => search.text.includes(term))) bulkIds.push(bulk.id)
    }
  else bulkIds.push(...manifest.bulk.map(b => b.id))
  let matched = 0
  for (const ref of manifest.chunks) {
    let matches: Set<string> | null = null
    if (terms.length && !filter?.category && !filter?.fixture) {
      const index = (await readObject(store, ref.index)) as unknown as {
        entries: SearchEntry[]
      }
      matches = new Set(
        index.entries.filter(e => terms.every(t => e.text.includes(t))).map(e => e.id),
      )
    }
    const size = matches?.size ?? ref.count
    if (filter?.category || filter?.fixture) {
      if (matches?.size === 0) continue
      const chunk = (await readObject(store, ref)) as unknown as {
        actions: IndividualAudit[]
      }
      for (const action of chunk.actions) {
        if (matches && !matches.has(action.id)) continue
        if (filter.category && auditActionCategory(action) !== filter.category) continue
        const searchable =
          `${searchText(action)} ${action.reason} ${serialise(action.context)} ${auditActionCategory(action)}`
            .normalize('NFKC')
            .toLowerCase()
        if (!terms.every(term => searchable.includes(term))) continue
        if (
          filter.fixture &&
          (action.fixture?.object.hash !== filter.fixture.hash ||
            action.fixture.pointer !== filter.fixture.pointer)
        )
          continue
        if (matched >= offset && rows.length < limit) rows.push(action)
        matched++
      }
      continue
    }
    if (matched + size <= offset || matched >= offset + limit) {
      matched += size
      continue
    }
    const chunk = (await readObject(store, ref)) as unknown as {
      actions: IndividualAudit[]
    }
    for (const a of chunk.actions) {
      if (matches && !matches.has(a.id)) continue
      if (matched >= offset && rows.length < limit) rows.push(a)
      matched++
    }
  }
  return {
    rows,
    bulkIds,
    total: matched,
    nextOffset: offset + rows.length < matched ? offset + rows.length : null,
  }
}

/** Resolve an individual through its registered index, never an arbitrary object hash. */
export async function readAuditDecision(
  store: ProvenanceStore,
  manifest: AuditManifest,
  id: string,
) {
  validateAuditManifest(manifest)
  for (const ref of manifest.chunks) {
    const index = (await readObject(store, ref.index)) as unknown as {
      entries: SearchEntry[]
    }
    if (!index.entries.some(entry => entry.id === id)) continue
    const chunk = (await readObject(store, ref)) as unknown as {
      actions: IndividualAudit[]
    }
    const action = chunk.actions.find(action => action.id === id)
    if (!action)
      throw new Error('Individual audit index does not resolve to its action.')
    return {
      declaration: await readObject(store, action.definition),
      fixture: action.fixture
        ? await readValue(store, {
            ...action.fixture.object,
            pointer: action.fixture.pointer,
          })
        : null,
    }
  }
  throw new Error('Individual action is not declared by this release.')
}

export async function verifyAuditResult(
  store: ProvenanceStore,
  manifest: AuditManifest,
) {
  const reader = createProvenanceReader(store)
  validateAuditManifest(manifest)
  const refs: ObjectRef[] = (manifest.individualFixtures ?? []).map(f => f.object)
  if (manifest.apiFields) refs.push(manifest.apiFields)
  for (const b of manifest.bulk) {
    const definition = (await reader.read(b.definition)) as unknown as {
      id: string
      scope: string
      basis: string
    }
    if (
      definition.id !== b.id ||
      definition.scope !== 'bulk' ||
      definition.basis !== b.basis
    )
      throw new Error('Bulk rule declaration mismatch.')
    refs.push(...b.fixtures.map(f => f.object))
    if (b.search) {
      const search = (await reader.read(b.search)) as unknown as {
        kind: string
        schemaVersion: number
        text: string
      }
      if (
        search.kind !== 'bulk-search' ||
        search.schemaVersion !== 1 ||
        search.text !== (await bulkSearchText(store, b))
      )
        throw new Error('Bulk search index mismatch.')
    }
  }
  const ids = new Set<string>()
  for (const ref of manifest.chunks) {
    const chunk = (await reader.read(ref)) as unknown as {
      kind: string
      schemaVersion: number
      actions: IndividualAudit[]
    }
    const index = (await reader.read(ref.index)) as unknown as {
      kind: string
      schemaVersion: number
      entries: SearchEntry[]
    }
    if (
      chunk.kind !== 'individual-actions' ||
      chunk.schemaVersion !== 1 ||
      !Array.isArray(chunk.actions) ||
      chunk.actions.length !== ref.count ||
      index.kind !== 'individual-search' ||
      index.schemaVersion !== 1
    )
      throw new Error('Invalid individual chunk.')
    for (const a of chunk.actions) {
      validateIndividual(a)
      const definition = (await reader.read(a.definition)) as unknown as {
        review?: unknown
      }
      if (serialise(definition.review ?? null) !== serialise(a.review ?? null))
        throw new Error('Individual review origin does not match its retained rule.')
      if (ids.has(a.id)) throw new Error('Duplicate individual action.')
      ids.add(a.id)
      refs.push(a.definition)
      if (a.fixture) {
        refs.push(a.fixture.object)
        await reader.value({ ...a.fixture.object, pointer: a.fixture.pointer })
      }
    }
    if (
      serialise(index.entries) !==
      serialise(chunk.actions.map(a => ({ id: a.id, text: searchText(a) })))
    )
      throw new Error('Audit search index mismatch.')
  }
  for (const ref of refs) await reader.read(ref)
}

export async function transferAuditResult(
  source: ProvenanceStore,
  destination: ProvenanceStore,
  ref: ObjectRef,
  manifest: AuditManifest,
  options: { concurrency?: number } = {},
) {
  await verifyAuditResult(source, manifest)
  const dependencies: ObjectRef[] = []
  for (const b of manifest.bulk) {
    dependencies.push(b.definition)
    if (b.search) dependencies.push(b.search)
    for (const f of b.fixtures) dependencies.push(f.object)
  }
  for (const fixture of manifest.individualFixtures ?? [])
    dependencies.push(fixture.object)
  if (manifest.apiFields) dependencies.push(manifest.apiFields)
  for (const c of manifest.chunks) {
    const chunk = (await readObject(source, c)) as unknown as {
      actions: IndividualAudit[]
    }
    for (const a of chunk.actions) {
      dependencies.push(a.definition)
      if (a.fixture) dependencies.push(a.fixture.object)
    }
    dependencies.push(c.index, c)
  }
  await transferObjects(source, destination, dependencies, options.concurrency ?? 1)
  await transferObjects(source, destination, [ref], 1)
  return manifest
}
