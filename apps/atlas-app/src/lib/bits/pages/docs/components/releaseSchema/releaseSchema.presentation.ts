import type {
  OpenApiDocument,
  OpenApiSchema,
  ReleaseSchemaModel,
} from './releaseSchema.types'

const schemaNamesByApiFamily: Record<string, string> = {
  addresses: 'Address',
  divisions: 'Division',
  places: 'Place',
  statistics: 'Statistic',
  streets: 'Street',
}

function isSchema(value: unknown): value is OpenApiSchema {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getOpenApiSchemaForFamily(
  document: OpenApiDocument,
  familyType: string,
): ReleaseSchemaModel | null {
  const schemas = document.components?.schemas
  if (!schemas) return null

  const preferredName = schemaNamesByApiFamily[familyType.toLowerCase()]
  const matchingName =
    (preferredName && isSchema(schemas[preferredName]) && preferredName) ||
    Object.keys(schemas).find(
      name => name.toLowerCase() === familyType.toLowerCase(),
    ) ||
    Object.keys(schemas).find(
      name => name.toLowerCase() === familyType.replace(/s$/i, '').toLowerCase(),
    )

  if (!matchingName) return null
  const schema = schemas[matchingName]
  if (!isSchema(schema)) return null

  return { name: matchingName, schema, schemas }
}

export function getSchemaReferenceName(reference: string | undefined) {
  const prefix = '#/components/schemas/'
  return reference?.startsWith(prefix) ? reference.slice(prefix.length) : null
}
