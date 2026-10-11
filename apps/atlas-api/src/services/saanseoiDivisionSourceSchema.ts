import { z } from '@hono/zod-openapi'
import { divisionTaxonomy } from '@repo/db'
import { DivisionHierarchiesSchema } from '../schema/divisions'

type Schema = {
  type?: string | string[]
  description?: string
  properties?: Record<string, Schema>
  items?: Schema
  additionalProperties?: boolean | Schema
  required?: string[]
  anyOf?: Schema[]
  [key: string]: unknown
}

const text = (description: string): Schema => ({ type: 'string', description })
const number = (description: string): Schema => ({ type: 'number', description })
const strings = (description: string): Schema => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

const numericLevels = [
  ...new Set(Object.values(divisionTaxonomy).map(value => value.level)),
]
  .filter(level => level !== null)
  .sort((a, b) => a - b)
const classesAtLevel = (level: number | null) =>
  Object.entries(divisionTaxonomy)
    .filter(([, value]) => value.level === level)
    .map(([name]) => `\`${name}\``)
    .join(', ')

const versionFreeReference = {
  not: {
    anyOf: [
      'release',
      'releaseCode',
      'sourceRelease',
      'sourceReleaseId',
      'sourceVersion',
    ].map(key => ({ required: [key] })),
  },
}

const reference: Schema = {
  ...versionFreeReference,
  type: 'object',
  description:
    'Contributing retained source record. Exact input versions and processing rules belong to release-set provenance.',
  required: ['dataset', 'recordId'],
  properties: {
    dataset: text('Source dataset code.'),
    recordId: text('Record identifier within the source dataset.'),
    componentIndexes: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      description: 'Selected component indexes in the retained full source geometry.',
      items: { type: 'integer', minimum: 0 },
    },
  },
  additionalProperties: false,
}

const hierarchyDescriptions: Record<string, string> = {
  administrative:
    'Official administrative divisions as recognised by the HKSAR Government. Each inner array is one path.',
  locality:
    'Provides the hierarchy within a distinct settlement (city, town, rural area, village or hamlet), including its neighbourhood hierarchy. Each inner array is one path.',
  landform:
    'Provides landform membership, including which island or island group a place belongs to. Currently, islands are the only recognised landforms. Each inner array is one path.',
  full: 'Combines the administrative, locality and landform hierarchies into one ordered hierarchy, placing each division at the appropriate level. It omits all city entries and the Hong Kong Island landform; other island landforms remain in the hierarchy. Each inner array is one path.',
}

const hierarchies = z.toJSONSchema(DivisionHierarchiesSchema) as Schema
hierarchies.description =
  'Stored ancestor paths, ordered from broadest to narrowest and excluding this division. Labels are retained from the selected release; they are not translated at request time.'
for (const [category, paths] of Object.entries(hierarchies.properties ?? {})) {
  paths.description = hierarchyDescriptions[category]
  const entry = paths.items?.items
  if (!entry?.properties) continue
  entry.properties.id!.description = 'Ancestor division identifier.'
  entry.properties.name!.description =
    'Stored display name. The intended format is Traditional Chinese followed by English, separated by a space, omitting missing or duplicate names.'
  entry.properties.class!.description = 'Ancestor division class.'
  entry.properties.fullContainment!.description =
    'Whether the ancestor covers the division’s entire canonical area, including boundaries and all polygon parts. False means some area lies outside; null or absent means unknown.'
}

