import type { AuditManifest, IndividualAudit } from './auditTypes'
import { auditActionCategory } from './auditTypes'
import type { ProvenanceStore } from './types'
import { readObject } from './objects'

const normalise = (text: string) => text.normalize('NFKC').toLowerCase()
type ActionSearch = {
  id: string
  chunk: number
  text: string
  category: ReturnType<typeof auditActionCategory>
  fixture: IndividualAudit['fixture']
}
export type AuditPageIndex = {
  actions: ActionSearch[]
  bulk: Array<{ id: string; text: string }>
}

/** Derived search cache for category, evidence-context and fixture-pointer queries. */
export async function buildAuditPageIndex(
  store: ProvenanceStore,
  manifest: AuditManifest,
): Promise<AuditPageIndex> {
  const actions: ActionSearch[] = []
  for (const [chunk, ref] of manifest.chunks.entries()) {
    const value = (await readObject(store, ref)) as unknown as {
      actions: IndividualAudit[]
    }
    for (const action of value.actions)
      actions.push({
        id: action.id,
        chunk,
        category: auditActionCategory(action),
        fixture: action.fixture,
        text: normalise(
          [
            action.operation,
            action.outcome,
            action.summary,
            action.record.id,
            ...action.record.names,
            ...action.record.parents.flatMap(p => [p.id, ...p.names]),
            action.reason,
            JSON.stringify(action.context),
            auditActionCategory(action),
          ].join(' '),
        ),
      })
  }
  const bulk = []
  for (const item of manifest.bulk) {
    const value = item.search
      ? ((await readObject(store, item.search)) as unknown as { text: string })
      : { text: normalise(`${item.id} ${item.summary}`) }
    bulk.push({ id: item.id, text: value.text })
  }
  return { actions, bulk }
}

/** Read action payloads only for the requested page, using cached search metadata. */
export async function readIndexedAuditPage(
  store: ProvenanceStore,
  manifest: AuditManifest,
  index: AuditPageIndex,
  query = '',
  offset = 0,
  limit = 50,
  filter?: {
    countOnly?: boolean
    category?: ReturnType<typeof auditActionCategory>
    fixture?: { hash: string; pointer: string }
  },
) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 256
  )
    throw new Error('Invalid audit page.')
  const terms = normalise(query).trim().split(/\s+/).filter(Boolean)
  const matches = (text: string) => terms.every(term => text.includes(term))
  const matching = index.actions.filter(
    row =>
      (!filter?.category || row.category === filter.category) &&
      (!filter?.fixture ||
        (row.fixture?.object.hash === filter.fixture.hash &&
          row.fixture.pointer === filter.fixture.pointer)) &&
      matches(row.text),
  )
  const page = filter?.countOnly ? [] : matching.slice(offset, offset + limit)
  const rows: IndividualAudit[] = []
  for (const chunk of new Set(page.map(row => row.chunk))) {
    const ref = manifest.chunks[chunk]
    if (!ref) throw new Error('Audit search index references an unknown chunk.')
    const value = (await readObject(store, ref)) as unknown as {
      actions: IndividualAudit[]
    }
    const ids = new Set(page.filter(row => row.chunk === chunk).map(row => row.id))
    rows.push(...value.actions.filter(action => ids.has(action.id)))
  }
  if (rows.length !== page.length)
    throw new Error('Audit search index does not resolve to its actions.')
  return {
    rows,
    bulkIds: index.bulk.filter(row => matches(row.text)).map(row => row.id),
    total: matching.length,
    nextOffset:
      !filter?.countOnly && offset + rows.length < matching.length
        ? offset + rows.length
        : null,
  }
}
