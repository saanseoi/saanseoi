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

const text = (v: unknown) => typeof v === 'string' && v.length > 0
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
function exact(value: object, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key)))
    throw new Error('Unexpected audit property.')
}

export function validateAuditManifest(value: unknown): asserts value is AuditManifest {
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
    'chunks',
    'applicationCount',
  ])
  const ids = new Set<string>()
  if (m.individualFixtures !== undefined && !Array.isArray(m.individualFixtures))
    throw new Error('Invalid individual fixture list.')
  for (const fixture of m.individualFixtures ?? []) {
    if (!text(fixture.type)) throw new Error('Invalid individual fixture type.')
    validateRef(fixture.object)
  }
  for (const b of m.bulk) {
    exact(b, ['id', 'definition', 'basis', 'summary', 'outcome', 'counts', 'fixtures'])
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
    exact(b.counts, ['inputs', 'outputs', 'recordsAffected', 'decisions'])
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
  let matched = 0
  for (const ref of manifest.chunks) {
    let matches: Set<string> | null = null
    if (terms.length) {
      const index = (await readObject(store, ref.index)) as unknown as {
        entries: SearchEntry[]
      }
      matches = new Set(
        index.entries.filter(e => terms.every(t => e.text.includes(t))).map(e => e.id),
      )
    }
    const size = matches?.size ?? ref.count
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
    total: matched,
    nextOffset: offset + rows.length < matched ? offset + rows.length : null,
  }
}

export async function verifyAuditResult(
  store: ProvenanceStore,
  manifest: AuditManifest,
) {
  validateAuditManifest(manifest)
  const refs: ObjectRef[] = (manifest.individualFixtures ?? []).map(f => f.object)
  for (const b of manifest.bulk) {
    const definition = (await readObject(store, b.definition)) as unknown as {
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
  }
  const ids = new Set<string>()
  for (const ref of manifest.chunks) {
    const chunk = (await readObject(store, ref)) as unknown as {
      kind: string
      schemaVersion: number
      actions: IndividualAudit[]
    }
    const index = (await readObject(store, ref.index)) as unknown as {
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
      if (ids.has(a.id)) throw new Error('Duplicate individual action.')
      ids.add(a.id)
      refs.push(a.definition)
      if (a.fixture) {
        refs.push(a.fixture.object)
        await readValue(store, { ...a.fixture.object, pointer: a.fixture.pointer })
      }
    }
    if (
      serialise(index.entries) !==
      serialise(chunk.actions.map(a => ({ id: a.id, text: searchText(a) })))
    )
      throw new Error('Audit search index mismatch.')
  }
  for (const ref of refs) await readObject(store, ref)
}

export async function transferAuditResult(
  source: ProvenanceStore,
  destination: ProvenanceStore,
  ref: ObjectRef,
  manifest: AuditManifest,
) {
  await verifyAuditResult(source, manifest)
  const copied = new Set<string>()
  async function copy(r: ObjectRef) {
    if (copied.has(r.hash)) return
    const result = await retainObject(destination, await readObject(source, r))
    if (result.hash !== r.hash || result.byteLength !== r.byteLength)
      throw new Error('Audit transfer mismatch.')
    copied.add(r.hash)
  }
  for (const b of manifest.bulk) {
    await copy(b.definition)
    for (const f of b.fixtures) await copy(f.object)
  }
  for (const fixture of manifest.individualFixtures ?? []) await copy(fixture.object)
  for (const c of manifest.chunks) {
    const chunk = (await readObject(source, c)) as unknown as {
      actions: IndividualAudit[]
    }
    for (const a of chunk.actions) {
      await copy(a.definition)
      if (a.fixture) await copy(a.fixture.object)
    }
    await copy(c.index)
    await copy(c)
  }
  await copy(ref)
  return manifest
}
