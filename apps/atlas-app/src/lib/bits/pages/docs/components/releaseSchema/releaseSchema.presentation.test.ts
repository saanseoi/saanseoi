import { describe, expect, test } from 'bun:test'

import {
  getProfileSchema,
  getOpenApiSchemaForFamily,
  getSchemaReferenceName,
} from './releaseSchema.presentation'

describe('getOpenApiSchemaForFamily', () => {
  const document = {
    components: {
      schemas: {
        Division: { properties: { attributes: { type: 'object' } }, type: 'object' },
      },
    },
  }

  test('selects the canonical resource schema for a plural API family', () => {
    expect(getOpenApiSchemaForFamily(document, 'divisions')?.name).toBe('Division')
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
  ).toEqual(['geometry', 'level', 'sources', 'type'])
})
