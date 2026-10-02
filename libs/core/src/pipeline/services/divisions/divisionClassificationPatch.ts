import {
  geographicDivisionClassification,
  type GeographicDivisionClass,
} from '@repo/db'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/assembly/division-classification.json'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import fixture from '../../../../../../fixtures/meta/patches/overture-division-classification.json'
import { ProcessingGuardError } from '../../../provenance/guards'
import { registerRule } from '../../../provenance/auditTypes'
import { resolveSourceRecordSchema } from '../../../sourceRecordSchemas'
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
      !(e.expected?.adminLevel === null || Number.isInteger(e.expected?.adminLevel)) ||
      !(e.expected.class === null || typeof e.expected.class === 'string') ||
      !e.expected.subtype ||
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
  const rawAdminLevel = Object.hasOwn(row, 'admin_level')
    ? row.admin_level
    : row.adminLevel
  const adminLevel = rawAdminLevel == null ? null : Number(rawAdminLevel)
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
