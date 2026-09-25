import { readObject, readValue, serialise } from './objects'
import type { IndividualAudit, RuleDeclaration } from './auditTypes'
import type { ObjectRef, ProvenanceStore, JsonRecord } from './types'

/** Only references and an application count are retained; the fixture owns the decision. */
export type CurationApplication = {
  definition: ObjectRef
  fixture: { object: ObjectRef; pointer: string }
  applicationCount: number
}

export const curationApplicationId = (entry: CurationApplication) =>
  `${entry.definition.hash}:${entry.fixture.object.hash}:${entry.fixture.pointer}`

export function collectCurationApplication(
  entries: Map<string, CurationApplication>,
  action: IndividualAudit,
) {
  if (!action.fixture) throw new Error('Curation application requires a fixture.')
  const entry = {
    definition: action.definition,
    fixture: action.fixture,
    applicationCount: action.outcome === 'applied' ? 1 : 0,
  }
  const key = curationApplicationId(entry)
  const existing = entries.get(key)
  if (existing) existing.applicationCount += entry.applicationCount
  else entries.set(key, entry)
}

/** Audit presentation is assembled on demand and is never retained as a second record. */
export async function resolveCurationApplication(
  store: ProvenanceStore,
  entry: CurationApplication,
): Promise<IndividualAudit> {
  const declaration = (await readObject(
    store,
    entry.definition,
  )) as unknown as RuleDeclaration
  const value = await readValue(store, {
    ...entry.fixture.object,
    pointer: entry.fixture.pointer,
  })
  const fixture =
    value && typeof value === 'object' && !Array.isArray(value) ? value : { value }
  const id =
    fixture.canonicalId ??
    fixture.divisionId ??
    fixture.placeId ??
    fixture.id ??
    fixture.sourceRecordId ??
    entry.fixture.pointer
  return {
    id: curationApplicationId(entry),
    operation: declaration.id,
    ...(declaration.review ? { review: declaration.review } : {}),
    basis: 'fixture',
    outcome: entry.applicationCount ? 'applied' : 'unmatched',
    summary: declaration.summary,
    reason: typeof fixture.reason === 'string' ? fixture.reason : declaration.summary,
    definition: entry.definition,
    fixture: entry.fixture,
    record: { id: String(id), names: [], parents: [] },
    context: { applicationCount: entry.applicationCount, fixture } as JsonRecord,
  }
}

export function validateCurationApplications(value: unknown): CurationApplication[] {
  const chunk = value as {
    kind: string
    schemaVersion: number
    applications: CurationApplication[]
  }
  if (
    chunk?.kind !== 'curation-applications' ||
    chunk.schemaVersion !== 1 ||
    !Array.isArray(chunk.applications)
  )
    throw new Error('Invalid curation application references.')
  const seen = new Set<string>()
  for (const entry of chunk.applications) {
    if (
      !Number.isSafeInteger(entry.applicationCount) ||
      entry.applicationCount < 0 ||
      !entry.fixture ||
      typeof entry.fixture.pointer !== 'string' ||
      Object.keys(entry).some(
        key => !['definition', 'fixture', 'applicationCount'].includes(key),
      )
    )
      throw new Error('Invalid curation application.')
    const key = curationApplicationId(entry)
    if (seen.has(key)) throw new Error('Duplicate curation application.')
    seen.add(key)
  }
  return chunk.applications
}
