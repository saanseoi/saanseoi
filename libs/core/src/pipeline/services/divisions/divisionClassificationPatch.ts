import {
  geographicDivisionClassification,
  type GeographicDivisionClass,
} from '@repo/db'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/assembly/division-classification.json'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import fixture from '../../../../../../fixtures/meta/patches/overture-division-classification.json'
import { ProcessingGuardError } from '../../../provenance/guards'
import { registerRule } from '../../../provenance/auditTypes'
import type { DatasetProcessingMessage } from '../../../types'

type ClassificationSource = Pick<DatasetProcessingMessage, 'source' | 'sourceVersion'>

export function validateDivisionClassificationFixture(value: unknown) {
  const f = value as typeof fixture
  if (
    f?.schemaVersion !== 1 ||
    f.kind !== 'division-classification-patches' ||
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
      !geographicDivisionClassification(e.replacement?.class) ||
      e.replacement.level !==
        geographicDivisionClassification(e.replacement.class)?.level ||
      (e.replacement.nameEn != null &&
        (typeof e.replacement.nameEn !== 'string' || !e.replacement.nameEn.trim())) ||
      (e.replacement.nameAltsEn != null &&
        (!Array.isArray(e.replacement.nameAltsEn) ||
          e.replacement.nameAltsEn.length === 0 ||
          !e.replacement.nameAltsEn.every(
            name => typeof name === 'string' && name.trim().length > 0,
          ) ||
          new Set(e.replacement.nameAltsEn.map(name => name.trim())).size !==
            e.replacement.nameAltsEn.length)) ||
      (e.replacement.nameAltsZhHant != null &&
        (!Array.isArray(e.replacement.nameAltsZhHant) ||
          e.replacement.nameAltsZhHant.length === 0 ||
          !e.replacement.nameAltsZhHant.every(
            name => typeof name === 'string' && name.trim().length > 0,
          ) ||
          new Set(e.replacement.nameAltsZhHant.map(name => name.trim())).size !==
            e.replacement.nameAltsZhHant.length))
    )
      throw new Error('Invalid division classification patch entry.')
    ids.add(e.divisionId)
  }
  return f
}

export const divisionClassificationFixture =
  validateDivisionClassificationFixture(fixture)

function applyClassification({
  row,
  source,
}: {
  row: Record<string, unknown>
  source?: ClassificationSource
}) {
  const entry = divisionClassificationFixture.entries.find(e => e.divisionId === row.id)
  if (!entry) return null
  if (
    (source && source.source !== 'overture') ||
    (row.source && row.source !== 'overture')
  )
    throw new ProcessingGuardError(
      `Division classification guard mismatch: ${entry.id}.`,
      [
        {
          id: 'division-classification-expectations',
          summary:
            'The curated classification correction must match the publisher identity.',
          consequence: 'block-ingestion',
          status: 'failed',
          checked: 1,
          failed: 1,
          reason: `Source identity does not match fixture ${entry.id}.`,
        },
      ],
    )
  return {
    level: entry.replacement.level,
    class: entry.replacement.class as GeographicDivisionClass,
    ...(entry.replacement.nameEn ? { nameEn: entry.replacement.nameEn } : {}),
    ...(entry.replacement.nameAltsEn
      ? { nameAltsEn: entry.replacement.nameAltsEn.map(name => name.trim()) }
      : {}),
    ...(entry.replacement.nameAltsZhHant
      ? {
          nameAltsZhHant: entry.replacement.nameAltsZhHant.map(name => name.trim()),
        }
      : {}),
  }
}

export const divisionClassificationRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  applyClassification,
)

export function applyDivisionClassificationPatch(
  row: Record<string, unknown>,
  source?: ClassificationSource,
) {
  return divisionClassificationRule.execute({ row, source })
}

/** Fill an absent publisher class only from a reviewed major-island decision. */
export function applyMissingPublisherIslandClassification(
  row: Record<string, unknown>,
  source?: ClassificationSource,
) {
  if (
    (row.class != null && row.class !== '') ||
    (source && source.source !== 'overture') ||
    (row.source && row.source !== 'overture')
  )
    return null
  const entry = divisionClassificationFixture.entries.find(e => e.divisionId === row.id)
  if (entry?.replacement.class !== 'major_island') return null
  const correction = applyDivisionClassificationPatch(row, source)!
  return { class: correction.class, level: correction.level }
}
