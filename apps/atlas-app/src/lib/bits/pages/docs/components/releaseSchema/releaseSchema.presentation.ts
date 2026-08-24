import type {
  ApiProfileName,
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

const divisionAttributesByProfile: Record<ApiProfileName, string[]> = {
  compact: ['level', 'type', 'divisionCode', 'i18n'],
  default: [
    'level',
    'type',
    'divisionCode',
    'wikidata',
    'createdAt',
    'updatedAt',
    'i18n',
  ],
  map: [
    'level',
    'type',
    'divisionCode',
    'wikidata',
    'createdAt',
    'updatedAt',
    'geometry',
    'bbox',
    'cartography',
    'i18n',
  ],
  full: [
    'level',
    'type',
    'divisionCode',
    'snapshotId',
    'geometry',
    'bbox',
    'cartography',
    'wikidata',
    'createdAt',
    'updatedAt',
    'sources',
    'identifiers',
    'overture',
    'i18n',
  ],
}

const addressAttributesByProfile: Record<ApiProfileName, string[]> = {
  compact: ['i18n'],
  default: ['createdAt', 'updatedAt', 'i18n'],
  map: ['createdAt', 'updatedAt', 'geometry', 'bbox', 'i18n'],
  full: [
    'snapshotId',
    'geometry',
    'bbox',
    'createdAt',
    'updatedAt',
    'identifiers',
    'sources',
    'i18n',
  ],
}

function retainProperties(schema: OpenApiSchema, names: string[]) {
  const allowed = new Set(names)
  const properties = Object.fromEntries(
    Object.entries(schema.properties ?? {}).filter(([name]) => allowed.has(name)),
  )
  const required = schema.required?.filter(name => allowed.has(name))

  return {
    ...schema,
    properties,
    ...(required?.length ? { required } : { required: undefined }),
  }
}

/**
 * OpenAPI documents describe every supported field. Profiles project the same resource
 * at runtime, so the release page narrows the displayed model to that projection.
 */
export function getProfileSchema(
  model: ReleaseSchemaModel,
  apiFamily: string,
  profile: ApiProfileName,
): ReleaseSchemaModel {
  const schemas = JSON.parse(JSON.stringify(model.schemas)) as Record<
    string,
    OpenApiSchema
  >

  if (apiFamily === 'divisions') {
    const attributes = schemas.DivisionAttributes
    const i18n = schemas.DivisionI18nAttributes
    if (attributes)
      schemas.DivisionAttributes = retainProperties(
        attributes,
        divisionAttributesByProfile[profile],
      )
    if (i18n && profile !== 'full')
      schemas.DivisionI18nAttributes = retainProperties(i18n, ['name'])
  }

  if (apiFamily === 'addresses') {
    const attributes = schemas.AddressAttributes
    const i18n = schemas.AddressI18nAttributes
    if (attributes)
      schemas.AddressAttributes = retainProperties(
        attributes,
        addressAttributesByProfile[profile],
      )
    if (i18n && profile !== 'full')
      schemas.AddressI18nAttributes = retainProperties(i18n, ['formattedAddress'])
  }

  return { ...model, schemas }
}
