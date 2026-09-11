import type { ResourceType } from './types'

export type { ResourceType } from './types'

export type SourceRecordSchemaField = {
  name: string
  nullable: boolean
  type: string
}

/**
 * The useful JSON Schema annotations from Overture's published schema.  The
 * source records retain Parquet values, so `fields` remains the authoritative
 * physical contract used during upload validation; this shape makes the
 * publisher's nested value definitions available to API documentation too.
 */
export type SourceRecordSchemaDefinition = {
  additionalProperties?: boolean | SourceRecordSchemaDefinition
  description?: string
  enum?: Array<string | number | boolean | null>
  format?: string
  items?: SourceRecordSchemaDefinition
  maximum?: number
  maxLength?: number
  minimum?: number
  minItems?: number
  minLength?: number
  pattern?: string
  properties?: Record<string, SourceRecordSchemaDefinition>
  required?: string[]
  type?: string
}

export type SourceRecordSchema = {
  fields: SourceRecordSchemaField[]
  id: string
  source: 'overture'
  type: ResourceType
  validFromRelease: string
  validToRelease?: string
}

/** Publisher columns represented by the public source-record envelope. */
export function sourceRecordRawPropertyFields(schema: SourceRecordSchema) {
  return schema.fields.filter(field => !['id', 'geometry'].includes(field.name))
}

const overtureDivisionAreaFields: SourceRecordSchemaField[] = [
  { name: 'id', type: 'utf8', nullable: true },
  { name: 'geometry', type: 'type', nullable: true },
  { name: 'bbox', type: 'struct', nullable: true },
  { name: 'country', type: 'utf8', nullable: true },
  { name: 'version', type: 'int_32', nullable: true },
  { name: 'sources', type: 'list', nullable: true },
  { name: 'subtype', type: 'utf8', nullable: true },
  { name: 'class', type: 'utf8', nullable: true },
  { name: 'names', type: 'struct', nullable: true },
  { name: 'division_id', type: 'utf8', nullable: true },
  { name: 'is_land', type: 'boolean', nullable: true },
  { name: 'is_territorial', type: 'boolean', nullable: true },
  { name: 'region', type: 'utf8', nullable: true },
  { name: 'theme', type: 'utf8', nullable: true },
  { name: 'type', type: 'utf8', nullable: true },
]

const overtureDivisionBoundaryFields: SourceRecordSchemaField[] = [
  { name: 'id', type: 'utf8', nullable: true },
  { name: 'geometry', type: 'type', nullable: true },
  { name: 'bbox', type: 'struct', nullable: true },
  { name: 'country', type: 'utf8', nullable: true },
  { name: 'version', type: 'int_32', nullable: true },
  { name: 'sources', type: 'list', nullable: true },
  { name: 'subtype', type: 'utf8', nullable: true },
  { name: 'class', type: 'utf8', nullable: true },
  { name: 'division_ids', type: 'list', nullable: true },
  { name: 'is_land', type: 'boolean', nullable: true },
  { name: 'is_territorial', type: 'boolean', nullable: true },
  { name: 'is_disputed', type: 'boolean', nullable: true },
  { name: 'perspectives', type: 'struct', nullable: true },
  { name: 'region', type: 'utf8', nullable: true },
  { name: 'theme', type: 'utf8', nullable: true },
  { name: 'type', type: 'utf8', nullable: true },
]

/**
 * Canonical source payload schemas. These are the same versioned field contracts
 * used to validate Overture uploads before their raw rows are persisted.
 */