/** Nested field contracts; top-level presence and nullability come from retained rows. */
export const saanseoiDivisionSourceFields: Record<string, Schema> = {
  divisionId: text('Identifier of the division represented by this geometry.'),
  isLand: {
    description:
      'Whether the geometry represents land, when known. Values are booleans; null or absent means unknown.',
  },
  isTerritorial: {
    description:
      'Whether the geometry represents the division’s territory, when known. Territorial geometry may include land and water; land-clipped geometry is not territorial. Values are booleans; null or absent means unknown.',
  },
  type: text(
    'Source geometry classification, for example land, maritime or mixed (land and water).',
  ),
  variant: text(
    'Provider and variant key for this geometry. Curated SaanSeoi geometry uses saanseoi; its land and territorial representations share this variant.',
  ),
  bbox: {
    type: 'array',
    items: { type: 'number' },
    minItems: 4,
    maxItems: 4,
    description:
      'Geographic bounding box [west, south, east, north] in longitude/latitude degrees.',
  },
  cartography: {
    type: 'object',
    description: 'Hints for displaying the division on a map.',
    properties: {
      minZoom: number('Minimum display zoom level.'),
      maxZoom: number('Maximum display zoom level.'),
      prominence: number('Relative cartographic prominence of the division.'),
    },
    additionalProperties: true,
  },
  category: {
    ...text('Broad geographic category of the division.'),
    enum: [...new Set(Object.values(divisionTaxonomy).map(value => value.category))],
  },
  class: {
    ...text('Specific geographic class of the division.'),
    enum: Object.keys(divisionTaxonomy),
  },
  divisionCode: {
    ...text(
      'Curated short code for the division, when assigned. 100% Coverage for Hong Kong and Kowloon.',
    ),
    examples: ['HKSAR', 'CW', 'SYP'],
  },
  level: {
    type: 'integer',
    enum: [...numericLevels, null],
    description: [
      'Hierarchy level for each division class:',
      ...numericLevels.map(level => `${level}: ${classesAtLevel(level)}.`),
      `Landforms (${classesAtLevel(null)}) have no numeric level (\`null\`).`,
    ].join('\n\n'),
  },
  hierarchies,
  identifiers: {
    type: 'object',
    description:
      'Identifiers grouped by publisher code and camelCase identifier type, for example hkgov-landsd.geoNameId and saanseoi.sourceId.',
    'x-additionalPropertiesName': 'publisher code',
    propertyNames: { pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
    additionalProperties: {
      type: 'object',
      'x-additionalPropertiesName': 'identifier type',
      propertyNames: { pattern: '^[a-z][a-zA-Z0-9]*$' },
      additionalProperties: {
        description: 'Identifier value, preserved as supplied.',
        anyOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
        ],
      },
    },
  },
  memberships: {
    type: 'array',
    description: 'Memberships in geographic collections.',
    items: {
      ...versionFreeReference,
      type: 'object',
      additionalProperties: true,
      properties: {
        collection: text('Geographic collection identifier.'),
        key: text('Membership key within the collection.'),
        keyAuthority: text('Authority assigning the membership key.'),
        dataset: text(
          'Dataset establishing the membership; resolve its version from the owning release sourceReleases metadata.',
        ),
        recordId: text('Source record establishing the membership.'),
      },
    },
  },
  names: {
    type: 'object',
    description: 'Names keyed by locale, for example en, zh-hant or zh-hans.',
    'x-recordKeyName': 'locale',
    additionalProperties: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: ['string', 'null'], description: 'Primary name in this locale.' },
        nameAlts: {
          description:
            'Other names for the same place in this language. Names are stored either as text separated by `|` or as a list.',
          anyOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
            { type: 'null' },
          ],
          examples: ['Name A|Name B', ['Name A', 'Name B']],
        },
        nameRules: {
          type: ['array', 'null'],
          description: 'Curated name values and their variant classifications.',
          items: {
            type: 'object',
            required: ['value', 'variant'],
            properties: {
              value: text('Name value to which the rule applies.'),
              variant: {
                type: ['string', 'null'],
                description: 'Name variant classification, when assigned.',
              },
            },
          },
        },
        isLocaleInferred: {
          type: ['boolean', 'number'],
          description:
            'Whether the locale was inferred. Values are booleans; null or absent means unknown.',
        },
      },
    },
  },
  sources: {
    type: 'object',
    description:
      'Retained source record references grouped by provider, for example overture or saanseoi.',
    'x-additionalPropertiesName': 'provider',
    additionalProperties: { type: 'array', items: reference },
  },
}
