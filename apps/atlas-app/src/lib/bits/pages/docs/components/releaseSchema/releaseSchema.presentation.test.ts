import { describe, expect, test } from 'bun:test'

import {
  getSchemaDataArrayEnvelope,
  getOpenApiSchemaForFamily,
  getProfileSchema,
  getScalarArrayChain,
  getSchemaComposition,
  getExpandableSchemaComposition,
  getSchemaTypeLabel,
  unwrapNullableSchema,
  getSchemaRecordValueSchema,
  getSchemaReferenceName,
  getSchemaVariantName,
  isSchemaNullable,
} from './releaseSchema.presentation'

describe('getOpenApiSchemaForFamily', () => {
  const document = {
    components: {
      schemas: {
        Division: { properties: { attributes: { type: 'object' } }, type: 'object' },
        Statistic: { properties: { attributes: { type: 'object' } }, type: 'object' },
      },
    },
  }

  test('selects the canonical resource schema for a plural API family', () => {
    expect(getOpenApiSchemaForFamily(document, 'divisions')?.name).toBe('Division')
  })

  test('selects the Statistic schema for the canonical stats API family', () => {
    expect(getOpenApiSchemaForFamily(document, 'stats')?.name).toBe('Statistic')
  })

  test('returns null when the document has no matching resource schema', () => {
    expect(getOpenApiSchemaForFamily(document, 'places')).toBeNull()
  })
})

test('getSchemaReferenceName returns component schema names only', () => {
  expect(getSchemaReferenceName('#/components/schemas/DivisionAttributes')).toBe(
    'DivisionAttributes',
  )
  expect(getSchemaReferenceName('#/components/parameters/pageLimit')).toBeNull()
})

test('separates a null union member from the displayed schema composition', () => {
  const schema = {
    anyOf: [
      {
        properties: { type: { enum: ['Point'] } },
        type: 'object',
      },
      { type: 'null' },
    ],
  }

  expect(isSchemaNullable(schema)).toBe(true)
  const composition = getSchemaComposition(schema)
  expect(composition).toHaveLength(1)
  expect(getSchemaVariantName(composition[0] ?? {})).toBe('Point')
})

test('summarises nested scalar arrays without discarding their terminal description', () => {
  expect(
    getScalarArrayChain({
      items: {
        items: {
          items: {
            items: { type: 'number' },
            description:
              'A coordinate position: longitude, latitude, and optionally elevation.',
            type: 'array',
          },
          type: 'array',
        },
        type: 'array',
      },
      type: 'array',
    }),
  ).toEqual({
    description:
      'A coordinate position: longitude, latitude, and optionally elevation.',
    types: ['array', 'array', 'array', 'array', 'number'],
  })
})

test('keeps arrays of objects expandable', () => {
  expect(
    getScalarArrayChain({
      items: { properties: { name: { type: 'string' } }, type: 'object' },
      type: 'array',
    }),
  ).toBeNull()
})

test('recognises a JSON:API data-array envelope', () => {
  expect(
    getSchemaDataArrayEnvelope(
      {
        properties: {
          data: {
            items: { properties: { id: { type: 'string' } }, type: 'object' },
            type: 'array',
          },
        },
        type: 'object',
      },
      {},
    ),
  ).toMatchObject({ itemType: 'object' })
})

test('unwraps the object value of a string-keyed map for presentation', () => {
  const valueSchema = { properties: { name: { type: 'string' } }, type: 'object' }
  const schemas = { DivisionI18nAttributes: valueSchema }

  expect(
    getSchemaRecordValueSchema(
      {
        additionalProperties: { $ref: '#/components/schemas/DivisionI18nAttributes' },
        type: 'object',
      },
      schemas,
    ),
  ).toBe(valueSchema)
})

test('narrows division attributes to the selected response profile', () => {
  const model = getOpenApiSchemaForFamily(
    {
      components: {
        schemas: {
          Division: { type: 'object' },
          DivisionAttributes: {
            properties: {
              geometry: { type: 'object' },
              level: { type: 'number' },
              sources: { type: 'object' },
              identifiers: { type: 'object' },
              type: { type: 'string' },
            },
            type: 'object',
          },
        },
      },
    },
    'divisions',
  )

  if (!model) throw new Error('Expected a division schema.')
  expect(
    Object.keys(
      getProfileSchema(model, 'divisions', 'compact').schemas.DivisionAttributes
        ?.properties ?? {},
    ),
  ).toEqual(['level', 'type'])
  expect(
    Object.keys(
      getProfileSchema(model, 'divisions', 'full').schemas.DivisionAttributes
        ?.properties ?? {},
    ).sort(),
  ).toEqual(['geometry', 'identifiers', 'level', 'sources', 'type'])
})

test('keeps parsed address components in every non-compact response profile', () => {
  const model = getOpenApiSchemaForFamily(
    {
      components: {
        schemas: {
          Address: { type: 'object' },
          AddressI18nAttributes: {
            properties: {
              buildingName: { type: 'string' },
              formattedAddress: { type: 'string' },
              streetName: { type: 'string' },
            },
            type: 'object',
          },
        },
      },
    },
    'addresses',
  )

  if (!model) throw new Error('Expected an address schema.')

  for (const profile of ['default', 'map', 'full'] as const) {
    expect(
      Object.keys(
        getProfileSchema(model, 'addresses', profile).schemas.AddressI18nAttributes
          ?.properties ?? {},
      ).sort(),
    ).toEqual(['buildingName', 'formattedAddress', 'streetName'])
  }
  expect(
    Object.keys(
      getProfileSchema(model, 'addresses', 'compact').schemas.AddressI18nAttributes
        ?.properties ?? {},
    ),
  ).toEqual(['formattedAddress'])
})

test('does not invent an object type for unspecified array items', () => {
  expect(getSchemaTypeLabel({})).toBe('any value')
  expect(getSchemaTypeLabel({ type: 'array', items: { type: 'number' } })).toBe(
    'array of number',
  )
})

test('flattens nullable alternatives and unwraps a single non-null alternative', () => {
  const names = {
    anyOf: [
      { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      { type: 'null' },
    ],
  }
  expect(getSchemaComposition(names)).toHaveLength(2)
  expect(getSchemaTypeLabel(names)).toBe('string | array of string')
  expect(isSchemaNullable(names)).toBe(true)
  expect(
    unwrapNullableSchema({
      anyOf: [
        {
          type: 'array',
          items: { type: 'object', properties: { value: { type: 'string' } } },
        },
        { type: 'null' },
      ],
    }),
  ).toMatchObject({
    type: 'array',
    nullable: true,
    items: { properties: { value: { type: 'string' } } },
  })
  const intersection = {
    allOf: [{ type: 'object' }, { properties: { id: { type: 'string' } } }],
  }
  expect(unwrapNullableSchema(intersection)).toEqual(intersection)
})

test('compacts only bare scalar alternatives without hiding constraints or object fields', () => {
  expect(
    getExpandableSchemaComposition({
      anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    }),
  ).toEqual([])
  for (const member of [
    { type: 'string', enum: ['official', 'alternate'] },
    { type: 'string', pattern: '^Q' },
    { type: 'object', properties: { value: { type: 'string' } } },
    { type: 'array', items: { type: 'string', description: 'Name value.' } },
  ]) {
    expect(
      getExpandableSchemaComposition({ anyOf: [{ type: 'string' }, member] }),
    ).toHaveLength(2)
  }
})
