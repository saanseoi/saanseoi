import { describe, expect, test } from 'bun:test'

import {
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
