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
  stats: 'Statistic',
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

export function getSchemaComposition(schema: OpenApiSchema): OpenApiSchema[] {
  const members = schema.oneOf ?? schema.anyOf ?? schema.allOf ?? []
  return members
    .filter(member => !isNullSchema(member))
    .flatMap(member =>
      schema.anyOf && member.anyOf && Object.keys(member).every(key => key === 'anyOf')
        ? getSchemaComposition(member)
        : [member],
    )
}

/** Bare scalar alternatives are fully described by the parent type label. */
export function getExpandableSchemaComposition(schema: OpenApiSchema) {
  const members = getSchemaComposition(schema)
  const isBareValue = (value: OpenApiSchema): boolean => {
    if (Object.keys(value).some(key => key !== 'type' && key !== 'items')) return false
    if (value.type === 'array') return Boolean(value.items && isBareValue(value.items))
    return (
      typeof value.type === 'string' &&
      ['string', 'number', 'integer', 'boolean', 'null'].includes(value.type)
    )
  }
  return !schema.allOf && members.every(isBareValue) ? [] : members
}

/** Remove a nullable wrapper with just one non-null alternative. */
export function unwrapNullableSchema(schema: OpenApiSchema): OpenApiSchema {
  if (!schema.anyOf || schema.type || schema.properties) return schema
  const members = getSchemaComposition(schema)
  if (members.length !== 1) return schema
  const { anyOf: _alternatives, ...annotations } = schema
  return {
    ...unwrapNullableSchema(members[0]!),
    ...annotations,
    nullable: isSchemaNullable(schema) || isSchemaNullable(members[0]!),
  }
}

export function getSchemaTypeLabel(schema: OpenApiSchema): string {
  const scalarArray = getScalarArrayChain(schema)
  if (scalarArray) return scalarArray.types.join(' of ')
  const type = getSchemaTypeName(schema)
  if (type) return type
  const composition = getSchemaComposition(schema)
  if (composition.length)
    return schema.allOf
      ? 'intersection'
      : composition.map(getSchemaTypeLabel).join(' | ')
  return schema.properties || schema.additionalProperties ? 'object' : 'any value'
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
 * `data` array. Keep that field visible as a compact linkage container, then expose
 * the linkage item's fields directly rather than spending another row on `items`.
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
  compact: ['divisionCode', 'category', 'class', 'level', 'i18n', 'hierarchies'],
  default: [
    'divisionCode',
    'category',
    'class',
    'level',
    'i18n',
    'hierarchies',
    'identifiers',
    'createdAt',
    'updatedAt',
  ],
  map: [
    'divisionCode',
    'category',
    'class',
    'level',
    'i18n',
    'hierarchies',
    'geometry',
    'cartography',
    'identifiers',
    'createdAt',
    'updatedAt',
  ],
  full: [
    'divisionCode',
    'category',
    'class',
    'level',
    'i18n',
    'hierarchies',
    'geometry',
    'cartography',
    'identifiers',
    'sources',
    'snapshotId',
    'createdAt',
    'updatedAt',
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
    if (i18n && profile === 'compact')
      schemas.AddressI18nAttributes = retainProperties(i18n, ['formattedAddress'])
  }

  return { ...model, schemas }
}

/** Keep record timestamps after the descriptive fields at every object level. */
export function getOrderedSchemaProperties(schema: OpenApiSchema) {
  const rank = (name: string) =>
    name === 'createdAt' ? 1 : name === 'updatedAt' ? 2 : 0
  return Object.entries(schema.properties ?? {}).sort(
    ([left], [right]) => rank(left) - rank(right),
  )
}

/** Field-specific meaning takes precedence over an inherited type description. */
export function getSchemaDescription(
  schema: OpenApiSchema,
  displaySchema: OpenApiSchema,
) {
  const own = [
    schema.description,
    ...getSchemaComposition(schema).map(member => member.description),
  ].filter((value): value is string => Boolean(value))
  const descriptions = own.length
    ? own
    : [displaySchema.description, getScalarArrayChain(displaySchema)?.description]
  return [
    ...new Set(descriptions.filter((value): value is string => Boolean(value))),
  ].join(' ')
}
