import { describe, expect, test } from 'bun:test'

import {
  getSchemaDataArrayEnvelope,
  getOpenApiSchemaForFamily,
  getProfileSchema,
  getScalarArrayChain,
  getSchemaComposition,
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
              sourceKeys: { type: 'object' },
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
  ).toEqual(['geometry', 'level', 'sourceKeys', 'sources', 'type'])
})
