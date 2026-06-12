import type { ParquetInspection, SupportedType, UploadPlan } from '@repo/core'

type SchemaWindow = {
  validFromVersion?: string
  validToVersion?: string
  validFromRelease?: string
  validToRelease?: string
}

type UploadSchemaField = {
  name: string
  type: string
  nullable: boolean
}

type UploadSchemaVersion = SchemaWindow & {
  id: string
  source: 'overture'
  type: SupportedType
  fields: UploadSchemaField[]
}

type SchemaValidationResult = {
  schema: UploadSchemaVersion
}

const OVERTURE_SCHEMAS: UploadSchemaVersion[] = [
  {
    id: 'overture-place-v2025-09-24.0',
    source: 'overture',
    type: 'place',
    validFromRelease: '2025-09-24.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'names', type: 'struct', nullable: true },
      { name: 'categories', type: 'struct', nullable: true },
      { name: 'confidence', type: 'double', nullable: true },
      { name: 'websites', type: 'list', nullable: true },
      { name: 'socials', type: 'list', nullable: true },
      { name: 'emails', type: 'list', nullable: true },
      { name: 'phones', type: 'list', nullable: true },
      { name: 'brand', type: 'struct', nullable: true },
      { name: 'addresses', type: 'list', nullable: true },
      { name: 'operating_status', type: 'utf8', nullable: true },
      { name: 'theme', type: 'utf8', nullable: true },
      { name: 'type', type: 'utf8', nullable: true },
    ],
  },
  {
    id: 'overture-address-v2025-09-24.0',
    source: 'overture',
    type: 'address',
    validFromRelease: '2025-09-24.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'country', type: 'utf8', nullable: true },
      { name: 'street', type: 'utf8', nullable: true },
      { name: 'number', type: 'utf8', nullable: true },
      { name: 'unit', type: 'utf8', nullable: true },
      { name: 'address_levels', type: 'list', nullable: true },
      { name: 'postal_city', type: 'utf8', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'theme', type: 'utf8', nullable: true },
      { name: 'type', type: 'utf8', nullable: true },
    ],
  },
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

export function validateOvertureSchema(
  plan: UploadPlan,
  inspection: ParquetInspection,
): SchemaValidationResult {
  const schema = resolveSchemaVersion(plan)
  const differences = diffSchema(schema.fields, inspection.schema)

  if (differences.length > 0) {
    throw new Error(
      [
        `Schema drift detected for ${plan.type} upload.`,
        `Expected schema version: ${schema.id}.`,
        'Differences:',
        ...differences.map(line => `- ${line}`),
      ].join('\n'),
    )
  }

  return { schema }
}

function resolveSchemaVersion(plan: UploadPlan): UploadSchemaVersion {
  const candidates = OVERTURE_SCHEMAS.filter(schema => {
    if (schema.source !== 'overture' || schema.type !== plan.type) {
      return false
    }

    if (!matchesMonthWindow(plan.snapshotMonth, schema)) {
      return false
    }

    if (!matchesReleaseWindow(plan.sourceVersion, schema)) {
      return false
    }

    return true
  })

  const [schema] = candidates

  if (candidates.length === 1 && schema) {
    return schema
  }

  if (candidates.length === 0) {
    throw new Error(
      `No accepted Overture schema version matches type=${plan.type}, snapshotMonth=${plan.snapshotMonth}, sourceVersion=${plan.sourceVersion}.`,
    )
  }

  throw new Error(
    `Multiple accepted Overture schema versions matched type=${plan.type}, snapshotMonth=${plan.snapshotMonth}, sourceVersion=${plan.sourceVersion}.`,
  )
}

function matchesMonthWindow(value: string, schema: SchemaWindow) {
  if (schema.validFromVersion && compareMonth(value, schema.validFromVersion) < 0) {
    return false
  }

  if (schema.validToVersion && compareMonth(value, schema.validToVersion) > 0) {
    return false
  }

  return true
}

function matchesReleaseWindow(value: string, schema: SchemaWindow) {
  if (schema.validFromRelease && compareRelease(value, schema.validFromRelease) < 0) {
    return false
  }

  if (schema.validToRelease && compareRelease(value, schema.validToRelease) > 0) {
    return false
  }

  return true
}

function compareMonth(left: string, right: string) {
  return left.localeCompare(right)
}

function compareRelease(left: string, right: string) {
  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  if (dateComparison !== 0) {
    return dateComparison
  }

  return Number(leftPatch) - Number(rightPatch)
}

function diffSchema(
  expected: UploadSchemaField[],
  actual: ParquetInspection['schema'],
) {
  const differences: string[] = []
  const actualByName = new Map(actual.map(field => [field.name, field]))
  const expectedByName = new Map(expected.map(field => [field.name, field]))

  for (const field of expected) {
    const actualField = actualByName.get(field.name)

    if (!actualField) {
      differences.push(
        `missing field \`${field.name}\` expected as ${renderField(field)}`,
      )
      continue
    }

    if (actualField.type !== field.type) {
      differences.push(
        `field \`${field.name}\` type mismatch: expected ${field.type}, actual ${actualField.type}`,
      )
    }

    if (actualField.nullable !== field.nullable) {
      differences.push(
        `field \`${field.name}\` nullability mismatch: expected ${renderNullability(field.nullable)}, actual ${renderNullability(actualField.nullable)}`,
      )
    }
  }

  for (const field of actual) {
    if (!expectedByName.has(field.name)) {
      differences.push(
        `unexpected field \`${field.name}\` present as ${renderField(field)}`,
      )
    }
  }

  return differences.sort()
}

function renderField(field: Pick<UploadSchemaField, 'name' | 'type' | 'nullable'>) {
  return `${field.type} (${renderNullability(field.nullable)})`
}

function renderNullability(nullable: boolean) {
  return nullable ? 'nullable' : 'required'
}
