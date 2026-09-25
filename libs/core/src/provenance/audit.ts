import {
  collectCurationApplication,
  resolveCurationApplication,
  validateCurationApplications,
  curationApplicationId,
  type CurationApplication,
} from './curationApplications'
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
import { createBoundedBulkSearchText } from './boundedSearchText'
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
    !text(m.resourceReleaseId) ||
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
    'resourceReleaseId',
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
    if (c.firstOrdinal !== total || !count(c.count) || c.count === 0 || c.count > 256)
      throw new Error('Invalid audit chunk range.')
    total += c.count
  }
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
  if (a.basis !== 'fixture' || !a.fixture)
    throw new Error(
      'Individual audit entries require a record-specific fixture decision; automatic rules must use bulk counts.',
    )
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
  const text = createBoundedBulkSearchText()
  const seen = new Set<string>()
  const append = (value: string) => {
    for (const token of value
      .normalize('NFKC')
      .toLowerCase()
      .split(/[\s"{},:[\]]+/)) {
      if (!token || seen.has(token)) continue
      if (!text.add(token)) return false
      seen.add(token)
    }
    return true
  }
  if (!append(`${bulk.id} ${bulk.summary}`)) return text.text()
  if (!append(serialise(await readObject(store, bulk.definition)))) return text.text()
  for (const fixture of bulk.fixtures)
    if (!append(serialise(await readObject(store, fixture.object)))) break
  return text.text()
}

/** Retain definitions once and only reference/count reviewed applications. */
export async function retainAuditResult(
  store: ProvenanceStore,
  input: Omit<
    AuditManifest,
    'kind' | 'schemaVersion' | 'chunks' | 'applicationCount'
  > & {
    individuals: Iterable<IndividualAudit> | AsyncIterable<IndividualAudit>
  },
) {
  const { individuals, ...metadata } = input
  const applications = new Map<string, CurationApplication>()
  for await (const action of individuals) {
    validateIndividual(action)
    collectCurationApplication(applications, action)
  }
  const manifest: AuditManifest = {
    kind: 'processing-audit',
    schemaVersion: 1,
    ...metadata,
    chunks: [],
    applicationCount: 0,
  }
  // Search and presentation are read-time work, never publication artefacts.
  for (const bulk of manifest.bulk) delete bulk.search
  const rows = [...applications.values()].sort((a, b) =>
    curationApplicationId(a).localeCompare(curationApplicationId(b)),
  )
  for (let offset = 0; offset < rows.length; offset += 256) {
    const entries = rows.slice(offset, offset + 256)
    const ref = await retainObject(store, {
      kind: 'curation-applications',
      schemaVersion: 1,
      applications: entries,
    })
    manifest.chunks.push({ ...ref, firstOrdinal: offset, count: entries.length })
    manifest.applicationCount += entries.reduce(
      (sum, row) => sum + row.applicationCount,
      0,
    )
  }
  await verifyAuditResult(store, manifest)
  return { manifest, ref: await retainObject(store, manifest) }
}

export async function readCurationChunk(store: ProvenanceStore, ref: ObjectRef) {
  const entries = validateCurationApplications(await readObject(store, ref))
  return {
    actions: await Promise.all(
      entries.map(entry => resolveCurationApplication(store, entry)),
    ),
  }
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
  let total = 0
  for (const ref of manifest.chunks) {
    for (const action of (await readCurationChunk(store, ref)).actions) {
      if (filter?.category && auditActionCategory(action) !== filter.category) continue
      if (
        filter?.fixture &&
        (action.fixture?.object.hash !== filter.fixture.hash ||
          action.fixture.pointer !== filter.fixture.pointer)
      )
        continue
      const searchable =
        `${searchText(action)} ${action.reason} ${serialise(action.context)}`
          .normalize('NFKC')
          .toLowerCase()
      if (!terms.every(term => searchable.includes(term))) continue
      if (total >= offset && rows.length < limit) rows.push(action)
      total++
    }
  }
  const bulkIds: string[] = []
  for (const bulk of manifest.bulk)
    if (
      !terms.length ||
      terms.every(term => `${bulk.id} ${bulk.summary}`.toLowerCase().includes(term))
    ) {
      bulkIds.push(bulk.id)
    } else {
      const searchable = await bulkSearchText(store, bulk)
      if (terms.every(term => searchable.includes(term))) bulkIds.push(bulk.id)
    }
  return {
    rows,
    bulkIds,
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
  }
}

export async function readAuditDecision(
  store: ProvenanceStore,
  manifest: AuditManifest,
  id: string,
) {
  validateAuditManifest(manifest)
  for (const ref of manifest.chunks) {
    const entries = validateCurationApplications(await readObject(store, ref))
    const entry = entries.find(entry => curationApplicationId(entry) === id)
    if (entry)
      return {
        declaration: await readObject(store, entry.definition),
        fixture: await readValue(store, {
          ...entry.fixture.object,
          pointer: entry.fixture.pointer,
        }),
      }
  }
  throw new Error('Individual action is not declared by this release.')
}

export async function verifyAuditResult(
  store: ProvenanceStore,
  manifest: AuditManifest,
) {
  validateAuditManifest(manifest)
  const reader = createProvenanceReader(store)
  for (const fixture of manifest.individualFixtures ?? [])
    await reader.read(fixture.object)
  if (manifest.apiFields) await reader.read(manifest.apiFields)
  for (const bulk of manifest.bulk) {
    const definition = (await reader.read(bulk.definition)) as unknown as {
      id: string
      scope: string
      basis: string
      inputs?: string[]
    }
    if (
      definition.id !== bulk.id ||
      definition.scope !== 'bulk' ||
      definition.basis !== bulk.basis
    )
      throw new Error('Bulk rule declaration mismatch.')
    if (
      bulk.basis === 'code' &&
      bulk.fixtures.some(
        f => f.type !== 'identity-mappings' || !definition.inputs?.includes(f.type),
      )
    )
      throw new Error(
        'Automatic audit rules retain declarations and counts, not record evidence fixtures.',
      )
    for (const fixture of bulk.fixtures) await reader.read(fixture.object)
  }
  let count = 0
  const seen = new Set<string>()
  for (const ref of manifest.chunks) {
    const entries = validateCurationApplications(await reader.read(ref))
    if (entries.length !== ref.count) throw new Error('Invalid curation chunk count.')
    for (const entry of entries) {
      validateRef(entry.definition)
      validateRef(entry.fixture.object)
      const key = curationApplicationId(entry)
      if (seen.has(key)) throw new Error('Duplicate curation application.')
      seen.add(key)
      const definition = (await reader.read(entry.definition)) as unknown as {
        basis: string
      }
      if (definition.basis !== 'fixture')
        throw new Error('Curation requires a fixture-based declaration.')
      await reader.value({ ...entry.fixture.object, pointer: entry.fixture.pointer })
      count += entry.applicationCount
    }
  }
  if (count !== manifest.applicationCount)
    throw new Error('Incorrect curation application count.')
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
  for (const bulk of manifest.bulk)
    dependencies.push(bulk.definition, ...bulk.fixtures.map(f => f.object))
  dependencies.push(...(manifest.individualFixtures ?? []).map(f => f.object))
  if (manifest.apiFields) dependencies.push(manifest.apiFields)
  for (const chunk of manifest.chunks) {
    dependencies.push(chunk)
    for (const entry of validateCurationApplications(await readObject(source, chunk)))
      dependencies.push(entry.definition, entry.fixture.object)
  }
  await transferObjects(source, destination, dependencies, options.concurrency ?? 1)
  await transferObjects(source, destination, [ref], 1)
  return manifest
}
