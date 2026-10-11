import exclusions from '../../../../../../fixtures/meta/patches/overture-division-exclusions.json'
import { canonicalGeometryId } from '@repo/db'
import { divisionCuration } from './curationInventory'
import { ProcessingGuardError } from '../../../provenance/guards'

export const generatedDivisionId = (key: string) =>
  canonicalGeometryId('division', 'saanseoi', key)
const excludedIds = new Set(exclusions.entries.map(row => row.divisionId))
const curatedIds = new Set([
  ...divisionCuration.additions.entries.map(row => row.id),
  ...divisionCuration.classifications.entries.map(row => row.divisionId),
  ...divisionCuration.names.entries.map(row => row.divisionId),
])
const localDivisions = divisionCuration.additions.entries.filter(row =>
  row.id.startsWith('ss-'),
)
const normalise = (name: string) =>
  name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')

/** Primary/common names are candidates; publisher alternate names are not identity evidence. */
function sourceNames(row: Record<string, unknown>): string[] {
  const names = row.names as { primary?: string; common?: unknown } | undefined
  const values: string[] = names?.primary ? [names.primary] : []
  if (Array.isArray(names?.common)) {
    for (const item of names.common) {
      const value = Array.isArray(item) ? item[1] : item?.value
      if (typeof value === 'string') values.push(value)
    }
  } else if (names?.common && typeof names.common === 'object') {
    for (const value of Object.values(names.common))
      if (typeof value === 'string') values.push(value)
  }
  return values.map(normalise)
}

export function divisionGersUpgradeCandidates(
  rows: readonly Record<string, unknown>[],
) {
  const candidates: Array<{ divisionId: string; gersId: string; names: string[] }> = []
  for (const row of rows) {
    const id = String(row.id)
    // Existing curated identities (including Kwun Chung and Hok Tsui Tsuen) are distinct.
    if (
      curatedIds.has(id) ||
      excludedIds.has(id) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
      continue
    const names = new Set(sourceNames(row))
    for (const local of localDivisions) {
      const matches = [...new Set(Object.values(local.names))].filter(
        (name): name is string =>
          typeof name === 'string' && names.has(normalise(name)),
      )
      if (matches.length)
        candidates.push({ divisionId: local.id, gersId: id, names: matches })
    }
  }
  return candidates
}

export function requireDivisionIdentityReview(
  rows: readonly Record<string, unknown>[],
) {
  const candidates = divisionGersUpgradeCandidates(rows)
  if (!candidates.length) return
  const reason = `Review possible GERS upgrades before ingestion: ${candidates.map(candidate => `${candidate.divisionId} → ${candidate.gersId} (${candidate.names.join(', ')})`).join('; ')}`
  throw new ProcessingGuardError(reason, [
    {
      id: 'division-gers-upgrades',
      summary: 'Review publisher matches for SaanSeoi identities.',
      consequence: 'block-ingestion',
      status: 'failed',
      checked: rows.length,
      failed: candidates.length,
      reason,
    },
  ])
}
