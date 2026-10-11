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

const reference: Schema = {
  type: 'object',
  description: 'Reference to a contributing source record or curation.',
  properties: {
    dataset: text('Source dataset code.'),
    recordId: text('Record identifier within the source dataset.'),
    release: text('Source release code, when recorded.'),
    curation: text('Curation identifier, when the contribution comes from a curation.'),
    contributions: strings('Fields or aspects contributed by this source.'),
  },
  additionalProperties: true,
}

const hierarchyDescriptions: Record<string, string> = {
  administrative:
    'Official administrative divisions as recognised by the HKSAR Government. Each inner array is one path.',
  locality:
    'Provides the hierarchy within a distinct settlement (city, town, village or hamlet), including its neighbourhood hierarchy. Each inner array is one path.',
  landform:
    'Provides landform membership, including which island or island group a place belongs to. Currently, islands are the only recognised landforms. Each inner array is one path.',
  full: 'Combines the administrative, locality and landform hierarchies into one ordered hierarchy, placing each division at the appropriate level. For example, it inserts island landforms into the hierarchy and omits the city where it overlaps with the Area. Each inner array is one path.',
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
      'External identifiers keyed by their authority and identifier name, for example LANDSD:GEO_NAME_ID.',
    'x-additionalPropertiesName': 'identifier key',
    additionalProperties: text('Identifier assigned by the named authority.'),
  },
  memberships: {
    type: 'array',
    description: 'Memberships in geographic collections.',
    items: {
      type: 'object',
      additionalProperties: true,
      properties: {
        collection: text('Geographic collection identifier.'),
        key: text('Membership key within the collection.'),
        keyAuthority: text('Authority assigning the membership key.'),
        dataset: text('Dataset establishing the membership.'),
        recordId: text('Source record establishing the membership.'),
        release: text('Source release establishing the membership.'),
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
            'Whether the locale was inferred. Retained numeric flags use 0 for false and 1 for true.',
        },
      },
    },
  },
  sources: {
    type: 'object',
    description:
      'Source contributions grouped by provider, for example overture or saanseoi.',
    'x-additionalPropertiesName': 'provider',
    additionalProperties: { type: 'array', items: reference },
  },
}
