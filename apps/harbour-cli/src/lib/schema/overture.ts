import {
  overtureSourceRecordSchemas,
  type ResourceType,
  type UploadInspection,
  type UploadPlan,
} from '@repo/core'

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
  type: ResourceType
  fields: UploadSchemaField[]
  allowedUnexpectedFields?: UploadSchemaField[]
}

type SchemaValidationResult = {
  schema: UploadSchemaVersion
}

const OVERTURE_SCHEMAS: UploadSchemaVersion[] = overtureSourceRecordSchemas

export function validateOvertureSchema(
  plan: UploadPlan,
  inspection: UploadInspection,
): SchemaValidationResult {
  const schema = resolveSchemaVersion(plan)
  const differences = diffSchema(
    schema.fields,
    inspection.schema,
    schema.allowedUnexpectedFields,
  )

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

    if (!matchesMonthWindow(plan.cohortKey, schema)) {
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
      `No accepted Overture schema version matches type=${plan.type}, cohortKey=${plan.cohortKey}, sourceVersion=${plan.sourceVersion}.`,
    )
  }

  throw new Error(
    `Multiple accepted Overture schema versions matched type=${plan.type}, cohortKey=${plan.cohortKey}, sourceVersion=${plan.sourceVersion}.`,
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
  actual: UploadInspection['schema'],
  allowedUnexpected: UploadSchemaField[] = [],
) {
  const differences: string[] = []
  const actualByName = new Map(actual.map(field => [field.name, field]))
  const expectedByName = new Map(expected.map(field => [field.name, field]))
  const allowedUnexpectedByName = new Map(
    allowedUnexpected.map(field => [field.name, field]),
  )

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
      const allowedField = allowedUnexpectedByName.get(field.name)

      if (
        allowedField &&
        allowedField.type === field.type &&
        allowedField.nullable === field.nullable
      ) {
        continue
      }

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
