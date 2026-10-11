import fixture from '../../../../../../fixtures/meta/patches/overture-division-exclusions.json'
import { ProcessingGuardError } from '../../../provenance/guards'
import type { DatasetProcessingMessage } from '../../../types'

type ExclusionSource = Pick<DatasetProcessingMessage, 'source' | 'sourceVersion'>
type ExclusionEntry = (typeof fixture.entries)[number]

export function validateDivisionExclusionFixture(value: unknown) {
  const f = value as typeof fixture
  if (
    f?.schemaVersion !== 1 ||
    f.kind !== 'division-exclusion-patches' ||
    !Array.isArray(f.entries)
  )
    throw new Error('Invalid division exclusion fixture.')
  const ids = new Set<string>()
  for (const entry of f.entries) {
    if (
      !entry.id ||
      !entry.divisionId ||
      ids.has(entry.divisionId) ||
      entry.source !== 'overture' ||
      !Array.isArray(entry.names) ||
      !entry.names.length ||
      !entry.names.every(name => typeof name === 'string' && name.length) ||
      !entry.reason ||
      !(
        entry.expected?.adminLevel === null ||
        Number.isInteger(entry.expected?.adminLevel)
      ) ||
      !(entry.expected?.class === null || typeof entry.expected?.class === 'string') ||
      !entry.expected?.subtype
    )
      throw new Error('Invalid division exclusion patch entry.')
    ids.add(entry.divisionId)
  }
  return f
}

export const divisionExclusionFixture = validateDivisionExclusionFixture(fixture)

export function applyDivisionExclusionPatch(
  row: Record<string, unknown>,
  source?: ExclusionSource,
): ExclusionEntry | null {
  const entry = divisionExclusionFixture.entries.find(
    item => item.divisionId === row.id,
  )
  if (!entry) return null
  const rawAdminLevel = Object.hasOwn(row, 'admin_level')
    ? row.admin_level
    : row.adminLevel
  const adminLevel = rawAdminLevel == null ? null : Number(rawAdminLevel)
  if (
    (source && source.source !== 'overture') ||
    (row.source && row.source !== 'overture') ||
    adminLevel !== entry.expected.adminLevel ||
    (row.class ?? null) !== entry.expected.class ||
    row.subtype !== entry.expected.subtype
  )
    throw new ProcessingGuardError(`Division exclusion guard mismatch: ${entry.id}.`, [
      {
        id: 'division-exclusion-expectations',
        summary:
          'The curated division exclusion must match the current source identity and classification.',
        consequence: 'block-ingestion',
        status: 'failed',
        checked: 1,
        failed: 1,
        reason: `Source classification does not match fixture ${entry.id}.`,
      },
    ])
  return entry
}
