import fixture from '../../../../../fixtures/meta/curations/overture-division-classification.json'

export function validateDivisionClassificationFixture(value: unknown) {
  const f = value as typeof fixture
  if (
    !f ||
    f.schemaVersion !== 1 ||
    f.kind !== 'division-classification-curations' ||
    !Array.isArray(f.entries)
  )
    throw new Error('Invalid division classification fixture.')
  const ids = new Set<string>()
  for (const e of f.entries) {
    if (
      !e.id ||
      !e.divisionId ||
      ids.has(e.divisionId) ||
      e.source !== 'overture' ||
      !Array.isArray(e.names) ||
      !e.names.length ||
      !e.names.every(n => typeof n === 'string' && n.length) ||
      !e.reason ||
      !Number.isInteger(e.expected?.adminLevel) ||
      !(e.expected.class === null || typeof e.expected.class === 'string') ||
      !e.expected.subtype ||
      e.replacement?.type !== 'macrohood' ||
      e.replacement.level !== 4
    )
      throw new Error('Invalid division classification curation entry.')
    ids.add(e.divisionId)
  }
  return f
}

export const divisionClassificationFixture =
  validateDivisionClassificationFixture(fixture)

export function applyDivisionClassificationCuration(row: Record<string, unknown>) {
  const entry = divisionClassificationFixture.entries.find(e => e.divisionId === row.id)
  if (!entry) return null
  const adminLevel = Number(row.admin_level ?? row.adminLevel)
  if (
    (row.source && row.source !== 'overture') ||
    adminLevel !== entry.expected.adminLevel ||
    (row.class ?? null) !== entry.expected.class ||
    row.subtype !== entry.expected.subtype
  )
    throw new Error(`Division classification guard mismatch: ${entry.id}.`)
  return { level: entry.replacement.level, type: entry.replacement.type as 'macrohood' }
}
