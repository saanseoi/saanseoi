import { MAX_OBJECT_BYTES, readObject, retainObject, serialise } from './objects'
import { validateApplication, validateManifest } from './validation'
import type {
  Application,
  ApplicationChunk,
  Collection,
  ObjectRef,
  ProcessingManifest,
  ProvenanceStore,
} from './types'

function references(a: Application): ObjectRef[] {
  return [
    a.decision.definition,
    ...a.evidence.map(e => e.object),
    ...a.effects.flatMap(e => (e.after ? [e.after] : [])),
  ]
}

/** Chunks are bounded by both record count and encoded size. */
export async function retainProcessingResult(
  store: ProvenanceStore,
  input: {
    releaseId: string
    collections: Collection[]
    applications: AsyncIterable<Application> | Iterable<Application>
  },
) {
  const manifest: ProcessingManifest = {
    schemaVersion: 1,
    kind: 'processing-result',
    releaseId: input.releaseId,
    collections: input.collections,
    chunks: [],
    applicationCount: 0,
    objects: [],
    summaries: [],
  }
  const dependencies = new Map<string, ObjectRef>()
  const summaries = new Map<string, ProcessingManifest['summaries'][number]>()
  const ids = new Set<string>()
  let pending: Application[] = []
  const envelope = (applications: Application[]): ApplicationChunk => ({
    schemaVersion: 1,
    kind: 'processing-applications',
    applications,
  })
  async function flush() {
    if (!pending.length) return
    const ref = await retainObject(store, envelope(pending))
    manifest.chunks.push({
      ...ref,
      firstOrdinal: manifest.applicationCount,
      count: pending.length,
    })
    manifest.applicationCount += pending.length
    pending = []
  }
  for await (const a of input.applications) {
    validateApplication(a)
    if (ids.has(a.id)) throw new Error(`Duplicate application: ${a.id}`)
    ids.add(a.id)
    for (const ref of references(a)) {
      const previous = dependencies.get(ref.hash)
      if (previous && previous.byteLength !== ref.byteLength)
        throw new Error('Conflicting dependency lengths.')
      dependencies.set(ref.hash, ref)
    }
    const key = JSON.stringify([a.operation, a.outcome])
    const summary = summaries.get(key) ?? {
      operation: a.operation,
      outcome: a.outcome,
      applicationCount: 0,
      effectCount: 0,
    }
    summary.applicationCount++
    summary.effectCount += a.effects.length
    summaries.set(key, summary)
    if (
      pending.length &&
      (pending.length === 256 ||
        new TextEncoder().encode(serialise(envelope([...pending, a]))).length >
          MAX_OBJECT_BYTES)
    )
      await flush()
    pending.push(a)
  }
  await flush()
  manifest.objects = [...dependencies.values()].sort((a, b) =>
    a.hash.localeCompare(b.hash),
  )
  manifest.summaries = [...summaries.values()].sort((a, b) =>
    `${a.operation}:${a.outcome}`.localeCompare(`${b.operation}:${b.outcome}`),
  )
  await verifyProcessingResult(store, manifest)
  return { manifest, ref: await retainObject(store, manifest) }
}

export async function* readApplications(
  store: ProvenanceStore,
  manifest: ProcessingManifest,
  offset = 0,
  limit = manifest.applicationCount,
) {
  validateManifest(manifest)
  if (![offset, limit].every(n => Number.isSafeInteger(n) && n >= 0))
    throw new Error('Invalid provenance page.')
  const end = Math.min(manifest.applicationCount, offset + limit)
  for (const ref of manifest.chunks) {
    if (ref.firstOrdinal >= end || ref.firstOrdinal + ref.count <= offset) continue
    const chunk = (await readObject(store, ref)) as unknown as ApplicationChunk
    if (
      chunk.schemaVersion !== 1 ||
      chunk.kind !== 'processing-applications' ||
      !Array.isArray(chunk.applications) ||
      chunk.applications.length !== ref.count
    )
      throw new Error('Invalid application chunk.')
    for (const [i, a] of chunk.applications.entries()) {
      validateApplication(a)
      if (ref.firstOrdinal + i >= offset && ref.firstOrdinal + i < end) yield a
    }
  }
}

/** Publication verifies the complete closure, not just the top-level manifest hash. */
export async function verifyProcessingResult(
  store: ProvenanceStore,
  manifest: ProcessingManifest,
) {
  validateManifest(manifest)
  const dependencies = new Map(manifest.objects.map(o => [o.hash, o]))
  for (const ref of manifest.objects) await readObject(store, ref)
  const collections = new Map(manifest.collections.map(c => [c.id, c.layer]))
  const ids = new Set<string>()
  const totals = new Map<string, { applicationCount: number; effectCount: number }>()
  for await (const a of readApplications(store, manifest)) {
    if (ids.has(a.id)) throw new Error('Duplicate application identity.')
    ids.add(a.id)
    for (const ref of references(a))
      if (dependencies.get(ref.hash)?.byteLength !== ref.byteLength)
        throw new Error('Unlisted provenance dependency.')
    for (const i of a.inputs)
      if (!collections.has(i.collection)) throw new Error('Unknown input collection.')
    for (const e of a.effects)
      if (collections.get(e.target.collection) !== 'canonical')
        throw new Error('Source mutation or unknown output collection.')
    for (const f of a.fields) {
      if (
        collections.get(f.output.collection) !== 'canonical' ||
        f.inputs.some(i => !collections.has(i.collection))
      )
        throw new Error('Unknown field lineage collection.')
    }
    const key = JSON.stringify([a.operation, a.outcome])
    const total = totals.get(key) ?? { applicationCount: 0, effectCount: 0 }
    total.applicationCount++
    total.effectCount += a.effects.length
    totals.set(key, total)
  }
  if (totals.size !== manifest.summaries.length)
    throw new Error('Incorrect provenance summaries.')
  for (const s of manifest.summaries) {
    const key = JSON.stringify([s.operation, s.outcome])
    const total = totals.get(key)
    if (
      !total ||
      total.applicationCount !== s.applicationCount ||
      total.effectCount !== s.effectCount
    )
      throw new Error('Incorrect provenance summary counts.')
    totals.delete(key)
  }
}
