import type { ResourceType } from './types'

export type SourceRecordSchemaField = {
  name: string
  nullable: boolean
  type: string
}

export type SourceRecordSchema = {
  fields: SourceRecordSchemaField[]
  id: string
  source: 'overture'
  type: ResourceType
  validFromRelease: string
  validToRelease?: string
}

/**
 * Canonical source payload schemas. These are the same versioned field contracts
 * used to validate Overture uploads before their raw rows are persisted.
 */
export const overtureSourceRecordSchemas: SourceRecordSchema[] = [
  {
    id: 'overture-division-v2025-09-24.0',
    source: 'overture',
    type: 'division',
    validFromRelease: '2025-09-24.0',
    validToRelease: '2026-02-17.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'country', type: 'utf8', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'cartography', type: 'struct', nullable: true },
      { name: 'subtype', type: 'utf8', nullable: true },
      { name: 'class', type: 'utf8', nullable: true },
      { name: 'names', type: 'struct', nullable: true },
      { name: 'wikidata', type: 'utf8', nullable: true },
      { name: 'region', type: 'utf8', nullable: true },
      { name: 'perspectives', type: 'struct', nullable: true },
      { name: 'local_type', type: 'map', nullable: true },
      { name: 'hierarchies', type: 'list', nullable: true },
      { name: 'parent_division_id', type: 'utf8', nullable: true },
      { name: 'norms', type: 'struct', nullable: true },
      { name: 'population', type: 'int_32', nullable: true },
      { name: 'capital_division_ids', type: 'list', nullable: true },
      { name: 'capital_of_divisions', type: 'list', nullable: true },
      { name: 'theme', type: 'utf8', nullable: true },
      { name: 'type', type: 'utf8', nullable: true },
    ],
  },
  {
    id: 'overture-division-v2026-02-18.0',
    source: 'overture',
    type: 'division',
    validFromRelease: '2026-02-18.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'country', type: 'utf8', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'cartography', type: 'struct', nullable: true },
      { name: 'subtype', type: 'utf8', nullable: true },
      { name: 'class', type: 'utf8', nullable: true },
      { name: 'names', type: 'struct', nullable: true },
      { name: 'wikidata', type: 'utf8', nullable: true },
      { name: 'region', type: 'utf8', nullable: true },
      { name: 'perspectives', type: 'struct', nullable: true },
      { name: 'local_type', type: 'map', nullable: true },
      { name: 'hierarchies', type: 'list', nullable: true },
      { name: 'parent_division_id', type: 'utf8', nullable: true },
      { name: 'norms', type: 'struct', nullable: true },
      { name: 'population', type: 'int_32', nullable: true },
      { name: 'capital_division_ids', type: 'list', nullable: true },
      { name: 'capital_of_divisions', type: 'list', nullable: true },
      { name: 'admin_level', type: 'int_32', nullable: true },
      { name: 'theme', type: 'utf8', nullable: true },
      { name: 'type', type: 'utf8', nullable: true },
    ],
  },
]

export function resolveSourceRecordSchema({
  resourceType,
  source,
  sourceVersion,
}: {
  resourceType: ResourceType
  source: string
  sourceVersion: string
}): SourceRecordSchema | null {
  if (source !== 'overture') return null

  const candidates = overtureSourceRecordSchemas.filter(
    schema =>
      schema.type === resourceType &&
      compareRelease(sourceVersion, schema.validFromRelease) >= 0 &&
      (!schema.validToRelease ||
        compareRelease(sourceVersion, schema.validToRelease) <= 0),
  )

  return candidates.length === 1 ? (candidates[0] ?? null) : null
}

function compareRelease(left: string, right: string) {
  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  return dateComparison === 0 ? Number(leftPatch) - Number(rightPatch) : dateComparison
}
