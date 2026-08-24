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

/**
 * A schema for a string-keyed map can describe its value with
 * `additionalProperties`. When that value is an object, the presentation can show
 * its fields directly below the map without exposing OpenAPI's implementation term.
 */
export function getSchemaRecordValueSchema(
  schema: OpenApiSchema,
  schemas: Record<string, OpenApiSchema>,
) {
  if (
    Object.keys(schema.properties ?? {}).length ||
    typeof schema.additionalProperties !== 'object'
  ) {
    return null
  }

  const referenceName = getSchemaReferenceName(schema.additionalProperties.$ref)
  const valueSchema = referenceName
    ? schemas[referenceName]
    : schema.additionalProperties

  return Object.keys(valueSchema?.properties ?? {}).length ? valueSchema : null
}

function isNullSchema(schema: OpenApiSchema) {
  return (
    schema.type === 'null' ||
    (Array.isArray(schema.type) && schema.type.every(type => type === 'null'))
  )
}

export function getSchemaComposition(schema: OpenApiSchema) {
  return (schema.oneOf ?? schema.anyOf ?? schema.allOf ?? []).filter(
    schema => !isNullSchema(schema),
  )
}

export function isSchemaNullable(schema: OpenApiSchema) {
  return (
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null')) ||
    (schema.oneOf ?? schema.anyOf ?? schema.allOf ?? []).some(isNullSchema)
  )
}

export function getSchemaVariantName(schema: OpenApiSchema) {
  const type = schema.properties?.type
  const value = type?.const ?? (type?.enum?.length === 1 ? type.enum[0] : undefined)
  return typeof value === 'string' ? value : null
}

function isArraySchema(schema: OpenApiSchema) {
  return (
    schema.type === 'array' ||
    (Array.isArray(schema.type) && schema.type.includes('array'))
  )
}

function getSchemaTypeName(schema: OpenApiSchema) {
  const referenceName = getSchemaReferenceName(schema.$ref)
  if (referenceName) return referenceName

  const type = Array.isArray(schema.type)
    ? schema.type.filter(value => value !== 'null').join(' | ')
    : schema.type
  return type || null
}

/**
 * Compact arrays of scalar values into one readable sequence, retaining the terminal
 * item's description. Arrays of objects remain expandable so their fields are visible.
 */
export function getScalarArrayChain(schema: OpenApiSchema) {
  if (!isArraySchema(schema) || !schema.items) return null

  const types: string[] = []
  let item = schema
  let terminalDescription: string | undefined
  while (isArraySchema(item) && item.items) {
    types.push('array')
    if (types.length > 1 && item.description) terminalDescription = item.description
    item = item.items
  }

  if (
    isArraySchema(item) ||
    item.properties ||
    typeof item.additionalProperties === 'object' ||
    getSchemaComposition(item).length
  ) {
    return null
  }

  const itemType = getSchemaTypeName(item)
  if (!itemType) return null

  return {
    description: item.description ?? terminalDescription,
    types: [...types, itemType],
  }
}

/**
 * JSON:API relationship linkage is conventionally an object containing only a
 * `data` array. Present its useful shape inline, then expose the linkage item's
 * fields directly, rather than spending two rows on `data` and `items`.
 */
export function getSchemaDataArrayEnvelope(
  schema: OpenApiSchema,
  schemas: Record<string, OpenApiSchema>,
) {
  const entries = Object.entries(schema.properties ?? {})
  if (entries.length !== 1 || entries[0]?.[0] !== 'data') return null

  const dataSchema = entries[0][1]
  if (!isArraySchema(dataSchema) || !dataSchema.items) return null

  const referenceName = getSchemaReferenceName(dataSchema.items.$ref)
  const itemSchema = referenceName
    ? (schemas[referenceName] ?? dataSchema.items)
    : dataSchema.items
  const itemType = referenceName ?? getSchemaTypeName(itemSchema)
  if (!itemType) return null

  return {
    dataSchema,
    itemSchema,
    itemType,
    required: schema.required?.includes('data') ?? false,
  }
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
    'sourceKeys',
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