export const overtureSourceRecordSchemas: SourceRecordSchema[] = [
  {
    id: 'overture-place-v2025-09-24.0',
    source: 'overture',
    type: 'place',
    validFromRelease: '2025-09-24.0',
    validToRelease: '2025-10-21.0',
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
    id: 'overture-place-v2025-10-22.0',
    source: 'overture',
    type: 'place',
    validFromRelease: '2025-10-22.0',
    validToRelease: '2025-12-16.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'names', type: 'struct', nullable: true },
      { name: 'categories', type: 'struct', nullable: true },
      { name: 'basic_category', type: 'utf8', nullable: true },
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
    id: 'overture-place-v2025-12-17.0',
    source: 'overture',
    type: 'place',
    validFromRelease: '2025-12-17.0',
    fields: [
      { name: 'id', type: 'utf8', nullable: true },
      { name: 'geometry', type: 'type', nullable: true },
      { name: 'bbox', type: 'struct', nullable: true },
      { name: 'version', type: 'int_32', nullable: true },
      { name: 'sources', type: 'list', nullable: true },
      { name: 'names', type: 'struct', nullable: true },
      { name: 'categories', type: 'struct', nullable: true },
      { name: 'basic_category', type: 'utf8', nullable: true },
      { name: 'taxonomy', type: 'struct', nullable: true },
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
  {
    id: 'overture-division-area-v2025-09-24.0',
    source: 'overture',
    type: 'divisionArea',
    validFromRelease: '2025-09-24.0',
    validToRelease: '2026-02-17.0',
    fields: overtureDivisionAreaFields,
  },
  {
    id: 'overture-division-area-v2026-02-18.0',
    source: 'overture',
    type: 'divisionArea',
    validFromRelease: '2026-02-18.0',
    fields: [
      ...overtureDivisionAreaFields,
      { name: 'admin_level', type: 'int_32', nullable: true },
    ],
  },
  {
    id: 'overture-division-boundary-v2025-09-24.0',
    source: 'overture',
    type: 'divisionBoundary',
    validFromRelease: '2025-09-24.0',
    validToRelease: '2026-02-17.0',
    fields: overtureDivisionBoundaryFields,
  },
  {
    id: 'overture-division-boundary-v2026-02-18.0',
    source: 'overture',
    type: 'divisionBoundary',
    validFromRelease: '2026-02-18.0',
    fields: [
      ...overtureDivisionBoundaryFields,
      { name: 'admin_level', type: 'int_32', nullable: true },
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

/**
 * Resolves the nested definition published by Overture for one retained source
 * field. These definitions are deliberately separate from the Parquet types in
 * `fields`: the former describes the source value, the latter validates the
 * value we actually ingested.
 */
export function resolveOvertureSourceRecordFieldDefinition(
  sourceSchema: SourceRecordSchema,
  field: SourceRecordSchemaField,
): SourceRecordSchemaDefinition | null {
  const definition = commonDefinitions[field.name]
  if (definition) return definition

  if (field.name === 'geometry') return geometryDefinition(sourceSchema.type)
  if (field.name === 'theme')
    return { enum: [themeFor(sourceSchema.type)], type: 'string' }
  if (field.name === 'type')
    return { enum: [typeFor(sourceSchema.type)], type: 'string' }

  return resourceDefinitions()[sourceSchema.type]?.[field.name] ?? null
}

const trimmedString: SourceRecordSchemaDefinition = {
  minLength: 1,
  pattern: '^(\\S.*)?\\S$',
  type: 'string',
}

const identifier: SourceRecordSchemaDefinition = {
  ...trimmedString,
  description:
    'A feature ID. It may be a Global Entity Reference System (GERS) ID only when the feature is part of GERS.',
}

const countryCode: SourceRecordSchemaDefinition = {
  description: 'ISO 3166-1 alpha-2 country code.',
  maxLength: 2,
  minLength: 2,
  pattern: '^[A-Z]{2}$',
  type: 'string',
}

const regionCode: SourceRecordSchemaDefinition = {
  description: 'ISO 3166-2 principal subdivision code.',
  maxLength: 6,
  minLength: 4,
  pattern: '^[A-Z]{2}-[A-Z0-9]{1,3}$',
  type: 'string',
}

const commonNames: SourceRecordSchemaDefinition = {
  additionalProperties: trimmedString,
  description: 'Common translations of the name, keyed by IETF BCP 47 language tag.',
  type: 'object',
}

const names: SourceRecordSchemaDefinition = {
  description: 'Names of the feature.',
  properties: {
    common: commonNames,
    primary: { description: 'The most commonly used name.', ...trimmedString },
    rules: {
      description: 'Additional name variants or scoped names.',
      items: {
        properties: {
          language: { description: 'An IETF BCP 47 language tag.', type: 'string' },
          value: trimmedString,
          variant: {
            enum: ['common', 'official', 'alternate', 'short'],
            type: 'string',
          },
        },
        required: ['variant', 'value'],
        type: 'object',
      },
      type: 'array',
    },
  },
  required: ['primary'],
  type: 'object',
}

const sourceItem: SourceRecordSchemaDefinition = {
  description: 'Source information for a property, using an RFC 6901 JSON Pointer.',
  properties: {
    confidence: { maximum: 1, minimum: 0, type: 'number' },
    dataset: { type: 'string' },
    license: {
      description: 'Licence name, normally an SPDX identifier.',
      type: 'string',
    },
    property: { type: 'string' },
    provider: {
      description: 'Contributor label, such as osm or esri.',
      type: 'string',
    },
    record_id: {
      description: 'Record ID in the contributing dataset.',
      type: 'string',
    },
    resource: { description: 'Subject of the contributed data.', type: 'string' },
    update_time: { format: 'date-time', type: 'string' },
    version: { description: 'Sortable source snapshot identifier.', type: 'string' },
  },
  required: ['property', 'dataset'],
  type: 'object',
}

const perspectives: SourceRecordSchemaDefinition = {
  description: 'Political perspectives from which a division is viewed.',
  properties: {
    countries: { items: countryCode, minItems: 1, type: 'array' },
    mode: { enum: ['accepted_by', 'disputed_by'], type: 'string' },
  },
  required: ['mode', 'countries'],
  type: 'object',
}

const commonDefinitions: Record<string, SourceRecordSchemaDefinition> = {
  bbox: {
    description: 'Bounding box of the feature geometry.',
    properties: {
      xmax: { type: 'number' },
      xmin: { type: 'number' },
      ymax: { type: 'number' },
      ymin: { type: 'number' },
    },
    required: ['xmin', 'ymin', 'xmax', 'ymax'],
    type: 'object',
  },
  country: countryCode,
  names,
  region: regionCode,
  sources: {
    description: 'Sources for this feature and its properties.',
    items: sourceItem,
    type: 'array',
  },
  version: {
    description:
      'Feature version, incremented in every Overture release that changed it.',
    type: 'integer',
  },
}

function resourceDefinitions(): Partial<
  Record<ResourceType, Record<string, SourceRecordSchemaDefinition>>
> {
  return {
    place: {
      addresses: {
        description: 'Addresses of the place.',
        items: {
          properties: {
            country: countryCode,
            freeform: { description: 'Free-form address information.', type: 'string' },
            locality: { description: 'City or neighbourhood name.', type: 'string' },
            postcode: { description: 'Postal code.', type: 'string' },
            region: regionCode,
          },
          type: 'object',
        },
        type: 'array',
      },
      basic_category: {
        description: 'Simplified basic-level category derived from categories.primary.',
        minLength: 1,
        pattern: '^[a-z0-9]+(_[a-z0-9]+)*$',
        type: 'string',
      },
      brand: {
        description:
          'Brand of the place. A location with multiple brands is represented by separate places.',
        properties: { names, wikidata: { pattern: '^Q\\d+', type: 'string' } },
        type: 'object',
      },
      categories: categoryDefinition('The categories of the place.', 'alternate'),
      confidence: {
        description: 'Confidence in the existence of the place, from 0 to 1.',
        type: 'number',
      },
      emails: uriListDefinition('Email addresses of the place.', 'email'),
      operating_status: {
        description: 'Operating status, not the opening status at this moment.',
        enum: ['open', 'permanently_closed', 'temporarily_closed'],
        type: 'string',
      },
      phones: uriListDefinition('Phone numbers of the place.'),
      socials: uriListDefinition('Social media URLs of the place.', 'uri'),
      taxonomy: {
        description: 'The place classification in the Overture taxonomy.',
        properties: {
          alternates: categoryListDefinition('Additional applicable categories.'),
          hierarchy: categoryListDefinition(
            'Ordered path from the most general to most specific category.',
          ),
          primary: categoryDefinition(
            'Most specific category in the taxonomy.',
            undefined,
          ),
        },
        required: ['primary', 'hierarchy'],
        type: 'object',
      },
      websites: uriListDefinition('Website URLs of the place.', 'uri'),
    },
    division: divisionDefinitions,
    divisionArea: divisionAreaDefinitions,
    divisionBoundary: divisionBoundaryDefinitions,
  }
}

function categoryDefinition(
  description: string,
  alternateProperty: string | undefined,
): SourceRecordSchemaDefinition {
  const category = {
    minLength: 1,
    pattern: '^[a-z0-9]+(_[a-z0-9]+)*$',
    type: 'string',
  } satisfies SourceRecordSchemaDefinition

  return alternateProperty
    ? {
        description,
        properties: {
          [alternateProperty]: {
            description: 'Additional applicable categories.',
            items: category,
            type: 'array',
          },
          primary: { description: 'Primary category of the place.', ...category },
        },
        required: ['primary'],
        type: 'object',
      }
    : { description, ...category }
}

function categoryListDefinition(description: string): SourceRecordSchemaDefinition {
  return { description, items: categoryDefinition('', undefined), type: 'array' }
}

function uriListDefinition(
  description: string,
  format?: string,
): SourceRecordSchemaDefinition {
  return { description, items: { format, type: 'string' }, type: 'array' }
}

const placetype: SourceRecordSchemaDefinition = {
  description: 'Division place type.',
  enum: [
    'country',
    'dependency',
    'macroregion',
    'region',
    'macrocounty',
    'county',
    'locality',
    'localadmin',
    'neighbourhood',
    'microhood',
  ],
  type: 'string',
}

const divisionClass: SourceRecordSchemaDefinition = {
  description: 'Settlement class of the division.',
  enum: ['megacity', 'city', 'town', 'village', 'hamlet'],
  type: 'string',
}

const cartography: SourceRecordSchemaDefinition = {
  description: 'Cartographic display hints.',
  properties: {
    max_zoom: { maximum: 23, minimum: 0, type: 'integer' },
    min_zoom: { maximum: 23, minimum: 0, type: 'integer' },
    prominence: { maximum: 100, minimum: 1, type: 'integer' },
    sort_key: { type: 'integer' },
  },
  type: 'object',
}

const hierarchy: SourceRecordSchemaDefinition = {
  items: {
    properties: { division_id: identifier, name: trimmedString, subtype: placetype },
    required: ['division_id', 'name', 'subtype'],
    type: 'object',
  },
  type: 'array',
}

const adminLevel: SourceRecordSchemaDefinition = {
  description: 'Administrative level, with 0 representing a country.',
  type: 'integer',
}

const divisionDefinitions: Record<string, SourceRecordSchemaDefinition> = {
  admin_level: adminLevel,
  capital_division_ids: {
    description: 'IDs of the division’s capital divisions.',
    items: identifier,
    type: 'array',
  },
  capital_of_divisions: {
    description: 'Divisions for which this division is a capital.',
    items: {
      properties: { division_id: identifier, subtype: placetype },
      required: ['division_id', 'subtype'],
      type: 'object',
    },
    type: 'array',
  },
  cartography: cartography,
  class: divisionClass,
  hierarchies: {
    description: 'Hierarchies in which this division participates.',
    items: hierarchy,
    type: 'array',
  },
  local_type: commonNames,
  norms: {
    description: 'Local norms useful to map-related use cases.',
    properties: { driving_side: { enum: ['left', 'right'], type: 'string' } },
    type: 'object',
  },
  parent_division_id: {
    description: 'ID of this division’s parent division.',
    ...identifier,
  },
  perspectives,
  population: { description: 'Population of the division.', type: 'integer' },
  subtype: placetype,
  wikidata: { pattern: '^Q\\d+', type: 'string' },
}

const divisionAreaDefinitions: Record<string, SourceRecordSchemaDefinition> = {
  admin_level: adminLevel,
  class: { enum: ['land', 'maritime'], type: 'string' },
  division_id: {
    description: 'ID of the division represented by this area.',
    ...identifier,
  },
  is_land: { description: 'Whether the geometry is land-clipped.', type: 'boolean' },
  is_territorial: {
    description: 'Whether the geometry approximates the maritime boundary.',
    type: 'boolean',
  },
  subtype: placetype,
}

const divisionBoundaryDefinitions: Record<string, SourceRecordSchemaDefinition> = {
  admin_level: adminLevel,
  class: { enum: ['administrative', 'land', 'maritime'], type: 'string' },
  division_ids: {
    description: 'IDs of divisions separated by this boundary.',
    items: identifier,
    type: 'array',
  },
  is_disputed: { description: 'Whether the boundary is disputed.', type: 'boolean' },
  is_land: { description: 'Whether this is a land boundary.', type: 'boolean' },
  is_territorial: {
    description: 'Whether this is a territorial boundary.',
    type: 'boolean',
  },
  perspectives,
  subtype: placetype,
}

function geometryDefinition(type: ResourceType): SourceRecordSchemaDefinition {
  const geometryTypes =
    type === 'place' || type === 'division'
      ? ['Point']
      : type === 'divisionArea'
        ? ['Polygon', 'MultiPolygon']
        : ['LineString', 'MultiLineString']

  return {
    description: `GeoJSON geometry. Overture requires ${geometryTypes.join(' or ')} for this feature type.`,
    properties: {
      coordinates: { description: 'GeoJSON coordinates.', type: 'array' },
      type: { enum: geometryTypes, type: 'string' },
    },
    required: ['type', 'coordinates'],
    type: 'object',
  }
}

function themeFor(type: ResourceType) {
  return type === 'place' ? 'places' : 'divisions'
}

function typeFor(type: ResourceType) {
  switch (type) {
    case 'divisionArea':
      return 'division_area'
    case 'divisionBoundary':
      return 'division_boundary'
    default:
      return type
  }
}

function compareRelease(left: string, right: string) {
  const [leftDate = left, leftPatch = '0'] = left.split('.')
  const [rightDate = right, rightPatch = '0'] = right.split('.')
  const dateComparison = leftDate.localeCompare(rightDate)

  return dateComparison === 0 ? Number(leftPatch) - Number(rightPatch) : dateComparison
}
