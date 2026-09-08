import ruleFixture from '../../../../../fixtures/meta/processing-rules/division-classification.json'
import { ruleDeclarationFromFixture } from '../../provenance/ruleFixture'
import fixture from '../../../../../fixtures/meta/curations/overture-division-classification.json'
import { ProcessingGuardError } from '../../provenance/guards'
import { registerRule } from '../../provenance/auditTypes'
import { resolveSourceRecordSchema } from '../../sourceRecordSchemas'
import type { DatasetProcessingMessage } from '../../types'

type ClassificationSource = Pick<DatasetProcessingMessage, 'source' | 'sourceVersion'>

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

function applyClassification({
  row,
  source,
}: {
  row: Record<string, unknown>
  source?: ClassificationSource
}) {
  const entry = divisionClassificationFixture.entries.find(e => e.divisionId === row.id)
  if (!entry) return null
  const adminLevel = Number(row.admin_level ?? row.adminLevel)
  const schema =
    source && resolveSourceRecordSchema({ ...source, resourceType: 'division' })
  const adminLevelAbsentFromSchema =
    source?.source === 'overture' &&
    schema &&
    !schema.fields.some(field => field.name === 'admin_level')
  const adminLevelOmitted =
    !Object.hasOwn(row, 'admin_level') && !Object.hasOwn(row, 'adminLevel')
  if (
    (source && source.source !== 'overture') ||
    (row.source && row.source !== 'overture') ||
    (!(adminLevelAbsentFromSchema && adminLevelOmitted) &&
      adminLevel !== entry.expected.adminLevel) ||
    (row.class ?? null) !== entry.expected.class ||
    row.subtype !== entry.expected.subtype
  )
    throw new ProcessingGuardError(
      `Division classification guard mismatch: ${entry.id}.`,
      [
        {
          id: 'division-classification-expectations',
          summary:
            'The reviewed classification correction must match the current source identity and classification.',
          consequence: 'block-ingestion',
          status: 'failed',
          checked: 1,
          failed: 1,
          reason: `Source classification does not match fixture ${entry.id}.`,
        },
      ],
    )
  return { level: entry.replacement.level, type: entry.replacement.type as 'macrohood' }
}

export const divisionClassificationRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  applyClassification,
)

export function applyDivisionClassificationCuration(
  row: Record<string, unknown>,
  source?: ClassificationSource,
) {
  return divisionClassificationRule.execute({ row, source })
}
